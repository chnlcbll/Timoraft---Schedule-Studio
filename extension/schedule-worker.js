const MAX_RESULTS = 250;
const MAX_SEARCH_NODES = 250000;
const MAX_SEARCH_MS = 850;

function meetingsOverlap(one, two) {
  return one.day === two.day && one.start < two.end && two.start < one.end;
}

function conflictsWithEntries(entry, entries) {
  for (const existing of entries) {
    for (const one of existing.meetings) {
      for (const two of entry.meetings) if (meetingsOverlap(one, two)) return true;
    }
  }
  return false;
}

self.addEventListener("message", (event) => {
  const { requestId, courses = [], selected = {}, pinned = {} } = event.data || {};
  const startedAt = performance.now();
  let explored = 0;
  let truncated = false;

  try {
    const choices = courses.map((course) => {
      const enabled = new Set(selected[course.id] || []);
      const preferred = new Set(pinned[course.id] || []);
      const sections = course.sections.filter((section) => enabled.has(section.id)).map((section) => ({
        uid: `${course.id}:${section.id}`,
        courseId: course.id,
        code: course.code,
        title: course.title,
        section: section.name,
        units: Number(course.units) || 0,
        color: course.color,
        professor: section.professor,
        room: section.room,
        capacity: Number(section.capacity) || 0,
        enlisted: Number(section.enlisted) || 0,
        remarks: section.remarks || "",
        pinned: preferred.has(section.id),
        meetings: section.meetings.map((meeting) => ({ day: meeting.day, start: meeting.start, end: meeting.end })),
      })).sort((one, two) => Number(two.pinned) - Number(one.pinned));
      return { courseId: course.id, sections };
    }).filter((choice) => choice.sections.length).sort((one, two) => one.sections.length - two.sections.length);

    if (!choices.length) {
      self.postMessage({ requestId, results: [], explored, truncated: false, elapsed: performance.now() - startedAt });
      return;
    }

    const results = [];
    const walk = (index, entries) => {
      if (truncated || results.length >= MAX_RESULTS) return;
      explored += 1;
      if (explored >= MAX_SEARCH_NODES || (explored & 511) === 0 && performance.now() - startedAt >= MAX_SEARCH_MS) {
        truncated = true;
        return;
      }
      if (index === choices.length) {
        results.push({ id: `${requestId}:${results.length}`, entries: entries.slice() });
        return;
      }
      for (const entry of choices[index].sections) {
        if (!conflictsWithEntries(entry, entries)) walk(index + 1, [...entries, entry]);
        if (truncated || results.length >= MAX_RESULTS) break;
      }
    };

    walk(0, []);
    self.postMessage({ requestId, results, explored, truncated, elapsed: performance.now() - startedAt });
  } catch (error) {
    self.postMessage({ requestId, error: error.message || "Schedule generation failed" });
  }
});
