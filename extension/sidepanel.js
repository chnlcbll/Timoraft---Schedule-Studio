const ext = globalThis.chrome ?? globalThis.browser;
const STORAGE_KEY = "timoraft-state-v1";
const DAY_NAMES = { M: "Monday", T: "Tuesday", W: "Wednesday", H: "Thursday", F: "Friday", S: "Saturday", U: "Sunday" };
const DAY_ORDER = ["M", "T", "W", "H", "F", "S", "U"];
const VIEW_COPY = {
  builder: ["Schedule studio", "Build your week"],
  merge: ["Merge lab", "Layer two lives"],
  wallpaper: ["Wallpaper studio", "Design a clean weekly view"],
  library: ["Local archive", "Your saved weeks"],
};

const WALLPAPER_PALETTES = {
  paper: { bgA: "#f2f0e9", bgB: "#d8e0d4", textColor: "#20211f" },
  coast: { bgA: "#dce8ed", bgB: "#b9ccd5", textColor: "#16313d" },
  sage: { bgA: "#dfe5dc", bgB: "#aebfac", textColor: "#1f3023" },
  clay: { bgA: "#eee0d3", bgB: "#cda991", textColor: "#34241d" },
  night: { bgA: "#17243b", bgB: "#315174", textColor: "#f4f6f7" },
  mono: { bgA: "#eeeeea", bgB: "#c9c9c2", textColor: "#1b1c1a" },
};

const sampleCourses = () => [
  {
    id: crypto.randomUUID(), code: "CCPROG3", title: "Object-oriented programming", units: 3, color: "#ff8a65",
    sections: [
      section("S11", "M", "09:15", "10:45", "A. Reyes", "G304", [meeting("W", "09:15", "10:45")]),
      section("S12", "T", "11:00", "12:30", "M. Cruz", "Online", [meeting("H", "11:00", "12:30")]),
    ],
  },
  {
    id: crypto.randomUUID(), code: "STALGCM", title: "Statistical analysis", units: 3, color: "#ffd166",
    sections: [
      section("S21", "M", "11:00", "12:30", "C. Lim", "Y508", [meeting("W", "11:00", "12:30")]),
      section("S22", "T", "09:15", "10:45", "L. Tan", "Y506", [meeting("H", "09:15", "10:45")]),
    ],
  },
  {
    id: crypto.randomUUID(), code: "GEWORLD", title: "The contemporary world", units: 3, color: "#6ee7c2",
    sections: [
      section("Z31", "M", "14:30", "16:00", "R. Santos", "Online"),
      section("Z32", "F", "10:00", "13:00", "K. Dizon", "A703"),
    ],
  },
  {
    id: crypto.randomUUID(), code: "CSMATH1", title: "Discrete structures", units: 3, color: "#8ca7ff",
    sections: [
      section("S41", "T", "13:00", "14:30", "J. Co", "G302", [meeting("H", "13:00", "14:30")]),
      section("S42", "M", "16:15", "17:45", "P. Yu", "G301", [meeting("W", "16:15", "17:45")]),
    ],
  },
  {
    id: crypto.randomUUID(), code: "LASARE2", title: "Lasallian reflection", units: 1, color: "#d89cff",
    sections: [
      section("A01", "S", "09:00", "11:00", "F. Garcia", "LS Hall"),
      section("A02", "U", "10:00", "12:00", "E. Flores", "Online"),
    ],
  },
];

function meeting(day, start, end) { return { day, start: toMinutes(start), end: toMinutes(end) }; }
function section(name, day, start, end, professor = "", room = "", extra = []) {
  return { id: crypto.randomUUID(), name, professor, room, meetings: [meeting(day, start, end), ...extra] };
}

const defaultWallpaper = () => ({
  scheduleId: "current", title: "MY WEEK", subtitle: "Fall term", ratio: "16:9", layout: "board", font: "neo",
  cardStyle: "soft", palette: "paper", bgA: "#f2f0e9", bgB: "#d8e0d4", textColor: "#20211f",
  angle: 135, opacity: 92, radius: 12, clockSpace: 30, contentScale: 100, image: "", imagePalette: [],
  showTimes: true, showRooms: true, showProfessors: false, showBreaks: true, showSunday: false, showWatermark: true,
  textOverrides: {},
});

const defaults = () => {
  const courses = sampleCourses();
  return {
    courses,
    selected: Object.fromEntries(courses.map((course) => [course.id, []])),
    pinned: {}, collapsedCourses: [],
    saved: [], activeSchedule: 0, activeView: "builder", search: "",
    options: { showSaturday: true, showSunday: false, use24Hour: false, compact: false, theme: "light", railCollapsed: false },
    merge: { a: "", b: "", colorA: "#ff6b55", colorB: "#6ee7c2", showSunday: false },
    wallpaper: defaultWallpaper(),
    wallpaperDesigns: [], activeWallpaperDesignId: "", wallpaperDesignDirty: false,
    hub: { campusId: "", sessionId: "", lastSyncedAt: 0 },
  };
};

let state = defaults();
let generated = [];
let generationWorker;
let generationRequestId = 0;
let generationSignature = "";
let generationMeta = { loading: false, truncated: false, explored: 0, elapsed: 0 };
let saveTimer;
let toastTimer;
let pendingSaveMode = "current";
let hubData = { campuses: [], sessions: [], catalog: [] };
let hubRefreshBusy = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(minutes) {
  if (state.options.use24Hour) return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

function timeInputValue(minutes) {
  const value = Math.max(0, Math.min(1439, Number(minutes) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function meetingRoom(entry, meet) { return Object.hasOwn(meet || {}, "room") ? meet.room : entry.room; }
function meetingProfessor(entry, meet) { return Object.hasOwn(meet || {}, "professor") ? meet.professor : entry.professor; }

function editorTimeMinutes(value, fallback) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return fallback;
  const minutes = toMinutes(value);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : fallback;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return [hours && `${hours}h`, mins && `${mins}m`].filter(Boolean).join(" ") || "0m";
}

function formatBreakLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return [...(hours ? [`${hours} HR${hours === 1 ? "" : "S"}`] : []), ...(mins ? [`${mins} MIN`] : []), "BREAK"].join(" ");
}

function formatHourLabel(minutes) {
  if (state.options.use24Hour) return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`;
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12} ${hours >= 12 ? "PM" : "AM"}`;
}

function overlaps(a, b) { return a.day === b.day && a.start < b.end && b.start < a.end; }
function entriesConflict(a, b) { return a.meetings.some((one) => b.meetings.some((two) => overlaps(one, two))); }

function currentSelectionSignature() {
  return state.courses.map((course) => `${course.id}:${(state.selected[course.id] || []).slice().sort().join(",")}:${(state.pinned[course.id] || []).join(",")}`).join("|");
}

function finishScheduleGeneration(requestId, payload) {
  if (requestId !== generationRequestId) return;
  generationWorker?.terminate(); generationWorker = undefined;
  generated = Array.isArray(payload.results) ? payload.results : [];
  generationMeta = { loading: false, truncated: Boolean(payload.truncated), explored: Number(payload.explored) || 0, elapsed: Number(payload.elapsed) || 0, error: payload.error || "" };
  state.activeSchedule = Math.max(0, Math.min(state.activeSchedule, generated.length - 1));
  renderScheduleResults(); refreshScheduleSelects();
  if (state.activeView === "wallpaper" && state.wallpaper.scheduleId === "current") renderWallpaper();
  if (payload.error) toast("Schedule search recovered. Try fewer selected sections.");
}

function requestScheduleGeneration() {
  const signature = currentSelectionSignature();
  if (signature === generationSignature) return false;
  generationSignature = signature;
  generationRequestId += 1;
  const requestId = generationRequestId;
  generationWorker?.terminate();
  generated = [];
  generationMeta = { loading: true, truncated: false, explored: 0, elapsed: 0 };
  renderScheduleResults();
  try {
    generationWorker = new Worker("schedule-worker.js");
    generationWorker.addEventListener("message", (event) => finishScheduleGeneration(requestId, event.data || {}), { once: true });
    generationWorker.addEventListener("error", () => finishScheduleGeneration(requestId, { error: "The background schedule search could not start." }), { once: true });
    generationWorker.postMessage({ requestId, courses: state.courses, selected: state.selected, pinned: state.pinned });
  } catch (error) {
    finishScheduleGeneration(requestId, { error: error.message });
  }
  return true;
}

function currentSchedule() { return generated[state.activeSchedule] || { id: "empty", entries: [] }; }

async function storageGet() {
  try {
    if (ext?.storage?.local) return (await ext.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch { return null; }
}

async function storageSet(value) {
  if (ext?.storage?.local) await ext.storage.local.set({ [STORAGE_KEY]: value });
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function queueSave() {
  clearTimeout(saveTimer);
  $("#saveStatus").textContent = "Saving locally…";
  $("#saveStatus").classList.add("saving");
  saveTimer = setTimeout(async () => {
    await storageSet(state);
    $("#saveStatus").textContent = "All changes saved";
    $("#saveStatus").classList.remove("saving");
  }, 180);
}

function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2200);
}

function visibleDays(showSunday = state.options.showSunday) {
  return DAY_ORDER.filter((day) => (day !== "S" || state.options.showSaturday) && (day !== "U" || showSunday));
}

function scheduleStats(entries) {
  const meetings = entries.flatMap((entry) => entry.meetings);
  const units = entries.reduce((sum, entry) => sum + (Number(entry.units) || 0), 0);
  const first = meetings.length ? Math.min(...meetings.map((m) => m.start)) : 0;
  const last = meetings.length ? Math.max(...meetings.map((m) => m.end)) : 0;
  let gap = 0;
  for (const day of DAY_ORDER) {
    const list = meetings.filter((m) => m.day === day).sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) gap += Math.max(0, list[i].start - list[i - 1].end);
  }
  return { units, first, last, gap };
}

function dailyBreaks(entries, day, minimumMinutes = 15) {
  const meetings = entries.flatMap((entry) => entry.meetings.filter((item) => item.day === day)).sort((a, b) => a.start - b.start || a.end - b.end);
  if (meetings.length < 2) return [];
  const breaks = [];
  let end = meetings[0].end;
  for (let index = 1; index < meetings.length; index += 1) {
    const current = meetings[index];
    if (current.start - end >= minimumMinutes) breaks.push({ start: end, end: current.start, minutes: current.start - end });
    end = Math.max(end, current.end);
  }
  return breaks;
}

function layoutMeetingLanes(items, { minimumMinutes = 0, maxEnd = Number.POSITIVE_INFINITY } = {}) {
  const laneEnds = [];
  const placed = items.slice().sort((a, b) => a.meet.start - b.meet.start || a.meet.end - b.meet.end).map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.meet.start);
    if (lane < 0) lane = laneEnds.length;
    const displayEnd = Math.min(maxEnd, Math.max(item.meet.end, item.meet.start + minimumMinutes));
    laneEnds[lane] = displayEnd;
    return { ...item, lane, displayEnd };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return placed.map((item) => ({ ...item, laneCount }));
}

function calendarMarkup(entries, { showSunday = state.options.showSunday, merge = false } = {}) {
  const days = visibleDays(showSunday);
  if (!entries.length) return `<div class="calendar-empty"><div><strong>No valid schedule yet</strong>Select at least one section for each course. Conflicting combinations are removed automatically.</div></div>`;
  const startMinute = 7 * 60;
  const endMinute = 21 * 60;
  const bodyHeight = 690;
  const scale = bodyHeight / (endMinute - startMinute);
  const headers = days.map((day) => `<div class="day-head"><i class="day-dot"></i>${DAY_NAMES[day]}</div>`).join("");
  const timeLabels = Array.from({ length: 15 }, (_, i) => {
    const time = startMinute + i * 60;
    return `<span class="time-label" style="top:${(time - startMinute) * scale}px">${escapeHtml(formatTime(time))}</span>`;
  }).join("");
  const columns = days.map((day) => {
    const dayItems = entries.flatMap((entry) => entry.meetings.map((meet) => ({ entry, meet })))
      .filter(({ meet }) => meet.day === day)
      .sort((a, b) => a.meet.start - b.meet.start);
    const cards = layoutMeetingLanes(dayItems)
      .map(({ entry, meet, lane, laneCount }) => {
        const top = Math.max(0, (meet.start - startMinute) * scale);
        const height = Math.max(30, Math.min(endMinute, meet.end) - Math.max(startMinute, meet.start)) * scale;
        const sourceClass = entry.source === "B" ? " source-b" : "";
        const conflictClass = entry.conflict ? " conflict" : "";
        const laneStyle = merge ? `left:calc(${100 * lane / laneCount}% + 4px);width:calc(${100 / laneCount}% - 7px);right:auto;` : "";
        return `<article class="event-card${sourceClass}${conflictClass}" title="${escapeHtml(`${entry.code} · ${entry.section} · ${formatTime(meet.start)}–${formatTime(meet.end)}`)}" style="${laneStyle}top:${top}px;height:${height}px;background:${escapeHtml(entry.displayColor || entry.color)}">
          <b>${escapeHtml(entry.code)} · ${escapeHtml(entry.section)}</b>
          <span>${escapeHtml(formatTime(meet.start))}–${escapeHtml(formatTime(meet.end))}</span>
          <small>${escapeHtml(entry.room || entry.professor || "TBA")}</small>
        </article>`;
      }).join("");
    const breaks = merge ? "" : dailyBreaks(entries, day, 30).map((item) => {
      const top = Math.max(0, (item.start - startMinute) * scale);
      const height = Math.max(24, item.minutes * scale);
      return `<div class="break-card" style="top:${top}px;height:${height}px"><span>${escapeHtml(formatDuration(item.minutes))} break</span></div>`;
    }).join("");
    return `<div class="day-column">${breaks}${cards}</div>`;
  }).join("");
  return `<div class="calendar-grid${merge ? " merge-grid" : ""}" style="--day-count:${days.length}"><div class="corner-cell"></div>${headers}<div class="time-rail">${timeLabels}</div>${columns}</div>`;
}

function sectionSelectionStats() {
  const totalSections = state.courses.reduce((sum, course) => sum + course.sections.length, 0);
  const selectedSections = state.courses.reduce((sum, course) => {
    const available = new Set(course.sections.map((section) => section.id));
    return sum + (state.selected[course.id] || []).filter((id) => available.has(id)).length;
  }, 0);
  return { totalSections, selectedSections };
}

function updateSelectionToolbar() {
  const { totalSections, selectedSections } = sectionSelectionStats();
  $("#sectionSelectionCount").textContent = `${selectedSections} of ${totalSections} sections selected`;
  $("#selectAllSections").disabled = !totalSections || selectedSections === totalSections;
  $("#clearAllSections").disabled = !selectedSections;
}

function sectionAvailability(section) {
  const capacity = Math.max(0, Number(section.capacity) || 0);
  const enlisted = Math.max(0, Number(section.enlisted) || 0);
  const known = capacity > 0;
  return { capacity, enlisted, known, full: known && enlisted >= capacity, percent: known ? Math.min(100, Math.round(enlisted / capacity * 100)) : 0 };
}

function relativeSyncTime(value) {
  if (!Number(value)) return "Not synced yet";
  const seconds = Math.max(0, Math.round((Date.now() - Number(value)) / 1000));
  if (seconds < 45) return "Synced just now";
  if (seconds < 3600) return `Synced ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Synced ${Math.floor(seconds / 3600)}h ago`;
  return `Synced ${Math.floor(seconds / 86400)}d ago`;
}

function updateHubSyncRow() {
  const imported = state.courses.filter((course) => course.hubCourseId);
  const row = $("#hubSyncRow");
  row.hidden = !imported.length;
  if (!imported.length) return;
  const timestamps = imported.map((course) => Number(course.syncedAt) || 0).filter(Boolean);
  $("#hubSyncText").textContent = timestamps.length === imported.length ? relativeSyncTime(Math.min(...timestamps)) : `${timestamps.length}/${imported.length} Hub courses synced`;
  $("#refreshHubCourses").disabled = hubRefreshBusy;
  $("#refreshHubCourses").classList.toggle("is-loading", hubRefreshBusy);
}

function renderCourseList() {
  const query = state.search.trim().toLowerCase();
  const courses = state.courses.filter((course) => `${course.code} ${course.title}`.toLowerCase().includes(query));
  updateSelectionToolbar();
  $("#courseList").classList.toggle("compact", state.options.compact);
  $("#courseList").innerHTML = courses.length ? courses.map((course) => {
    const collapsed = state.collapsedCourses.includes(course.id);
    const pinned = new Set(state.pinned[course.id] || []);
    const sections = course.sections.slice().sort((one, two) => Number(pinned.has(two.id)) - Number(pinned.has(one.id)));
    return `
    <article class="course-card${collapsed ? " is-collapsed" : ""}" data-course-id="${course.id}">
      <div class="course-summary">
        <i class="course-swatch" style="background:${course.color}"></i>
        <div class="course-meta"><b>${escapeHtml(course.code)}</b><span>${escapeHtml(course.title)} · ${course.units} units${course.hubCourseId ? ` · ${escapeHtml(relativeSyncTime(course.syncedAt).replace("Synced ", ""))}` : ""}</span></div>
        <div class="course-actions">${course.hubCourseId ? `<button type="button" class="tiny-button refresh-course" aria-label="Refresh ${escapeHtml(course.code)} from Archer's Hub" title="Refresh from Archer's Hub">↻</button>` : ""}<button type="button" class="tiny-button collapse-course" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Expand" : "Minimize"} ${escapeHtml(course.code)}" title="${collapsed ? "Expand course" : "Minimize course"}">${collapsed ? "⌄" : "⌃"}</button><button type="button" class="tiny-button add-section" title="Add section" aria-label="Add section to ${escapeHtml(course.code)}">＋</button><button type="button" class="tiny-button delete-course" title="Delete course" aria-label="Delete ${escapeHtml(course.code)}">×</button></div>
      </div>
      <div class="section-list">
        <div class="section-selection-row"><span>${course.sections.length} section${course.sections.length === 1 ? "" : "s"}</span><div><button type="button" class="section-action select-course-sections">All</button><button type="button" class="section-action clear-course-sections">None</button></div></div>
        ${sections.map((item) => {
          const checked = (state.selected[course.id] || []).includes(item.id);
          const availability = sectionAvailability(item);
          const isPinned = pinned.has(item.id);
          return `<div class="section-row${isPinned ? " is-pinned" : ""}${availability.full ? " is-full" : ""}">
            <label class="section-choice"><input type="checkbox" data-section-id="${item.id}" ${checked ? "checked" : ""}/><span><b class="section-title">${escapeHtml(item.name)} · ${escapeHtml(item.professor || "TBA")}</b><small>${item.meetings.length ? item.meetings.map((m) => `${DAY_NAMES[m.day].slice(0,3)} ${formatTime(m.start)}`).join(" · ") : "Schedule TBA"}</small>${availability.known ? `<span class="enrollment"><span>${availability.full ? "Full · " : ""}${availability.enlisted}/${availability.capacity} students</span><progress max="${availability.capacity}" value="${Math.min(availability.enlisted, availability.capacity)}" aria-label="${availability.enlisted} of ${availability.capacity} students enrolled"></progress></span>` : ""}</span></label>
            <em>${escapeHtml(item.room || "TBA")}</em><button type="button" class="pin-section" data-section-id="${item.id}" aria-pressed="${isPinned}" aria-label="${isPinned ? "Unpin" : "Pin"} ${escapeHtml(course.code)} ${escapeHtml(item.name)}" title="${isPinned ? "Remove from top choices" : "Pin as a top choice"}">★</button>
          </div>`;
        }).join("")}
      </div>
    </article>`;
  }).join("") : `<div class="calendar-empty"><div><strong>No courses found</strong>Try another search.</div></div>`;
  $("#courseCount").textContent = state.courses.length;
  updateHubSyncRow();
}

function renderScheduleResults() {
  const calendar = $("#calendar");
  calendar.toggleAttribute("aria-busy", generationMeta.loading);
  calendar.dataset.generationState = generationMeta.loading ? "loading" : generationMeta.error ? "error" : "complete";
  calendar.dataset.generationElapsed = String(Math.round(generationMeta.elapsed || 0));
  calendar.dataset.generationExplored = String(generationMeta.explored || 0);
  calendar.dataset.generationTruncated = String(Boolean(generationMeta.truncated));
  if (generationMeta.loading) {
    $("#scheduleNumber").textContent = "Building schedules";
    $("#scheduleCount").textContent = "You can keep editing";
    $("#prevSchedule").disabled = true;
    $("#nextSchedule").disabled = true;
    $("#summaryStrip").innerHTML = `<span class="stat-pill generation-pill"><i></i>Checking combinations in the background</span>`;
    calendar.innerHTML = `<div class="calendar-empty generation-empty"><div><strong>Finding schedules…</strong>The controls stay available while Timoraft checks your sections.</div></div>`;
    return;
  }
  const schedule = currentSchedule();
  const stats = scheduleStats(schedule.entries);
  $("#scheduleNumber").textContent = generated.length ? `Schedule ${state.activeSchedule + 1}` : "No schedule";
  $("#scheduleCount").textContent = `of ${generated.length} combination${generated.length === 1 ? "" : "s"}`;
  $("#prevSchedule").disabled = generated.length < 2;
  $("#nextSchedule").disabled = generated.length < 2;
  $("#summaryStrip").innerHTML = [
    `<span class="stat-pill"><strong>${stats.units}</strong> units</span>`,
    `<span class="stat-pill">Starts <strong>${stats.first ? formatTime(stats.first) : "—"}</strong></span>`,
    `<span class="stat-pill">Ends <strong>${stats.last ? formatTime(stats.last) : "—"}</strong></span>`,
    `<span class="stat-pill">Breaks <strong>${formatDuration(stats.gap)}</strong></span>`,
    generated.length >= 250 ? `<span class="stat-pill">Showing first <strong>250</strong></span>` : "",
    generationMeta.truncated ? `<span class="stat-pill warning">Search limited for responsiveness · select fewer sections for a deeper search</span>` : "",
  ].join("");
  calendar.innerHTML = generationMeta.error
    ? `<div class="calendar-empty"><div><strong>Schedule search paused</strong>Try changing a selection to restart it.</div></div>`
    : generationMeta.truncated && !generated.length
      ? `<div class="calendar-empty"><div><strong>No schedule found within the quick search</strong>Deselect a few sections or courses to narrow the search.</div></div>`
      : calendarMarkup(schedule.entries);
}

function renderBuilder() {
  $("#sundayToggle").checked = state.options.showSunday;
  $("#optionsSundayToggle").checked = state.options.showSunday;
  $("#saturdayToggle").checked = state.options.showSaturday;
  $("#timeFormatToggle").checked = state.options.use24Hour;
  $("#compactToggle").checked = state.options.compact;
  renderCourseList();
  refreshScheduleSelects();
  if (!requestScheduleGeneration()) renderScheduleResults();
}

function savedOptionMarkup(includeCurrent = false) {
  return `${includeCurrent ? `<option value="current">Current builder schedule</option>` : ""}${state.saved.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
}

function refreshScheduleSelects() {
  const ids = new Set(state.saved.map((item) => item.id));
  if (!ids.has(state.merge.a)) state.merge.a = state.saved[0]?.id || "";
  if (!ids.has(state.merge.b)) state.merge.b = state.saved[1]?.id || state.saved[0]?.id || "";
  $("#mergeA").innerHTML = `<option value="">Choose schedule…</option>${savedOptionMarkup()}`;
  $("#mergeB").innerHTML = `<option value="">Choose schedule…</option>${savedOptionMarkup()}`;
  $("#mergeA").value = state.merge.a;
  $("#mergeB").value = state.merge.b;
  const hasMerge = Boolean(getSaved(state.merge.a) && getSaved(state.merge.b));
  $("#wallpaperSchedule").innerHTML = `${savedOptionMarkup(true)}${hasMerge ? `<option value="merged-current">Current merged view</option>` : ""}`;
  if (!new Set(["current", ...(hasMerge ? ["merged-current"] : []), ...ids]).has(state.wallpaper.scheduleId)) state.wallpaper.scheduleId = "current";
  $("#wallpaperSchedule").value = state.wallpaper.scheduleId;
}

function getSaved(id) { return state.saved.find((item) => item.id === id); }

function getMergedEntries() {
  const a = getSaved(state.merge.a);
  const b = getSaved(state.merge.b);
  if (!a || !b) return { entries: [], a, b, conflicts: 0 };
  const fromA = a.entries.map((entry) => ({ ...structuredClone(entry), source: "A", displayColor: state.merge.colorA }));
  const fromB = b.entries.map((entry) => ({ ...structuredClone(entry), source: "B", displayColor: state.merge.colorB }));
  let conflicts = 0;
  for (const sourceEntries of [fromA, fromB]) {
    for (let oneIndex = 0; oneIndex < sourceEntries.length; oneIndex += 1) {
      for (let twoIndex = oneIndex + 1; twoIndex < sourceEntries.length; twoIndex += 1) {
        const one = sourceEntries[oneIndex], two = sourceEntries[twoIndex];
        if (entriesConflict(one, two)) { one.conflict = true; two.conflict = true; conflicts += 1; }
      }
    }
  }
  return { entries: [...fromA, ...fromB], a, b, conflicts };
}

function renderMerge() {
  refreshScheduleSelects();
  $("#mergeColorA").value = state.merge.colorA;
  $("#mergeColorB").value = state.merge.colorB;
  $("#mergeSunday").checked = state.merge.showSunday;
  const { entries, a, b, conflicts } = getMergedEntries();
  $("#mergeTitle").textContent = a && b ? `${a.name} + ${b.name}` : "Choose two schedules";
  $("#mergeLegend").innerHTML = a && b ? `<span class="legend-item"><i style="background:${state.merge.colorA}"></i>${escapeHtml(a.name)}</span><span class="legend-item"><i style="background:${state.merge.colorB}"></i>${escapeHtml(b.name)}</span>` : "";
  $("#mergeStats").innerHTML = `<div class="merge-stat"><b>${entries.length}</b><span>course blocks</span></div><div class="merge-stat"><b>${conflicts}</b><span>same-schedule clashes</span></div>`;
  $("#mergeCalendar").innerHTML = a && b ? calendarMarkup(entries, { showSunday: state.merge.showSunday, merge: true }) : `<div class="calendar-empty"><div><strong>Your layers are empty</strong>Save at least two schedules, then choose them here.</div></div>`;
}

function wallpaperEntries() {
  if (state.wallpaper.scheduleId === "current") return currentSchedule().entries;
  if (state.wallpaper.scheduleId === "merged-current") return getMergedEntries().entries;
  return getSaved(state.wallpaper.scheduleId)?.entries || [];
}

function fontStack(font) {
  const stacks = {
    neo: `"Segoe UI Variable Display", "Segoe UI", Arial, sans-serif`,
    aptos: `"Aptos Display", Aptos, Calibri, sans-serif`,
    geometric: `"Century Gothic", Futura, Arial, sans-serif`,
    condensed: `Bahnschrift, "Arial Narrow", "Segoe UI", sans-serif`,
    humanist: `Aptos, "Trebuchet MS", Calibri, sans-serif`,
    editorial: `Georgia, "Times New Roman", serif`,
    classic: `"Palatino Linotype", Palatino, Georgia, serif`,
    literary: `Garamond, "Times New Roman", serif`,
    rounded: `"Arial Rounded MT Bold", "Trebuchet MS", sans-serif`,
    mono: `"Cascadia Mono", "SFMono-Regular", Consolas, monospace`,
  };
  return stacks[font] || stacks.neo;
}

function safeHex(value, fallback = "#20211f") {
  const match = String(value || "").trim().match(/^#?([\da-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function blendHex(color, target = "#ffffff", amount = .25) {
  const first = Number.parseInt(safeHex(color, "#7c8b84").slice(1), 16);
  const second = Number.parseInt(safeHex(target, "#ffffff").slice(1), 16);
  const channels = [16, 8, 0].map((shift) => Math.round(((first >> shift) & 255) * (1 - amount) + ((second >> shift) & 255) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function safeImageData(value) {
  return /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,[a-z\d+/=]+$/i.test(String(value || "")) ? value : "";
}

function migrateWallpaperOptions(input = {}) {
  const options = { ...defaultWallpaper(), ...input };
  if (options.font === "system") options.font = "neo";
  if (options.font === "serif") options.font = "editorial";
  options.bgA = safeHex(options.bgA, defaultWallpaper().bgA);
  options.bgB = safeHex(options.bgB, defaultWallpaper().bgB);
  options.textColor = safeHex(options.textColor, defaultWallpaper().textColor);
  options.clockSpace = Math.max(0, Math.min(44, Number(options.clockSpace) || 0));
  options.contentScale = Math.max(70, Math.min(115, Number(options.contentScale) || 100));
  options.image = safeImageData(options.image);
  options.imagePalette = Array.isArray(options.imagePalette) ? options.imagePalette.map((color) => safeHex(color, "")).filter(Boolean).slice(0, 6) : [];
  options.textOverrides = options.textOverrides && typeof options.textOverrides === "object" && !Array.isArray(options.textOverrides)
    ? Object.fromEntries(Object.entries(options.textOverrides).map(([key, fields = {}]) => {
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([field]) => ["code", "section", "title", "room", "professor"].includes(field)).map(([field, value]) => [field, String(value).slice(0, 100)]));
      if (fields.meetings && typeof fields.meetings === "object" && !Array.isArray(fields.meetings)) {
        cleaned.meetings = Object.fromEntries(Object.entries(fields.meetings).map(([index, meetingFields = {}]) => [index, Object.fromEntries(Object.entries(meetingFields).filter(([field]) => ["day", "start", "end", "room", "professor"].includes(field)).map(([field, value]) => [field, String(value).slice(0, 100)]))]));
      }
      return [key, cleaned];
    }))
    : {};
  const matchedPalette = Object.entries(WALLPAPER_PALETTES).find(([, palette]) => palette.bgA === options.bgA && palette.bgB === options.bgB && palette.textColor === options.textColor);
  const claimedPalette = WALLPAPER_PALETTES[options.palette];
  if (!claimedPalette || claimedPalette.bgA !== options.bgA || claimedPalette.bgB !== options.bgB || claimedPalette.textColor !== options.textColor) {
    options.palette = matchedPalette?.[0] || "custom";
    if (!input.textColor && (relativeLuminance(options.bgA) + relativeLuminance(options.bgB)) / 2 < .34) options.textColor = "#f4f6f2";
  }
  return options;
}

function cloneWallpaperOptions(options = state.wallpaper) {
  return migrateWallpaperOptions(structuredClone(options));
}

function migrateWallpaperDesigns(input) {
  if (!Array.isArray(input)) return [];
  return input.map((design) => ({
    id: typeof design?.id === "string" && design.id ? design.id : crypto.randomUUID(),
    name: String(design?.name || "Wallpaper design").trim().slice(0, 48) || "Wallpaper design",
    updatedAt: Number(design?.updatedAt) || Date.now(),
    options: migrateWallpaperOptions(design?.options),
  }));
}

function wallpaperColumnCount(options, dayCount) {
  if (options.layout === "agenda") return 1;
  if (options.layout === "split") return Math.min(2, dayCount);
  if (isPhoneRatio(options.ratio)) return Math.min(2, dayCount);
  if (options.ratio === "4:3" || options.ratio === "1:1") return Math.min(3, dayCount);
  return dayCount;
}

function isPhoneRatio(ratio) { return String(ratio).startsWith("9:"); }

function neonGroupSize(options, dayCount) {
  if (isPhoneRatio(options.ratio)) return Math.min(2, dayCount);
  if (options.ratio === "4:3" || options.ratio === "1:1") return Math.min(3, dayCount);
  return dayCount;
}

function gridCardMinimumMinutes(options) {
  const scale = Math.max(1, Math.min(1.15, options.contentScale / 100));
  if (options.ratio === "9:16") return Math.round(245 * scale);
  if (isPhoneRatio(options.ratio)) return Math.round(210 * scale);
  if (options.ratio === "4:3") return Math.round(180 * scale);
  if (options.ratio === "1:1") return Math.round(150 * scale);
  return Math.round(110 * scale);
}

function neonTimeRange(entries, options = null) {
  const meetings = entries.flatMap((entry) => entry.meetings || []);
  const minimum = options ? gridCardMinimumMinutes(options) : 0;
  const latest = meetings.length ? Math.max(...meetings.map((meeting) => Math.max(meeting.end, meeting.start + minimum))) : 19 * 60;
  return { start: 7 * 60, end: Math.min(21 * 60, Math.max(19 * 60, Math.ceil(latest / 60) * 60)) };
}

function chunkDays(days, size) {
  return Array.from({ length: Math.ceil(days.length / size) }, (_, index) => days.slice(index * size, (index + 1) * size));
}

function relativeLuminance(hex) {
  const value = Number.parseInt(safeHex(hex).slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const level = channel / 255;
    return level <= .03928 ? level / 12.92 : ((level + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastColor(hex) { return relativeLuminance(hex) > .42 ? "#171816" : "#ffffff"; }

function wallpaperCardTheme(color, options) {
  const courseColor = safeHex(color, "#7c8b84");
  if (options.cardStyle === "solid") return { fill: hexToRgba(courseColor, options.opacity / 100), text: contrastColor(courseColor), border: courseColor, accent: courseColor };
  if (options.cardStyle === "outline") return { fill: "transparent", text: options.textColor, border: hexToRgba(courseColor, .7), accent: courseColor };
  const surface = relativeLuminance(options.textColor) > .42 ? "#10110f" : "#ffffff";
  return { fill: hexToRgba(surface, options.opacity / 100), text: options.textColor, border: hexToRgba(options.textColor, .12), accent: courseColor };
}

function renderImagePalette() {
  const palette = state.wallpaper.imagePalette || [];
  $("#imagePalette").innerHTML = palette.length
    ? palette.map((color) => `<button type="button" class="palette-swatch" data-palette-color="${color}" title="Use ${color}" aria-label="Use extracted color ${color}" style="--swatch:${color}"></button>`).join("")
    : `<span class="palette-empty">Upload an image to sample its colors.</span>`;
  $("#removeWallpaperImage").hidden = !state.wallpaper.image;
}

function wallpaperEntryKey(entry, index) {
  return `${entry.source || "S"}:${entry.uid || `${entry.courseId || entry.code}:${entry.section || index}`}`;
}

function resolvedWallpaperEntries() {
  return wallpaperEntries().map((entry, index) => {
    const override = state.wallpaper.textOverrides?.[wallpaperEntryKey(entry, index)] || {};
    const resolved = { ...entry };
    for (const field of ["code", "section", "title", "room", "professor"]) if (Object.hasOwn(override, field)) resolved[field] = override[field];
    resolved.meetings = (entry.meetings || []).map((meet, meetingIndex) => {
      const meetingOverride = override.meetings?.[String(meetingIndex)] || {};
      const start = Object.hasOwn(meetingOverride, "start") ? editorTimeMinutes(meetingOverride.start, meet.start) : meet.start;
      const candidateEnd = Object.hasOwn(meetingOverride, "end") ? editorTimeMinutes(meetingOverride.end, meet.end) : meet.end;
      return {
        ...meet,
        day: DAY_ORDER.includes(meetingOverride.day) ? meetingOverride.day : meet.day,
        start,
        end: candidateEnd > start ? candidateEnd : meet.end > start ? meet.end : start + 30,
        room: Object.hasOwn(meetingOverride, "room") ? meetingOverride.room : meetingRoom(resolved, meet),
        professor: Object.hasOwn(meetingOverride, "professor") ? meetingOverride.professor : meetingProfessor(resolved, meet),
      };
    });
    return resolved;
  });
}

function renderWallpaperTextEditor() {
  const entries = wallpaperEntries();
  const editor = $("#wallpaperTextEditor");
  editor.innerHTML = entries.length ? entries.map((entry, index) => {
    const key = wallpaperEntryKey(entry, index);
    const override = state.wallpaper.textOverrides?.[key] || {};
    const value = (field) => Object.hasOwn(override, field) ? override[field] : entry[field] || "";
    const meetings = (entry.meetings || []).map((meet, meetingIndex) => {
      const meetingOverride = override.meetings?.[String(meetingIndex)] || {};
      const meetingValue = (field, fallback) => Object.hasOwn(meetingOverride, field) ? meetingOverride[field] : fallback;
      const room = Object.hasOwn(override, "room") ? override.room : meetingRoom(entry, meet) || "";
      const professor = Object.hasOwn(override, "professor") ? override.professor : meetingProfessor(entry, meet) || "";
      return `<section class="wallpaper-meeting-editor" data-wallpaper-meeting="${meetingIndex}" aria-label="${escapeHtml(`${DAY_NAMES[meet.day] || "Meeting"} meeting`)}">
        <strong>Meeting ${meetingIndex + 1} · ${escapeHtml(DAY_NAMES[meet.day] || "Choose day")}</strong>
        <div class="wallpaper-meeting-fields">
          <label>Day<select data-meeting-field="day">${DAY_ORDER.map((day) => `<option value="${day}"${meetingValue("day", meet.day) === day ? " selected" : ""}>${DAY_NAMES[day]}</option>`).join("")}</select></label>
          <label>Starts<input type="time" data-meeting-field="start" value="${escapeHtml(meetingValue("start", timeInputValue(meet.start)))}" /></label>
          <label>Ends<input type="time" data-meeting-field="end" value="${escapeHtml(meetingValue("end", timeInputValue(meet.end)))}" /></label>
          <label>Room / mode<input data-meeting-field="room" value="${escapeHtml(meetingValue("room", room))}" placeholder="Online, room, or TBA" /></label>
          <label class="wide">Professor<input data-meeting-field="professor" value="${escapeHtml(meetingValue("professor", professor))}" placeholder="TBA" /></label>
        </div>
      </section>`;
    }).join("");
    return `<fieldset class="wallpaper-entry-editor" data-wallpaper-entry="${escapeHtml(key)}"><legend>${escapeHtml(`${entry.code || "Course"} · ${entry.section || "Section"}`)}</legend><div class="wallpaper-entry-fields">
      <label>Course code<input data-text-field="code" value="${escapeHtml(value("code"))}" /></label>
      <label>Section<input data-text-field="section" value="${escapeHtml(value("section"))}" /></label>
      <label class="wide">Course title<input data-text-field="title" value="${escapeHtml(value("title"))}" /></label>
    </div><div class="wallpaper-meeting-list">${meetings}</div></fieldset>`;
  }).join("") : `<p class="palette-empty">Choose a schedule with sections to edit its export text.</p>`;
}

function wallpaperEventMarkup(entry, meet, options, extraStyle = "", compactDetails = false) {
  const theme = wallpaperCardTheme(entry.displayColor || entry.color, options);
  const label = entry.section ? `${entry.code} · ${entry.section}` : entry.code;
  const time = options.showTimes ? `<span>${escapeHtml(`${formatTime(meet.start)}–${formatTime(meet.end)}`)}</span>` : "";
  const place = [options.showRooms ? meetingRoom(entry, meet) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meet) || "TBA" : ""].filter(Boolean).join(" · ");
  const details = compactDetails ? [time, place ? `<span>${escapeHtml(place)}</span>` : ""].filter(Boolean).join("") : [time, options.showRooms ? `<span>${escapeHtml(meetingRoom(entry, meet) || "TBA")}</span>` : "", options.showProfessors ? `<span>${escapeHtml(meetingProfessor(entry, meet) || "TBA")}</span>` : ""].filter(Boolean).join("");
  const heading = compactDetails ? [entry.code, entry.title].filter(Boolean).join(" - ") : entry.code;
  return `<article class="wallpaper-event style-${options.cardStyle}${compactDetails ? " compact-detail" : ""}${entry.source ? ` source-${entry.source.toLowerCase()}` : ""}" style="${extraStyle}--card-fill:${theme.fill};--card-text:${theme.text};--card-border:${theme.border};--card-accent:${theme.accent};--card-radius:${options.radius}px" title="${escapeHtml(label)}">
    <div class="wallpaper-event-head"><b>${escapeHtml(heading)}</b><strong>${escapeHtml(entry.section || "")}</strong></div>
    ${details ? `<div class="wallpaper-event-meta">${details}</div>` : ""}
    ${entry.title && !compactDetails ? `<i class="wallpaper-course-title">${escapeHtml(entry.title)}</i>` : ""}
  </article>`;
}

function wallpaperTimelineDayMarkup(entries, day, options) {
  const startMinute = 7 * 60, endMinute = 21 * 60, span = endMinute - startMinute;
  const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meet) => meet.day === day).map((meet) => ({ entry, meet }))), { minimumMinutes: Math.round(gridCardMinimumMinutes(options) * 1.2), maxEnd: endMinute });
  const events = items.map(({ entry, meet, lane, laneCount, displayEnd }) => {
    const top = Math.max(0, (meet.start - startMinute) / span * 100);
    const height = Math.max(2.8, (Math.min(endMinute, displayEnd) - Math.max(startMinute, meet.start)) / span * 100);
    const width = 100 / laneCount;
    return wallpaperEventMarkup(entry, meet, options, `top:${top}%;height:${height}%;left:${lane * width}%;width:calc(${width}% - 2px);`, true);
  }).join("");
  const breaks = options.showBreaks ? dailyBreaks(entries, day, 30).map((item) => {
    const top = (item.start - startMinute) / span * 100;
    const height = item.minutes / span * 100;
    return `<div class="wallpaper-break" style="top:${top}%;height:${height}%"><span>${escapeHtml(formatDuration(item.minutes))}</span></div>`;
  }).join("") : "";
  return `<section class="wallpaper-day wallpaper-timeline-day"><h4>${DAY_NAMES[day]}</h4><div class="wallpaper-timeline-track">${breaks}${events}</div></section>`;
}

function neonEventMarkup(entry, meet, lane, laneCount, options, range, displayEnd = meet.end) {
  const color = safeHex(entry.displayColor || entry.color, "#75f27b");
  const top = Math.max(0, (meet.start - range.start) / (range.end - range.start) * 100);
  const height = Math.max(1.2, (Math.min(range.end, displayEnd) - Math.max(range.start, meet.start)) / (range.end - range.start) * 100);
  const width = 100 / laneCount;
  const time = options.showTimes ? `${formatTime(meet.start)}–${formatTime(meet.end)}` : "";
  const place = [options.showRooms ? meetingRoom(entry, meet) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meet) || "TBA" : ""].filter(Boolean).join(" · ");
  return `<article class="neon-event" style="--event-color:${color};top:${top}%;height:${height}%;left:calc(${lane * width}% + 2px);width:calc(${width}% - 4px)" title="${escapeHtml(`${entry.code} · ${entry.section} · ${formatTime(meet.start)}–${formatTime(meet.end)}`)}">
    <div><b>${escapeHtml(entry.code || "COURSE")}</b>${entry.title ? `<i class="neon-course-title">– ${escapeHtml(entry.title)}</i>` : ""}<strong>${escapeHtml(entry.section || "")}</strong></div>
    ${time ? `<span>${escapeHtml(time)}</span>` : ""}${place ? `<span>${escapeHtml(place)}</span>` : ""}
  </article>`;
}

function neonGridGroupMarkup(entries, group, options, range) {
  const span = range.end - range.start;
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, index) => range.start + index * 60);
  const labels = hours.map((minute, index) => `<span class="neon-time-label${index === hours.length - 1 ? " edge" : ""}" style="--time-top:${(minute - range.start) / span * 100}%">${escapeHtml(formatHourLabel(minute))}</span>`).join("");
  const tracks = group.map((day) => {
    const breaks = options.showBreaks ? dailyBreaks(entries, day, 30).map((item) => {
      const top = Math.max(0, (item.start - range.start) / span * 100);
      const height = Math.max(1, (Math.min(range.end, item.end) - Math.max(range.start, item.start)) / span * 100);
      return `<div class="neon-break" style="top:${top}%;height:${height}%"><span>${escapeHtml(formatBreakLabel(item.minutes))}</span></div>`;
    }).join("") : "";
    const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meet) => meet.day === day).map((meet) => ({ entry, meet }))), { minimumMinutes: gridCardMinimumMinutes(options), maxEnd: range.end });
    return `<div class="neon-day-track">${breaks}${items.map(({ entry, meet, lane, laneCount, displayEnd }) => neonEventMarkup(entry, meet, lane, laneCount, options, range, displayEnd)).join("")}</div>`;
  }).join("");
  return `<section class="neon-grid-group" style="--group-days:${group.length};--hour-count:${hours.length - 1}">
    <div class="neon-corner"></div>${group.map((day) => `<div class="neon-day-name">${escapeHtml(DAY_NAMES[day])}</div>`).join("")}
    <div class="neon-time-rail">${labels}</div>${tracks}
  </section>`;
}

function neonGridPreviewMarkup(entries, days, options) {
  const groupSize = neonGroupSize(options, days.length);
  const groups = chunkDays(days, Math.max(1, groupSize));
  const range = neonTimeRange(entries, options);
  const stats = scheduleStats(entries);
  const maxEvents = Math.max(1, ...days.map((day) => entries.reduce((sum, entry) => sum + entry.meetings.filter((meeting) => meeting.day === day).length, 0)));
  const density = Math.max(.66, Math.min(1, 4 / maxEvents)) * options.contentScale / 100;
  return `<div class="wallpaper-inner neon-grid-inner" style="--clock-space:${options.clockSpace}%;--card-scale:${density}">
    ${isPhoneRatio(options.ratio) ? `<div class="phone-clock-safe" aria-hidden="true"></div>` : ""}
    <header class="neon-title"><h3>${escapeHtml(options.title || "WEEKLY SCHEDULE")}</h3>${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}</header>
    <div class="neon-grid-groups" style="--neon-group-count:${groups.length}">${groups.map((group) => neonGridGroupMarkup(entries, group, options, range)).join("")}</div>
    <footer class="neon-footer"><span>${stats.units} UNITS</span>${options.showWatermark ? `<span>BUILT WITH <b>TIMORAFT</b></span>` : ""}</footer>
  </div>`;
}

function pastelGridEventMarkup(entry, meet, lane, laneCount, options, range, displayEnd = meet.end) {
  const fill = blendHex(entry.displayColor || entry.color, "#ffffff", .3);
  const top = Math.max(0, (meet.start - range.start) / (range.end - range.start) * 100);
  const height = Math.max(1.2, (Math.min(range.end, displayEnd) - Math.max(range.start, meet.start)) / (range.end - range.start) * 100);
  const width = 100 / laneCount;
  return `<article class="pastel-grid-event" style="--pastel-fill:${fill};top:${top}%;height:${height}%;left:calc(${lane * width}% + 3px);width:calc(${width}% - 6px)" title="${escapeHtml(`${entry.code} · ${entry.section} · ${formatTime(meet.start)}–${formatTime(meet.end)}`)}">
    <div><b>${escapeHtml(entry.code || "COURSE")}</b>${entry.title ? `<i class="pastel-course-title">– ${escapeHtml(entry.title)}</i>` : ""}<strong>${escapeHtml(entry.section || "")}</strong></div>
    ${options.showTimes ? `<span>${escapeHtml(`${formatTime(meet.start)}–${formatTime(meet.end)}`)}</span>` : ""}
    ${options.showRooms || options.showProfessors ? `<span>${escapeHtml([options.showRooms ? meetingRoom(entry, meet) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meet) || "TBA" : ""].filter(Boolean).join(" · "))}</span>` : ""}
  </article>`;
}

function pastelGridGroupMarkup(entries, group, options, range) {
  const span = range.end - range.start;
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, index) => range.start + index * 60);
  const labels = hours.map((minute, index) => `<span class="pastel-time-label${index === hours.length - 1 ? " edge" : ""}" style="--time-top:${(minute - range.start) / span * 100}%">${escapeHtml(formatTime(minute))}</span>`).join("");
  const tracks = group.map((day) => {
    const breaks = options.showBreaks ? dailyBreaks(entries, day, 30).map((item) => {
      const top = Math.max(0, (item.start - range.start) / span * 100);
      const height = Math.max(1, (Math.min(range.end, item.end) - Math.max(range.start, item.start)) / span * 100);
      return `<div class="pastel-grid-break" style="top:${top}%;height:${height}%"><span>${escapeHtml(formatBreakLabel(item.minutes))}</span></div>`;
    }).join("") : "";
    const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meet) => meet.day === day && meet.end > range.start && meet.start < range.end).map((meet) => ({ entry, meet }))), { minimumMinutes: gridCardMinimumMinutes(options), maxEnd: range.end });
    return `<div class="pastel-day-track">${breaks}${items.map(({ entry, meet, lane, laneCount, displayEnd }) => pastelGridEventMarkup(entry, meet, lane, laneCount, options, range, displayEnd)).join("")}</div>`;
  }).join("");
  return `<section class="pastel-grid-group" style="--group-days:${group.length};--hour-count:${hours.length - 1}">
    <div class="pastel-grid-corner"></div>${group.map((day) => `<div class="pastel-day-name"><i></i>${escapeHtml(DAY_NAMES[day])}</div>`).join("")}
    <div class="pastel-time-rail">${labels}</div>${tracks}
  </section>`;
}

function pastelGridPreviewMarkup(entries, days, options) {
  const groupSize = neonGroupSize(options, days.length);
  const groups = chunkDays(days, Math.max(1, groupSize));
  const range = neonTimeRange(entries, options);
  const stats = scheduleStats(entries);
  const maxEvents = Math.max(1, ...days.map((day) => entries.reduce((sum, entry) => sum + entry.meetings.filter((meeting) => meeting.day === day).length, 0)));
  const density = Math.max(.68, Math.min(1, 4 / maxEvents)) * options.contentScale / 100;
  return `<div class="wallpaper-inner pastel-grid-inner" style="--clock-space:${options.clockSpace}%;--card-scale:${density}">
    ${isPhoneRatio(options.ratio) ? `<div class="phone-clock-safe" aria-hidden="true"></div>` : ""}
    <div class="pastel-grid-groups" style="--pastel-group-count:${groups.length}">${groups.map((group) => pastelGridGroupMarkup(entries, group, options, range)).join("")}</div>
    <footer class="pastel-grid-footer"><span>${stats.units} UNITS</span>${options.showWatermark ? `<b>TIMORAFT</b>` : ""}</footer>
  </div>`;
}

function renderWallpaperPreview() {
  const options = state.wallpaper;
  const preview = $("#wallpaperPreview");
  const ratioClass = isPhoneRatio(options.ratio) ? "portrait" : options.ratio === "1:1" ? "square" : options.ratio === "4:3" ? "tablet" : "desktop";
  preview.className = `wallpaper-preview ${ratioClass} layout-${options.layout}`;
  preview.style.aspectRatio = options.ratio.replace(":", "/");
  const days = visibleDays(options.showSunday);
  const entries = resolvedWallpaperEntries();
  if (options.layout === "neon-grid") {
    preview.innerHTML = neonGridPreviewMarkup(entries, days, options);
    return;
  }
  if (options.layout === "pastel-grid") {
    preview.innerHTML = pastelGridPreviewMarkup(entries, days, options);
    return;
  }
  const image = safeImageData(options.image);
  const backgroundImage = image ? `linear-gradient(${options.angle}deg, ${hexToRgba(options.bgA, .82)}, ${hexToRgba(options.bgB, .82)}), url(${image})` : `linear-gradient(${options.angle}deg, ${options.bgA}, ${options.bgB})`;
  const columns = wallpaperColumnCount(options, days.length);
  const rows = Math.ceil(days.length / columns);
  const maxEvents = Math.max(1, ...days.map((day) => entries.reduce((sum, entry) => sum + entry.meetings.filter((meeting) => meeting.day === day).length, 0)));
  const density = Math.max(.66, Math.min(1, 4 / maxEvents)) * options.contentScale / 100;
  const daysMarkup = options.layout === "timeline"
    ? days.map((day) => wallpaperTimelineDayMarkup(entries, day, options)).join("")
    : days.map((day) => {
      const meetings = entries.flatMap((entry) => entry.meetings.filter((meeting) => meeting.day === day).sort((a, b) => a.start - b.start).map((meet) => ({ entry, meet })));
      return `<section class="wallpaper-day${meetings.length > 4 ? " dense" : ""}"><h4>${DAY_NAMES[day]}</h4><div class="wallpaper-events" style="--event-count:${Math.max(1, meetings.length)}">${meetings.map(({ entry, meet }) => wallpaperEventMarkup(entry, meet, options)).join("")}</div></section>`;
    }).join("");
  preview.innerHTML = `<div class="wallpaper-inner layout-${options.layout} font-${options.font}" style="background-image:${backgroundImage};--wallpaper-text:${options.textColor};--wallpaper-cols:${columns};--wallpaper-rows:${rows};--clock-space:${options.clockSpace}%;--card-scale:${density}">
    ${isPhoneRatio(options.ratio) ? `<div class="phone-clock-safe" aria-hidden="true"></div>` : ""}
    <header class="wallpaper-title"><div><h3>${escapeHtml(options.title)}</h3><p>${escapeHtml(options.subtitle)}</p></div>${options.showWatermark ? `<div class="wallpaper-mark">timoraft</div>` : ""}</header>
    <div class="wallpaper-days">${daysMarkup}</div></div>`;
}

function renderWallpaper() {
  refreshScheduleSelects();
  const options = state.wallpaper;
  const controls = {
    wallpaperTitle: options.title, wallpaperSubtitle: options.subtitle, wallpaperRatio: options.ratio,
    wallpaperLayout: options.layout, wallpaperFont: options.font, wallpaperCardStyle: options.cardStyle, wallpaperPalette: options.palette,
    wallpaperBgA: options.bgA, wallpaperBgB: options.bgB, wallpaperTextColor: options.textColor,
    wallpaperAngle: options.angle, wallpaperOpacity: options.opacity, wallpaperRadius: options.radius,
    wallpaperClockSpace: options.clockSpace, wallpaperContentScale: options.contentScale,
  };
  for (const [id, value] of Object.entries(controls)) if ($( `#${id}` ).value !== String(value)) $( `#${id}` ).value = value;
  $("#wallpaperBgACode").value = options.bgA.toUpperCase();
  $("#wallpaperBgBCode").value = options.bgB.toUpperCase();
  $("#wallpaperTextColorCode").value = options.textColor.toUpperCase();
  $("#wallpaperTimes").checked = options.showTimes;
  $("#wallpaperRooms").checked = options.showRooms;
  $("#wallpaperProfessors").checked = options.showProfessors;
  $("#wallpaperBreaks").checked = options.showBreaks;
  $("#wallpaperSunday").checked = options.showSunday;
  $("#wallpaperWatermark").checked = options.showWatermark;
  $("#angleOutput").textContent = `${options.angle}°`;
  $("#opacityOutput").textContent = `${options.opacity}%`;
  $("#radiusOutput").textContent = `${options.radius}px`;
  $("#clockSpaceOutput").textContent = `${options.clockSpace}%`;
  $("#contentScaleOutput").textContent = `${options.contentScale}%`;
  $("#phoneLayoutControls").hidden = !isPhoneRatio(options.ratio);
  renderImagePalette();
  renderWallpaperTextEditor();
  renderWallpaperPreview();
  renderWallpaperDesignControls();
}

function getActiveWallpaperDesign() {
  return state.wallpaperDesigns.find((design) => design.id === state.activeWallpaperDesignId);
}

function renderWallpaperDesignControls(syncName = false) {
  const select = $("#wallpaperDesignSelect");
  const nameInput = $("#wallpaperDesignName");
  const active = getActiveWallpaperDesign();
  const optionsMarkup = [`<option value="">Current draft / new design</option>`, ...state.wallpaperDesigns
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((design) => `<option value="${escapeHtml(design.id)}">${escapeHtml(design.name)}</option>`)].join("");
  if (select.innerHTML !== optionsMarkup) select.innerHTML = optionsMarkup;
  select.value = active?.id || "";
  if (syncName || (active && document.activeElement !== nameInput && !nameInput.value)) nameInput.value = active?.name || "";
  $("#deleteWallpaperEdits").disabled = !active;
  $("#saveWallpaperEdits").textContent = active ? "Update saved edits" : "Save edits";
  const status = $("#wallpaperDesignStatus");
  status.classList.toggle("is-dirty", state.wallpaperDesignDirty);
  if (active && state.wallpaperDesignDirty) status.textContent = `Draft changes are autosaved. Save edits to update “${active.name}”.`;
  else if (active) status.textContent = `“${active.name}” is saved locally and ready to reuse.`;
  else status.textContent = "Your current draft is autosaved locally. Add a name to keep a reusable copy.";
}

function markWallpaperDesignDirty() {
  state.wallpaperDesignDirty = true;
  renderWallpaperDesignControls();
}

function saveWallpaperEdits() {
  const nameInput = $("#wallpaperDesignName");
  const active = getActiveWallpaperDesign();
  const fallbackName = String(state.wallpaper.title || "Wallpaper design").trim();
  const name = String(nameInput.value || fallbackName || "Wallpaper design").trim().slice(0, 48);
  if (!name) { nameInput.focus(); toast("Add a name for this wallpaper design"); return; }
  const saved = {
    id: active?.id || crypto.randomUUID(),
    name,
    updatedAt: Date.now(),
    options: cloneWallpaperOptions(),
  };
  if (active) state.wallpaperDesigns = state.wallpaperDesigns.map((design) => design.id === active.id ? saved : design);
  else state.wallpaperDesigns.push(saved);
  state.activeWallpaperDesignId = saved.id;
  state.wallpaperDesignDirty = false;
  renderWallpaperDesignControls(true);
  queueSave();
  toast(active ? "Saved wallpaper edits updated" : "Wallpaper edits saved locally");
}

function loadWallpaperEdits(id) {
  if (!id) {
    state.activeWallpaperDesignId = "";
    state.wallpaperDesignDirty = false;
    $("#wallpaperDesignName").value = "";
    renderWallpaperDesignControls(true);
    queueSave();
    return;
  }
  const design = state.wallpaperDesigns.find((item) => item.id === id);
  if (!design) return;
  state.wallpaper = cloneWallpaperOptions(design.options);
  state.activeWallpaperDesignId = design.id;
  state.wallpaperDesignDirty = false;
  renderWallpaper();
  renderWallpaperDesignControls(true);
  queueSave();
  toast(`Loaded “${design.name}”`);
}

function deleteWallpaperEdits() {
  const active = getActiveWallpaperDesign();
  if (!active) return;
  state.wallpaperDesigns = state.wallpaperDesigns.filter((design) => design.id !== active.id);
  state.activeWallpaperDesignId = "";
  state.wallpaperDesignDirty = false;
  $("#wallpaperDesignName").value = "";
  renderWallpaperDesignControls(true);
  queueSave();
  toast(`Deleted saved design “${active.name}”`);
}

function hexToRgba(hex, alpha) {
  const clean = String(hex).replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean, 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function renderLibrary() {
  $("#libraryGrid").innerHTML = state.saved.length ? state.saved.map((item) => {
    const days = ["M", "T", "W", "H", "F", "S"];
    const mini = days.map((day) => `<div class="mini-day">${item.entries.flatMap((entry) => entry.meetings.filter((m) => m.day === day).map((m) => `<i class="mini-event" style="top:${Math.max(0, (m.start - 420) / 8)}px;height:${Math.max(7, (m.end - m.start) / 8)}px;background:${entry.displayColor || entry.color}"></i>`)).join("")}</div>`).join("");
    const stats = scheduleStats(item.entries);
    return `<article class="library-card" data-saved-id="${item.id}"><div class="library-preview">${mini}</div><div class="library-content"><h3>${escapeHtml(item.name)}</h3><p>${item.entries.length} courses · ${stats.units} units · ${new Date(item.createdAt).toLocaleDateString()}</p><div class="library-actions"><button class="button primary load-saved">Load</button><button class="button ghost wallpaper-saved">Wallpaper</button><button class="button ghost delete-saved">Delete</button></div></div></article>`;
  }).join("") : `<div class="empty-library"><strong>No saved weeks yet</strong>Build a combination, then save it locally.</div>`;
}

function renderAll() {
  document.documentElement.dataset.theme = state.options.theme;
  renderRailState();
  renderBuilder();
  renderMerge();
  renderWallpaper();
  renderLibrary();
  setView(state.activeView, false);
}

function renderRailState() {
  const collapsed = Boolean(state.options.railCollapsed);
  document.documentElement.dataset.rail = collapsed ? "collapsed" : "expanded";
  const button = $("#railToggle");
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}

function setView(view, shouldSave = true) {
  state.activeView = view;
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === `${view}View`));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const [eyebrow, title] = VIEW_COPY[view];
  $("#viewEyebrow").textContent = eyebrow;
  $("#viewTitle").textContent = title;
  $("#saveCurrentButton").style.display = view === "builder" ? "inline-flex" : "none";
  if (view === "merge") renderMerge();
  if (view === "wallpaper") renderWallpaper();
  if (view === "library") renderLibrary();
  if (shouldSave) queueSave();
}

function openSaveDialog(mode) {
  const schedule = currentSchedule();
  if (mode === "current" && !schedule.entries.length) return toast("Nothing to save yet");
  const merged = getMergedEntries();
  if (mode === "merge" && (!merged.a || !merged.b)) return toast("Choose two schedules first");
  pendingSaveMode = mode;
  $("#saveName").value = mode === "merge" ? `${merged.a.name} + ${merged.b.name}` : `Week ${state.saved.length + 1}`;
  $("#saveDialog").showModal();
  $("#saveName").select();
}

function commitSave(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { $("#saveDialog").close(); return; }
  const name = $("#saveName").value.trim();
  if (!name) return;
  if (pendingSaveMode === "merge") return commitMerged(name);
  const schedule = currentSchedule();
  state.saved.unshift({ id: crypto.randomUUID(), name, createdAt: Date.now(), entries: structuredClone(schedule.entries) });
  $("#saveDialog").close();
  queueSave(); renderMerge(); renderWallpaper(); renderLibrary(); toast(`${name} saved locally`);
}

function commitMerged(name) {
  const { entries, a, b } = getMergedEntries();
  state.saved.unshift({ id: crypto.randomUUID(), name, createdAt: Date.now(), entries: entries.map(({ conflict, ...entry }) => entry), merged: true });
  $("#saveDialog").close();
  queueSave(); renderAll(); toast("Merged schedule saved locally");
}

function loadSaved(item) {
  const byCourse = new Map();
  for (const entry of item.entries) {
    if (!byCourse.has(entry.courseId)) byCourse.set(entry.courseId, { id: entry.courseId, code: entry.code, title: entry.title || entry.code, units: entry.units, color: entry.color, sections: [] });
    byCourse.get(entry.courseId).sections.push({ id: entry.uid.split(":").at(-1) || crypto.randomUUID(), name: entry.section, professor: entry.professor, room: entry.room, capacity: entry.capacity || 0, enlisted: entry.enlisted || 0, remarks: entry.remarks || "", meetings: structuredClone(entry.meetings) });
  }
  state.courses = [...byCourse.values()];
  state.selected = Object.fromEntries(state.courses.map((course) => [course.id, course.sections.map((s) => s.id)]));
  state.pinned = {};
  state.collapsedCourses = [];
  state.activeSchedule = 0;
  setView("builder"); renderBuilder(); queueSave(); toast(`${item.name} loaded`);
}

async function sendExtensionMessage(message) {
  if (!ext?.runtime?.sendMessage) throw new Error("Hub sync is available after loading Timoraft as a Chrome extension");
  return await ext.runtime.sendMessage(message);
}

async function hubFetch(path, body, isJson = false) {
  const result = await sendExtensionMessage({ type: "HUB_FETCH", path, body: isJson ? JSON.stringify(body) : body, isJson });
  if (!result?.ok) {
    const error = new Error(result?.error || "Archer's Hub did not respond");
    if (/expired|401|sign in|log in/i.test(error.message)) error.name = "HubSessionError";
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(result.text); }
  catch {
    const error = new Error(/<!doctype|<html|login|sign.?in/i.test(result.text || "") ? "Your Archer's Hub session has expired" : "The Hub returned an invalid response");
    if (/expired/i.test(error.message)) error.name = "HubSessionError";
    throw error;
  }
  if (typeof parsed === "string") {
    const error = new Error("Your Archer's Hub session has expired"); error.name = "HubSessionError"; throw error;
  }
  return parsed;
}

function setHubStatus(message, isError = false) {
  $("#hubStatus").textContent = message;
  $("#hubStatus").classList.toggle("error", isError);
}

function showHubState(name) {
  $("#hubSignedOut").hidden = name !== "signed-out";
  $("#hubSignedIn").hidden = name !== "signed-in";
  $("#hubExpired").hidden = name !== "expired";
}

function handleHubError(error) {
  const expired = error?.name === "HubSessionError" || /expired|401/i.test(error?.message || "");
  if (expired) {
    showHubState("expired");
    setHubStatus("Your saved courses are safe. Reconnect to refresh Hub data.", true);
  } else setHubStatus(error?.message || "Archer's Hub did not respond", true);
}

function openHubLogin() {
  if (ext?.tabs?.create) ext.tabs.create({ url: "https://archershub.dlsu.edu.ph/" });
  else window.open("https://archershub.dlsu.edu.ph/", "_blank");
}

async function openHubDialog() {
  $("#hubDialog").showModal();
  await checkHubConnection();
}

async function checkHubConnection() {
  setHubStatus("Checking your browser session…");
  try {
    const status = await sendExtensionMessage({ type: "GET_HUB_STATUS" });
    showHubState(status?.loggedIn ? "signed-in" : "signed-out");
    if (!status?.loggedIn) { setHubStatus("Not signed in yet."); return; }
    await loadHubDropdowns();
  } catch (error) {
    showHubState("signed-out");
    handleHubError(error);
  }
}

async function loadHubDropdowns() {
  setHubStatus("Loading campuses and terms…");
  try {
    const data = await hubFetch("/CourseFinder/GetAllDropDownList/", {}, true);
    hubData.campuses = Array.isArray(data.CampusDrp) ? data.CampusDrp : [];
    hubData.sessions = Array.isArray(data.SessionDrp) ? data.SessionDrp : [];
    if (!state.hub.campusId) state.hub.campusId = String(hubData.campuses.find((item) => Number(item.IS_STUDENT_CAMPUS) === 1)?.CAMPUSNO ?? hubData.campuses[0]?.CAMPUSNO ?? "");
    if (!state.hub.sessionId) state.hub.sessionId = String(hubData.sessions.find((item) => item.IS_CURRENT_SESSION)?.ACADEMIC_SESSION_ID ?? hubData.sessions[0]?.ACADEMIC_SESSION_ID ?? "");
    $("#hubCampus").innerHTML = hubData.campuses.map((item) => `<option value="${item.CAMPUSNO}">${escapeHtml(item.CAMPUSNAME)}</option>`).join("");
    $("#hubSession").innerHTML = hubData.sessions.map((item) => `<option value="${item.ACADEMIC_SESSION_ID}">${escapeHtml(item.ACADEMIC_SESSION_NAME)}</option>`).join("");
    $("#hubCampus").value = state.hub.campusId;
    $("#hubSession").value = state.hub.sessionId;
    await loadHubCatalog();
  } catch (error) { handleHubError(error); }
}

async function loadHubCatalog() {
  if (!state.hub.campusId || !state.hub.sessionId) return;
  setHubStatus("Loading the course catalog…");
  $("#hubCourseList").innerHTML = "";
  try {
    const body = `Campusno=${encodeURIComponent(state.hub.campusId)}&AcademicSession=${encodeURIComponent(state.hub.sessionId)}`;
    const data = await hubFetch("/CourseFinder/GetCourseList/", body);
    hubData.catalog = Array.isArray(data.CourseDrp) ? data.CourseDrp : [];
    renderHubCatalog();
    setHubStatus(`${hubData.catalog.length} courses available. Imported courses remain editable.`);
    queueSave();
  } catch (error) { handleHubError(error); }
}

function renderHubCatalog() {
  const query = $("#hubCourseSearch").value.trim().toLowerCase();
  const visible = hubData.catalog.filter((item) => String(item.COURSE_NAME || "").toLowerCase().includes(query)).slice(0, 80);
  $("#hubCourseList").innerHTML = visible.length ? visible.map((item) => {
    const courseId = String(item.COURSE_CREATION_ID);
    const exists = state.courses.some((course) => course.hubCourseId === courseId && course.hubCampusId === state.hub.campusId && course.hubSessionId === state.hub.sessionId);
    return `<article class="hub-course" data-hub-course="${escapeHtml(courseId)}"><div><b>${escapeHtml(item.COURSE_NAME)}</b><span>${exists ? "Already in your stack" : "Load every available section"}</span></div><button type="button" class="button ${exists ? "ghost" : "primary"}" ${exists ? "disabled" : ""}>${exists ? "Added" : "Add"}</button></article>`;
  }).join("") : `<div class="calendar-empty"><div><strong>No matching courses</strong>Try a course code such as CCPROG.</div></div>`;
}

function parseHubClock(value) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function parseHubMeetings(value) {
  const dayMap = { MON: "M", MONDAY: "M", TUE: "T", TUESDAY: "T", WED: "W", WEDNESDAY: "W", THU: "H", THURSDAY: "H", FRI: "F", FRIDAY: "F", SAT: "S", SATURDAY: "S", SUN: "U", SUNDAY: "U" };
  const meetings = [];
  const pattern = /\[\s*(\w+)\s*-\s*([\d:]+\s*[AP]M)\s*-\s*([\d:]+\s*[AP]M)[^\]]*\]/gi;
  let match;
  while ((match = pattern.exec(String(value || "")))) {
    const day = dayMap[match[1].toUpperCase()];
    const start = parseHubClock(match[2]);
    const end = parseHubClock(match[3]);
    if (day && start < end) meetings.push({ day, start, end });
  }
  return meetings;
}

function hubRowToSection(row, previous) {
  return {
    id: `hub-section:${row.SECTION_CREATION_ID}`,
    name: String(row.SECTION_NAME || "TBA"),
    professor: String(row.MAIN_TEACHER || ""),
    room: previous?.room || "TBA",
    capacity: Math.max(0, Number(row.CAPACITY) || 0),
    enlisted: Math.max(0, Number(row.ENLISTED) || 0),
    remarks: String(row.SECTION_REMARK || ""),
    meetings: parseHubMeetings(row.SCHEDULE),
  };
}

async function fetchHubCourseRows(course) {
  const campusId = course.hubCampusId || state.hub.campusId;
  const sessionId = course.hubSessionId || state.hub.sessionId;
  if (!campusId || !sessionId) throw new Error("Choose the matching campus and term before refreshing");
  const body = `Campusno=${encodeURIComponent(campusId)}&AcademicSession=${encodeURIComponent(sessionId)}&CourseId=${encodeURIComponent(course.hubCourseId)}`;
  const rows = await hubFetch("/CourseFinder/GetCFData/", body);
  if (!Array.isArray(rows) || !rows.length) throw new Error(`No sections were returned for ${course.code}`);
  return rows;
}

async function refreshHubCourse(course) {
  const rows = await fetchHubCourseRows(course);
  const previous = new Map(course.sections.map((section) => [section.id, section]));
  course.sections = rows.map((row) => hubRowToSection(row, previous.get(`hub-section:${row.SECTION_CREATION_ID}`)));
  course.title = String(rows[0].SUBJECT_NAME || course.title || course.code);
  course.units = Number(rows[0].CREDITS) || course.units || 0;
  course.syncedAt = Date.now();
  state.selected[course.id] = (state.selected[course.id] || []).filter((id) => course.sections.some((section) => section.id === id));
  state.pinned[course.id] = (state.pinned[course.id] || []).filter((id) => course.sections.some((section) => section.id === id));
}

async function refreshAllHubCourses() {
  if (hubRefreshBusy) return;
  const courses = state.courses.filter((course) => course.hubCourseId);
  if (!courses.length) return toast("No Archer's Hub courses to refresh");
  hubRefreshBusy = true; updateHubSyncRow();
  let refreshed = 0;
  try {
    for (const course of courses) { await refreshHubCourse(course); refreshed += 1; renderCourseList(); }
    state.hub.lastSyncedAt = Date.now();
    generationSignature = ""; state.activeSchedule = 0; renderBuilder(); queueSave();
    toast(`${refreshed} Hub course${refreshed === 1 ? "" : "s"} refreshed`);
  } catch (error) {
    handleHubError(error);
    if (error?.name === "HubSessionError" && !$("#hubDialog").open) $("#hubDialog").showModal();
    else toast(`Refreshed ${refreshed} of ${courses.length} Hub courses`);
  } finally { hubRefreshBusy = false; updateHubSyncRow(); }
}

async function importHubCourse(courseId, button) {
  const apiCourse = hubData.catalog.find((item) => String(item.COURSE_CREATION_ID) === courseId);
  if (!apiCourse) return;
  button.disabled = true; button.textContent = "Loading…";
  setHubStatus(`Loading ${apiCourse.COURSE_NAME} sections…`);
  try {
    const body = `Campusno=${encodeURIComponent(state.hub.campusId)}&AcademicSession=${encodeURIComponent(state.hub.sessionId)}&CourseId=${encodeURIComponent(courseId)}`;
    const rows = await hubFetch("/CourseFinder/GetCFData/", body);
    if (!Array.isArray(rows) || !rows.length) throw new Error("No sections were returned for this course");
    const id = `hub:${state.hub.campusId}:${courseId}`;
    const palette = ["#ff8a65", "#ffd166", "#6ee7c2", "#8ca7ff", "#d89cff", "#60d5ff"];
    const course = {
      id, hubCourseId: courseId, hubCampusId: state.hub.campusId, hubSessionId: state.hub.sessionId, code: String(apiCourse.COURSE_NAME),
      title: String(rows[0].SUBJECT_NAME || apiCourse.COURSE_NAME), units: Number(rows[0].CREDITS) || 0,
      color: palette[state.courses.length % palette.length], syncedAt: Date.now(),
      sections: rows.map((row) => hubRowToSection(row)),
    };
    state.courses.push(course);
    state.selected[id] = [];
    state.pinned[id] = [];
    state.activeSchedule = 0;
    renderHubCatalog(); renderBuilder(); queueSave();
    setHubStatus(`${course.code} added with ${course.sections.length} sections.`);
    toast(`${course.code} imported from Hub`);
  } catch (error) {
    button.disabled = false; button.textContent = "Add"; handleHubError(error);
  }
}

function openCourseDialog(courseId = "") {
  $("#courseForm").reset();
  $("#courseUnits").value = "3";
  $("#courseStart").value = "09:15";
  $("#courseEnd").value = "10:45";
  $("#courseColor").value = state.courses[state.courses.length % Math.max(1, state.courses.length)]?.color || "#ff6b55";
  $("#courseForm").dataset.courseId = courseId;
  if (courseId) {
    const course = state.courses.find((item) => item.id === courseId);
    $("#courseCode").value = course.code;
    $("#courseTitle").value = course.title;
    $("#courseUnits").value = course.units;
    $("#courseColor").value = course.color;
    $("#courseCode").disabled = true;
    $("#courseTitle").disabled = true;
    $("#courseUnits").disabled = true;
    $("#courseColor").disabled = true;
    $("#courseSubmit").textContent = "Add section";
  } else {
    ["#courseCode", "#courseTitle", "#courseUnits", "#courseColor"].forEach((id) => $(id).disabled = false);
    $("#courseSubmit").textContent = "Add course";
  }
  $("#courseDialog").showModal();
}

function submitCourse(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { $("#courseDialog").close(); return; }
  const courseId = $("#courseForm").dataset.courseId;
  const start = toMinutes($("#courseStart").value);
  const end = toMinutes($("#courseEnd").value);
  if (end <= start) return toast("End time must be after start time");
  const item = {
    id: crypto.randomUUID(), name: $("#courseSection").value.trim().toUpperCase(), professor: $("#courseProfessor").value.trim(),
    room: $("#courseRoom").value.trim(), meetings: [{ day: $("#courseDay").value, start, end }],
  };
  if (courseId) {
    const course = state.courses.find((entry) => entry.id === courseId);
    course.sections.push(item);
    state.selected[courseId] = [...(state.selected[courseId] || [])];
  } else {
    const id = crypto.randomUUID();
    state.courses.push({ id, code: $("#courseCode").value.trim().toUpperCase(), title: $("#courseTitle").value.trim(), units: Number($("#courseUnits").value), color: $("#courseColor").value, sections: [item] });
    state.selected[id] = [];
    state.pinned[id] = [];
  }
  $("#courseDialog").close();
  state.activeSchedule = 0; renderBuilder(); queueSave(); toast(courseId ? "Section added" : "Course added");
}

function bind() {
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openDialogs = $$("dialog[open]");
    const topDialog = openDialogs.at(-1);
    if (topDialog) { event.preventDefault(); topDialog.close(); }
  });
  $$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = rect.left <= event.clientX && event.clientX <= rect.right && rect.top <= event.clientY && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  }));
  $("#railToggle").addEventListener("click", () => { state.options.railCollapsed = !state.options.railCollapsed; renderRailState(); queueSave(); });
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#themeToggle").addEventListener("click", () => { state.options.theme = state.options.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = state.options.theme; queueSave(); });
  $("#courseSearch").addEventListener("input", (event) => { state.search = event.target.value; renderCourseList(); });
  $("#addCourseButton").addEventListener("click", () => openCourseDialog());
  $("#selectAllSections").addEventListener("click", () => {
    state.selected = Object.fromEntries(state.courses.map((course) => [course.id, course.sections.map((section) => section.id)]));
    $$("#courseList input[data-section-id]").forEach((input) => { input.checked = true; });
    state.activeSchedule = 0; updateSelectionToolbar(); requestScheduleGeneration(); queueSave(); toast("All sections selected");
  });
  $("#clearAllSections").addEventListener("click", () => {
    state.selected = Object.fromEntries(state.courses.map((course) => [course.id, []]));
    $$("#courseList input[data-section-id]").forEach((input) => { input.checked = false; });
    state.activeSchedule = 0; updateSelectionToolbar(); requestScheduleGeneration(); queueSave(); toast("All sections deselected");
  });
  $("#searchHubFromEditor").addEventListener("click", () => { $("#courseDialog").close(); openHubDialog(); });
  $("#courseForm").addEventListener("submit", submitCourse);
  $("#courseList").addEventListener("change", (event) => {
    if (!event.target.matches("input[data-section-id]")) return;
    const card = event.target.closest("[data-course-id]");
    const id = card.dataset.courseId;
    const selected = new Set(state.selected[id] || []);
    event.target.checked ? selected.add(event.target.dataset.sectionId) : selected.delete(event.target.dataset.sectionId);
    state.selected[id] = [...selected]; state.activeSchedule = 0; updateSelectionToolbar(); requestScheduleGeneration(); queueSave();
  });
  $("#courseList").addEventListener("click", async (event) => {
    const card = event.target.closest("[data-course-id]"); if (!card) return;
    const course = state.courses.find((item) => item.id === card.dataset.courseId);
    const refreshButton = event.target.closest(".refresh-course");
    if (refreshButton) {
      refreshButton.disabled = true; refreshButton.classList.add("is-loading");
      try {
        await refreshHubCourse(course); generationSignature = ""; state.activeSchedule = 0; renderBuilder(); queueSave(); toast(`${course.code} refreshed`);
      } catch (error) {
        handleHubError(error);
        if (error?.name === "HubSessionError" && !$("#hubDialog").open) $("#hubDialog").showModal();
        else toast(`${course.code} could not refresh`);
      }
      return;
    }
    const pinButton = event.target.closest(".pin-section");
    if (pinButton) {
      const pins = new Set(state.pinned[course.id] || []);
      pins.has(pinButton.dataset.sectionId) ? pins.delete(pinButton.dataset.sectionId) : pins.add(pinButton.dataset.sectionId);
      state.pinned[course.id] = [...pins]; generationSignature = ""; state.activeSchedule = 0;
      renderCourseList(); requestScheduleGeneration(); queueSave();
      toast(`${course.code}: top choices updated`); return;
    }
    if (event.target.closest(".collapse-course")) {
      const collapsed = new Set(state.collapsedCourses);
      collapsed.has(course.id) ? collapsed.delete(course.id) : collapsed.add(course.id);
      state.collapsedCourses = [...collapsed]; renderCourseList(); queueSave(); return;
    }
    if (event.target.closest(".select-course-sections")) {
      state.selected[card.dataset.courseId] = course.sections.map((section) => section.id);
      card.querySelectorAll("input[data-section-id]").forEach((input) => { input.checked = true; });
      state.activeSchedule = 0; updateSelectionToolbar(); requestScheduleGeneration(); queueSave(); toast(`${course.code}: all sections selected`); return;
    }
    if (event.target.closest(".clear-course-sections")) {
      state.selected[card.dataset.courseId] = [];
      card.querySelectorAll("input[data-section-id]").forEach((input) => { input.checked = false; });
      state.activeSchedule = 0; updateSelectionToolbar(); requestScheduleGeneration(); queueSave(); toast(`${course.code}: sections deselected`); return;
    }
    if (event.target.closest(".add-section")) openCourseDialog(card.dataset.courseId);
    if (event.target.closest(".delete-course")) {
      state.courses = state.courses.filter((item) => item.id !== card.dataset.courseId);
      delete state.selected[card.dataset.courseId]; delete state.pinned[card.dataset.courseId];
      state.collapsedCourses = state.collapsedCourses.filter((id) => id !== card.dataset.courseId);
      state.activeSchedule = 0; renderBuilder(); queueSave(); toast("Course removed");
    }
  });
  $("#prevSchedule").addEventListener("click", () => { if (!generated.length) return; state.activeSchedule = (state.activeSchedule - 1 + generated.length) % generated.length; renderScheduleResults(); renderWallpaper(); queueSave(); });
  $("#nextSchedule").addEventListener("click", () => { if (!generated.length) return; state.activeSchedule = (state.activeSchedule + 1) % generated.length; renderScheduleResults(); renderWallpaper(); queueSave(); });
  $("#shuffleButton").addEventListener("click", () => { if (!generated.length) return; state.activeSchedule = Math.floor(Math.random() * generated.length); renderScheduleResults(); renderWallpaper(); queueSave(); });
  $("#saveCurrentButton").addEventListener("click", () => openSaveDialog("current"));
  $("#saveForm").addEventListener("submit", commitSave);
  $("#sundayToggle").addEventListener("change", (event) => { state.options.showSunday = event.target.checked; renderBuilder(); queueSave(); });
  $("#viewOptionsButton").addEventListener("click", () => $("#optionsDialog").showModal());
  [["saturdayToggle", "showSaturday"], ["optionsSundayToggle", "showSunday"], ["timeFormatToggle", "use24Hour"], ["compactToggle", "compact"]].forEach(([id, key]) => $( `#${id}` ).addEventListener("change", (event) => { state.options[key] = event.target.checked; renderBuilder(); queueSave(); }));
  $("#resetDemoButton").addEventListener("click", () => { const fresh = defaults(); state.courses = fresh.courses; state.selected = fresh.selected; state.activeSchedule = 0; renderBuilder(); queueSave(); toast("Sample courses restored"); });
  $("#hubButton").addEventListener("click", openHubDialog);
  $("#openHubLogin").addEventListener("click", openHubLogin);
  $("#openHubRelogin").addEventListener("click", openHubLogin);
  $("#retryHub").addEventListener("click", checkHubConnection);
  $("#retryExpiredHub").addEventListener("click", checkHubConnection);
  $("#refreshHubCourses").addEventListener("click", refreshAllHubCourses);
  $("#hubCampus").addEventListener("change", (event) => { state.hub.campusId = event.target.value; loadHubCatalog(); });
  $("#hubSession").addEventListener("change", (event) => { state.hub.sessionId = event.target.value; loadHubCatalog(); });
  $("#hubCourseSearch").addEventListener("input", renderHubCatalog);
  $("#hubCourseList").addEventListener("click", (event) => { const card = event.target.closest("[data-hub-course]"); const button = event.target.closest("button"); if (card && button) importHubCourse(card.dataset.hubCourse, button); });

  [["mergeA", "a"], ["mergeB", "b"], ["mergeColorA", "colorA"], ["mergeColorB", "colorB"]].forEach(([id, key]) => $( `#${id}` ).addEventListener("input", (event) => { state.merge[key] = event.target.value; renderMerge(); queueSave(); }));
  $("#mergeSunday").addEventListener("change", (event) => { state.merge.showSunday = event.target.checked; renderMerge(); queueSave(); });
  $("#saveMergeButton").addEventListener("click", () => openSaveDialog("merge"));

  const wallpaperBindings = {
    wallpaperSchedule: "scheduleId", wallpaperTitle: "title", wallpaperSubtitle: "subtitle", wallpaperRatio: "ratio", wallpaperLayout: "layout", wallpaperFont: "font",
    wallpaperCardStyle: "cardStyle", wallpaperAngle: "angle", wallpaperOpacity: "opacity", wallpaperRadius: "radius", wallpaperClockSpace: "clockSpace", wallpaperContentScale: "contentScale",
    wallpaperTimes: "showTimes", wallpaperRooms: "showRooms", wallpaperProfessors: "showProfessors", wallpaperBreaks: "showBreaks", wallpaperSunday: "showSunday", wallpaperWatermark: "showWatermark",
  };
  for (const [id, key] of Object.entries(wallpaperBindings)) $( `#${id}` ).addEventListener("input", (event) => {
    state.wallpaper[key] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "range" ? Number(event.target.value) : event.target.value;
    if (key === "layout" && state.wallpaper.layout === "neon-grid" && (!state.wallpaper.title || state.wallpaper.title === "MY WEEK")) state.wallpaper.title = "WEEKLY SCHEDULE";
    markWallpaperDesignDirty(); renderWallpaper(); queueSave();
  });
  $("#wallpaperPalette").addEventListener("change", (event) => {
    const palette = WALLPAPER_PALETTES[event.target.value];
    state.wallpaper.palette = event.target.value;
    if (palette) Object.assign(state.wallpaper, palette);
    markWallpaperDesignDirty(); renderWallpaper(); queueSave();
  });
  [["wallpaperBgA", "bgA"], ["wallpaperBgB", "bgB"], ["wallpaperTextColor", "textColor"]].forEach(([id, key]) => {
    $( `#${id}` ).addEventListener("input", (event) => {
      state.wallpaper[key] = safeHex(event.target.value, state.wallpaper[key]);
      state.wallpaper.palette = "custom"; markWallpaperDesignDirty(); renderWallpaper(); queueSave();
    });
  });
  [["wallpaperBgACode", "bgA"], ["wallpaperBgBCode", "bgB"], ["wallpaperTextColorCode", "textColor"]].forEach(([id, key]) => {
    $( `#${id}` ).addEventListener("input", (event) => {
      const color = safeHex(event.target.value, "");
      event.target.toggleAttribute("aria-invalid", !color);
      if (!color) return;
      state.wallpaper[key] = color; state.wallpaper.palette = "custom"; markWallpaperDesignDirty(); renderWallpaper(); queueSave();
    });
  });
  $("#wallpaperImage").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Choose an image file"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      state.wallpaper.image = safeImageData(reader.result);
      state.wallpaper.imagePalette = await extractImagePalette(state.wallpaper.image);
      markWallpaperDesignDirty(); renderWallpaper(); queueSave(); toast("Background and colors added");
    };
    reader.readAsDataURL(file);
  });
  $("#imagePalette").addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-palette-color]"); if (!swatch) return;
    const target = $("input[name='paletteTarget']:checked")?.value || "bgA";
    state.wallpaper[target] = safeHex(swatch.dataset.paletteColor, state.wallpaper[target]);
    state.wallpaper.palette = "custom"; markWallpaperDesignDirty(); renderWallpaper(); queueSave(); toast(`Applied to background ${target === "bgA" ? "one" : "two"}`);
  });
  $("#removeWallpaperImage").addEventListener("click", () => {
    state.wallpaper.image = ""; state.wallpaper.imagePalette = []; $("#wallpaperImage").value = "";
    markWallpaperDesignDirty(); renderWallpaper(); queueSave(); toast("Background image removed");
  });
  $("#wallpaperTextEditor").addEventListener("input", (event) => {
    const field = event.target.closest("[data-text-field]");
    const meetingField = event.target.closest("[data-meeting-field]");
    if (!field && !meetingField) return;
    const editor = event.target.closest("[data-wallpaper-entry]"); if (!editor) return;
    const key = editor.dataset.wallpaperEntry;
    const current = state.wallpaper.textOverrides[key] || {};
    if (meetingField) {
      const meetingEditor = meetingField.closest("[data-wallpaper-meeting]"); if (!meetingEditor) return;
      const meetingIndex = meetingEditor.dataset.wallpaperMeeting;
      const meetings = { ...(current.meetings || {}) };
      meetings[meetingIndex] = { ...(meetings[meetingIndex] || {}), [meetingField.dataset.meetingField]: meetingField.value };
      state.wallpaper.textOverrides[key] = { ...current, meetings };
    } else {
      state.wallpaper.textOverrides[key] = { ...current, [field.dataset.textField]: field.value };
    }
    markWallpaperDesignDirty(); renderWallpaperPreview(); queueSave();
  });
  $("#resetWallpaperText").addEventListener("click", () => {
    state.wallpaper.textOverrides = {}; markWallpaperDesignDirty(); renderWallpaper(); queueSave(); toast("Wallpaper text restored");
  });
  $("#wallpaperDesignSelect").addEventListener("change", (event) => loadWallpaperEdits(event.target.value));
  $("#wallpaperDesignName").addEventListener("input", () => { if (getActiveWallpaperDesign()) markWallpaperDesignDirty(); });
  $("#saveWallpaperEdits").addEventListener("click", saveWallpaperEdits);
  $("#deleteWallpaperEdits").addEventListener("click", deleteWallpaperEdits);
  $("#resetWallpaper").addEventListener("click", () => {
    state.wallpaper = defaultWallpaper(); state.activeWallpaperDesignId = ""; state.wallpaperDesignDirty = false;
    $("#wallpaperDesignName").value = ""; renderWallpaper(); queueSave();
  });
  $("#downloadWallpaper").addEventListener("click", downloadWallpaper);

  $("#libraryGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-saved-id]"); if (!card) return;
    const item = getSaved(card.dataset.savedId); if (!item) return;
    if (event.target.closest(".load-saved")) loadSaved(item);
    if (event.target.closest(".wallpaper-saved")) { state.wallpaper.scheduleId = item.id; markWallpaperDesignDirty(); setView("wallpaper"); renderWallpaper(); queueSave(); }
    if (event.target.closest(".delete-saved")) { state.saved = state.saved.filter((entry) => entry.id !== item.id); renderAll(); queueSave(); toast("Saved schedule deleted"); }
  });
  $("#exportJson").addEventListener("click", exportBackup);
  $("#importJson").addEventListener("change", importBackup);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ product: "Timoraft", version: 2, state }, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `timoraft-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
}

function migrateState(input = {}) {
  const base = defaults();
  const next = {
    ...base, ...input,
    courses: Array.isArray(input.courses) ? input.courses : base.courses,
    saved: Array.isArray(input.saved) ? input.saved : [],
    selected: input.selected && typeof input.selected === "object" ? input.selected : base.selected,
    pinned: input.pinned && typeof input.pinned === "object" && !Array.isArray(input.pinned) ? input.pinned : {},
    collapsedCourses: Array.isArray(input.collapsedCourses) ? input.collapsedCourses : [],
    options: { ...base.options, ...(input.options || {}) },
    merge: { ...base.merge, ...(input.merge || {}) },
    wallpaper: migrateWallpaperOptions(input.wallpaper),
    wallpaperDesigns: migrateWallpaperDesigns(input.wallpaperDesigns),
    activeWallpaperDesignId: typeof input.activeWallpaperDesignId === "string" ? input.activeWallpaperDesignId : "",
    wallpaperDesignDirty: Boolean(input.wallpaperDesignDirty),
    hub: { ...base.hub, ...(input.hub || {}) },
  };
  if (!next.wallpaperDesigns.some((design) => design.id === next.activeWallpaperDesignId)) {
    next.activeWallpaperDesignId = "";
    next.wallpaperDesignDirty = false;
  }
  const courseIds = new Set(next.courses.map((course) => course.id));
  next.collapsedCourses = next.collapsedCourses.filter((id) => courseIds.has(id));
  for (const course of next.courses) {
    const sectionIds = new Set(course.sections.map((section) => section.id));
    next.selected[course.id] = Array.isArray(next.selected[course.id]) ? next.selected[course.id].filter((id) => sectionIds.has(id)) : [];
    next.pinned[course.id] = Array.isArray(next.pinned[course.id]) ? next.pinned[course.id].filter((id) => sectionIds.has(id)) : [];
  }
  return next;
}

async function importBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data?.state?.courses || !Array.isArray(data.state.saved)) throw new Error("Invalid backup");
    state = migrateState(data.state);
    renderAll(); queueSave(); toast("Backup restored");
  } catch { toast("That backup could not be read"); }
  event.target.value = "";
}

async function loadCanvasImage(url) {
  if (!url) return null;
  return await new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; });
}

async function extractImagePalette(url) {
  const image = await loadCanvasImage(url);
  if (!image) return [];
  const sample = document.createElement("canvas"); sample.width = 64; sample.height = 64;
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const buckets = new Map();
  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] < 180) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]].map((channel) => Math.min(255, Math.round(channel / 24) * 24));
    const key = rgb.join(","); buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const selected = [];
  for (const [key] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
    const rgb = key.split(",").map(Number);
    if (selected.every((other) => Math.hypot(rgb[0] - other[0], rgb[1] - other[1], rgb[2] - other[2]) > 58)) selected.push(rgb);
    if (selected.length === 6) break;
  }
  return selected.map((rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
}

function ellipsizeCanvasText(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

function canvasTextLines(ctx, value, maxWidth, maxLines = 2) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  while (words.length && lines.length < maxLines) {
    let line = words.shift();
    while (words.length && ctx.measureText(`${line} ${words[0]}`).width <= maxWidth) line += ` ${words.shift()}`;
    lines.push(line);
  }
  if (words.length && lines.length) lines[lines.length - 1] = ellipsizeCanvasText(ctx, `${lines.at(-1)} ${words.join(" ")}`, maxWidth);
  return lines;
}

function fittedCanvasFontSize(ctx, text, maxWidth, startSize, minimumSize, fontForSize) {
  let size = startSize;
  ctx.font = fontForSize(size);
  while (size > minimumSize && ctx.measureText(text).width > maxWidth) {
    size = Math.max(minimumSize, size - .5);
    ctx.font = fontForSize(size);
  }
  return size;
}

function drawWallpaperCanvasCard(ctx, entry, meeting, options, left, top, width, height, unit) {
  const theme = wallpaperCardTheme(entry.displayColor || entry.color, options);
  const radius = Math.max(0, options.radius * unit / 900);
  const scale = options.contentScale / 100;
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
  roundRect(ctx, left, top, width, height, radius);
  if (theme.fill !== "transparent") { ctx.fillStyle = theme.fill; ctx.fill(); }
  ctx.strokeStyle = theme.border; ctx.lineWidth = Math.max(1, unit * .0012); ctx.stroke();
  roundRect(ctx, left, top, Math.min(width, Math.max(4, unit * .005)), height, Math.min(radius, unit * .003)); ctx.fillStyle = theme.accent; ctx.fill();
  const inset = Math.max(5, Math.min(16, Math.round(unit * .012 * scale), height * .18));
  const usable = Math.max(4, width - inset * 2);
  const codeSize = Math.max(6, Math.min(Math.round(height * .22), Math.round(unit * .015 * scale)));
  const detailSize = Math.max(5, Math.min(Math.round(codeSize * .7), Math.round(unit * .01 * scale)));
  let y = top + inset * .65;
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = theme.accent; ctx.font = `800 ${codeSize}px ${fontStack(options.font)}`;
  const section = String(entry.section || "");
  const sectionWidth = section ? Math.min(usable * .28, ctx.measureText(section).width) : 0;
  ctx.fillText(ellipsizeCanvasText(ctx, entry.code || "COURSE", usable - sectionWidth - 8), left + inset, y);
  if (section) {
    ctx.fillStyle = theme.text; ctx.globalAlpha = .62; ctx.font = `700 ${detailSize}px ${fontStack(options.font)}`;
    ctx.fillText(ellipsizeCanvasText(ctx, section, usable * .28), left + width - inset - sectionWidth, y + Math.max(0, codeSize - detailSize)); ctx.globalAlpha = 1;
  }
  y += codeSize * 1.12;
  const details = [options.showTimes ? `${formatTime(meeting.start)}–${formatTime(meeting.end)}` : "", options.showRooms ? meetingRoom(entry, meeting) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meeting) || "TBA" : ""].filter(Boolean);
  if (details.length && y + detailSize <= top + height - inset * .35) {
    ctx.fillStyle = theme.text; ctx.globalAlpha = .62; ctx.font = `560 ${detailSize}px ${fontStack(options.font)}`;
    ctx.fillText(ellipsizeCanvasText(ctx, details.join("  ·  "), usable), left + inset, y); ctx.globalAlpha = 1;
    y += detailSize * 1.24;
  }
  if (entry.title && y + detailSize <= top + height - inset * .35) {
    ctx.fillStyle = theme.text; ctx.globalAlpha = .88; ctx.font = `620 ${detailSize}px ${fontStack(options.font)}`;
    ctx.fillText(ellipsizeCanvasText(ctx, entry.title, usable), left + inset, y); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawTimelineWallpaperCanvas(ctx, entries, days, options, metrics) {
  const { width, height, padding, gridTop, footerSpace, unit, textColor } = metrics;
  const columns = wallpaperColumnCount(options, days.length);
  const rows = Math.ceil(days.length / columns);
  const gap = Math.round(unit * .014);
  const dayWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const dayHeight = (height - gridTop - padding - footerSpace - gap * (rows - 1)) / rows;
  const startMinute = 7 * 60, endMinute = 21 * 60, minuteSpan = endMinute - startMinute;
  days.forEach((day, dayIndex) => {
    const column = dayIndex % columns, row = Math.floor(dayIndex / columns);
    const left = padding + column * (dayWidth + gap), dayTop = gridTop + row * (dayHeight + gap);
    const headingSize = Math.max(10, Math.round(unit * .014));
    ctx.fillStyle = textColor; ctx.globalAlpha = .7; ctx.font = `650 ${headingSize}px ${fontStack(options.font)}`;
    ctx.fillText(DAY_NAMES[day].toUpperCase(), left, dayTop + headingSize); ctx.globalAlpha = 1;
    const trackTop = dayTop + headingSize * 1.75;
    const trackHeight = Math.max(10, dayHeight - headingSize * 2);
    ctx.strokeStyle = hexToRgba(textColor, .12); ctx.lineWidth = 1;
    for (let hour = 0; hour <= 14; hour += 1) {
      const lineTop = trackTop + trackHeight * hour / 14;
      ctx.beginPath(); ctx.moveTo(left, lineTop); ctx.lineTo(left + dayWidth, lineTop); ctx.stroke();
    }
    if (options.showBreaks) for (const item of dailyBreaks(entries, day, 30)) {
      const top = trackTop + (item.start - startMinute) / minuteSpan * trackHeight;
      const breakHeight = item.minutes / minuteSpan * trackHeight;
      ctx.fillStyle = hexToRgba("#e1a62b", .14); ctx.fillRect(left, top, dayWidth, breakHeight);
      if (breakHeight >= 18) {
        const size = Math.max(7, Math.min(13, Math.round(breakHeight * .2)));
        ctx.fillStyle = "#9c6c13"; ctx.font = `700 ${size}px ${fontStack(options.font)}`;
        const label = `${formatDuration(item.minutes)} BREAK`.toUpperCase();
        ctx.fillText(ellipsizeCanvasText(ctx, label, dayWidth - 10), left + 5, top + Math.min(breakHeight - 4, size + 5));
      }
    }
    const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meeting) => meeting.day === day).map((meet) => ({ entry, meet }))), { minimumMinutes: Math.round(gridCardMinimumMinutes(options) * 1.2), maxEnd: endMinute });
    for (const { entry, meet, lane, laneCount, displayEnd } of items) {
      const laneGap = Math.max(2, unit * .003);
      const cardWidth = Math.max(4, dayWidth / laneCount - laneGap);
      const cardLeft = left + lane * dayWidth / laneCount;
      const top = trackTop + Math.max(0, meet.start - startMinute) / minuteSpan * trackHeight;
      const cardHeight = Math.max(8, (Math.min(endMinute, displayEnd) - Math.max(startMinute, meet.start)) / minuteSpan * trackHeight);
      drawWallpaperCanvasCard(ctx, entry, meet, options, cardLeft, top, cardWidth, cardHeight, unit);
    }
  });
}

function drawNeonCanvasEvent(ctx, entry, meet, options, left, top, width, height, unit) {
  const color = safeHex(entry.displayColor || entry.color, "#75f27b");
  const scale = options.contentScale / 100;
  const radius = Math.max(4, Math.min(10, unit * .008));
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
  roundRect(ctx, left + 1, top + 1, Math.max(1, width - 2), Math.max(1, height - 2), radius);
  ctx.fillStyle = hexToRgba(color, .14); ctx.fill();
  ctx.strokeStyle = hexToRgba(color, .5); ctx.lineWidth = Math.max(1, unit * .0015); ctx.stroke();
  roundRect(ctx, left + 1, top + 1, Math.max(3, unit * .004), Math.max(1, height - 2), Math.min(radius, 4));
  ctx.fillStyle = color; ctx.fill();
  const inset = Math.max(6, unit * .009);
  const usable = Math.max(4, width - inset * 2);
  const titleSize = Math.max(7, Math.min(unit * .0125 * scale, height * .2));
  const detailSize = Math.max(6, Math.min(unit * .009 * scale, titleSize * .76));
  const textLeft = left + inset;
  let y = top + Math.max(5, height * .08);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const code = String(entry.code || "COURSE");
  const title = String(entry.title || "");
  const section = String(entry.section || "");
  ctx.font = `650 ${detailSize}px Bahnschrift, "Arial Narrow", sans-serif`;
  let sectionWidth = section ? Math.min(usable * .24, ctx.measureText(section).width) : 0;
  const gap = Math.max(3, detailSize * .5);
  const codeFont = (size) => `900 ${size}px Bahnschrift, "Arial Narrow", sans-serif`;
  let codeSize = fittedCanvasFontSize(ctx, code, Math.max(6, usable - sectionWidth - gap), titleSize, 6, codeFont);
  let codeWidth = ctx.measureText(code).width;
  if (codeWidth + sectionWidth + gap > usable) {
    sectionWidth = 0;
    codeSize = fittedCanvasFontSize(ctx, code, usable, titleSize, 6, codeFont);
    codeWidth = ctx.measureText(code).width;
  }
  ctx.fillStyle = color; ctx.font = codeFont(codeSize); ctx.fillText(code, textLeft, y);
  const showSection = Boolean(section && sectionWidth);
  if (showSection) {
    ctx.fillStyle = "#777a75"; ctx.font = `650 ${detailSize}px Bahnschrift, "Arial Narrow", sans-serif`;
    ctx.fillText(ellipsizeCanvasText(ctx, section, usable * .25), left + width - inset - sectionWidth, top + Math.max(5, height * .08) + Math.max(0, titleSize - detailSize));
  }
  const titleLeft = textLeft + codeWidth + gap;
  const titleRight = showSection ? left + width - inset - sectionWidth - gap : left + width - inset;
  const titleWidth = Math.max(0, titleRight - titleLeft);
  if (title && titleWidth > detailSize * 1.4) {
    ctx.fillStyle = hexToRgba(color, .78); ctx.font = `700 ${Math.max(6, codeSize * .76)}px Bahnschrift, "Arial Narrow", sans-serif`;
    ctx.fillText(ellipsizeCanvasText(ctx, `– ${title}`, titleWidth), titleLeft, y + Math.max(0, codeSize * .12));
  }
  y += Math.max(titleSize, codeSize) * 1.04;
  y += Math.max(2, height * .035);
  const lines = [options.showTimes ? `${formatTime(meet.start)}–${formatTime(meet.end)}` : "", [options.showRooms ? meetingRoom(entry, meet) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meet) || "TBA" : ""].filter(Boolean).join(" · ")].filter(Boolean);
  for (let index = 0; index < lines.length && y + detailSize <= top + height - 3; index += 1) {
    ctx.fillStyle = index === lines.length - 1 ? "#a4a7a1" : "#d8dad5";
    ctx.font = `600 ${detailSize}px Bahnschrift, "Arial Narrow", sans-serif`;
    ctx.fillText(ellipsizeCanvasText(ctx, lines[index], usable), textLeft, y);
    y += detailSize * 1.25;
  }
  ctx.restore();
}

function drawNeonWallpaperCanvas(ctx, width, height, entries, days, options) {
  const unit = Math.min(width, height);
  const portrait = height > width * 1.2;
  const paddingX = Math.round(width * (portrait ? .045 : .03));
  const paddingY = Math.round(height * (portrait ? .035 : .04));
  const clockSpace = portrait ? height * options.clockSpace / 100 : 0;
  const titleSpace = Math.round(height * (portrait ? .095 : .14));
  const footerSpace = Math.max(24, Math.round(height * .035));
  const range = neonTimeRange(entries, options);
  const hourCount = (range.end - range.start) / 60;
  const groupSize = Math.max(1, neonGroupSize(options, days.length));
  const groups = chunkDays(days, groupSize);
  const groupGap = Math.max(10, Math.round(unit * .012));
  const groupAreaTop = paddingY + clockSpace + titleSpace;
  const groupAreaHeight = height - groupAreaTop - paddingY - footerSpace;
  const groupHeight = (groupAreaHeight - groupGap * Math.max(0, groups.length - 1)) / groups.length;
  ctx.fillStyle = "#020302"; ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "alphabetic";
  const titleSize = Math.round((portrait ? width : height) * (portrait ? .075 : .068) * options.contentScale / 100);
  ctx.fillStyle = "#f7f7f4"; ctx.font = `italic 900 ${titleSize}px Bahnschrift, "Arial Narrow", sans-serif`;
  const titleTop = paddingY + clockSpace;
  ctx.fillText(ellipsizeCanvasText(ctx, String(options.title || "WEEKLY SCHEDULE").toUpperCase(), width - paddingX * 2), paddingX + width * .055, titleTop + titleSize);
  if (options.subtitle) {
    const subtitleSize = Math.max(11, Math.round(unit * .011));
    ctx.font = `500 ${subtitleSize}px Bahnschrift, "Arial Narrow", sans-serif`;
    const pillWidth = Math.min(width * .48, ctx.measureText(options.subtitle).width + subtitleSize * 2);
    const pillHeight = subtitleSize * 1.8;
    roundRect(ctx, paddingX + width * .055, titleTop + titleSize + subtitleSize * .65, pillWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = "#050605"; ctx.fill(); ctx.strokeStyle = "#171917"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#858781"; ctx.textBaseline = "middle";
    ctx.fillText(ellipsizeCanvasText(ctx, options.subtitle, pillWidth - subtitleSize * 1.4), paddingX + width * .055 + subtitleSize * .7, titleTop + titleSize + subtitleSize * .65 + pillHeight / 2);
  }
  groups.forEach((group, groupIndex) => {
    const groupTop = groupAreaTop + groupIndex * (groupHeight + groupGap);
    const headHeight = Math.max(22, groupHeight * (portrait ? .09 : groups.length > 1 ? .1 : .09));
    const bodyTop = groupTop + headHeight;
    const bodyHeight = groupHeight - headHeight;
    const railWidth = Math.max(48, (width - paddingX * 2) * (portrait ? .115 : groups.length > 1 ? .085 : .06));
    const dayWidth = (width - paddingX * 2 - railWidth) / group.length;
    ctx.fillStyle = "#0b0c0b"; ctx.fillRect(paddingX, groupTop, width - paddingX * 2, headHeight);
    ctx.strokeStyle = "#151715"; ctx.lineWidth = 1;
    ctx.strokeRect(paddingX, groupTop, width - paddingX * 2, groupHeight);
    const daySize = Math.max(9, Math.min(18, Math.round(unit * (portrait ? .013 : .014) * options.contentScale / 100)));
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f1f1ee"; ctx.font = `800 ${daySize}px Bahnschrift, "Arial Narrow", sans-serif`;
    group.forEach((day, dayIndex) => {
      const dayLeft = paddingX + railWidth + dayIndex * dayWidth;
      ctx.fillText(DAY_NAMES[day].toUpperCase(), dayLeft + dayWidth / 2, groupTop + headHeight / 2);
      ctx.strokeStyle = "#151715"; ctx.beginPath(); ctx.moveTo(dayLeft, groupTop); ctx.lineTo(dayLeft, groupTop + groupHeight); ctx.stroke();
    });
    ctx.textAlign = "right"; ctx.fillStyle = "#747772";
    const timeSize = Math.max(8, Math.min(15, Math.round(unit * .011 * options.contentScale / 100)));
    ctx.font = `750 ${timeSize}px Bahnschrift, "Arial Narrow", sans-serif`;
    for (let hour = 0; hour <= hourCount; hour += 1) {
      const y = bodyTop + bodyHeight * hour / hourCount;
      ctx.strokeStyle = "#111311"; ctx.beginPath(); ctx.moveTo(paddingX, y); ctx.lineTo(width - paddingX, y); ctx.stroke();
      const labelY = Math.max(bodyTop + timeSize / 2, Math.min(bodyTop + bodyHeight - timeSize / 2, y));
      ctx.fillText(formatHourLabel(range.start + hour * 60), paddingX + railWidth - Math.max(5, unit * .007), labelY);
    }
    group.forEach((day, dayIndex) => {
      const dayLeft = paddingX + railWidth + dayIndex * dayWidth;
      ctx.save(); ctx.beginPath(); ctx.rect(dayLeft, bodyTop, dayWidth, bodyHeight); ctx.clip();
      if (options.showBreaks) for (const item of dailyBreaks(entries, day, 30)) {
        const top = bodyTop + (item.start - range.start) / (range.end - range.start) * bodyHeight;
        const breakHeight = item.minutes / (range.end - range.start) * bodyHeight;
        ctx.fillStyle = "rgba(151,95,0,.17)"; ctx.fillRect(dayLeft, top, dayWidth, breakHeight);
        ctx.strokeStyle = "rgba(222,161,26,.26)"; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(dayLeft, top); ctx.lineTo(dayLeft + dayWidth, top); ctx.moveTo(dayLeft, top + breakHeight); ctx.lineTo(dayLeft + dayWidth, top + breakHeight); ctx.stroke(); ctx.setLineDash([]);
        if (breakHeight >= timeSize * 1.6) {
          const breakSize = Math.max(7, Math.min(15, timeSize));
          ctx.fillStyle = "#dca11a"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `850 ${breakSize}px Bahnschrift, "Arial Narrow", sans-serif`;
          ctx.fillText(ellipsizeCanvasText(ctx, formatBreakLabel(item.minutes), dayWidth - 10), dayLeft + dayWidth / 2, top + breakHeight / 2);
        }
      }
      const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meet) => meet.day === day && meet.end > range.start && meet.start < range.end).map((meet) => ({ entry, meet }))), { minimumMinutes: gridCardMinimumMinutes(options), maxEnd: range.end });
      for (const { entry, meet, lane, laneCount, displayEnd } of items) {
        const laneGap = Math.max(2, unit * .003);
        const cardWidth = dayWidth / laneCount - laneGap;
        const cardLeft = dayLeft + lane * dayWidth / laneCount + laneGap / 2;
        const cardTop = bodyTop + Math.max(0, meet.start - range.start) / (range.end - range.start) * bodyHeight;
        const cardHeight = Math.max(10, (Math.min(range.end, displayEnd) - Math.max(range.start, meet.start)) / (range.end - range.start) * bodyHeight);
        drawNeonCanvasEvent(ctx, entry, meet, options, cardLeft, cardTop, cardWidth, cardHeight, unit);
      }
      ctx.restore();
    });
  });
  const stats = scheduleStats(entries);
  const footerSize = Math.max(10, Math.round(unit * .011));
  const footerY = height - paddingY * .55;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = "#5f625d"; ctx.font = `800 ${footerSize}px Bahnschrift, "Arial Narrow", sans-serif`;
  ctx.fillText(`${stats.units} UNITS`, paddingX, footerY);
  if (options.showWatermark) {
    const mark = "BUILT WITH  TIMORAFT"; ctx.textAlign = "right"; ctx.fillStyle = "#777a75"; ctx.font = `italic 800 ${footerSize}px Bahnschrift, "Arial Narrow", sans-serif`;
    ctx.fillText(mark, width - paddingX, footerY);
  }
  ctx.textAlign = "left";
}

function drawPastelCanvasEvent(ctx, entry, meet, options, left, top, width, height, unit) {
  const fill = blendHex(entry.displayColor || entry.color, "#ffffff", .3);
  const scale = options.contentScale / 100;
  const radius = Math.max(5, Math.min(13, unit * .011));
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
  ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = Math.max(2, unit * .006); ctx.shadowOffsetY = Math.max(1, unit * .002);
  roundRect(ctx, left + 1, top + 1, Math.max(1, width - 2), Math.max(1, height - 2), radius);
  ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.58)"; ctx.lineWidth = Math.max(1, unit * .0013); ctx.stroke();
  const inset = Math.max(6, Math.min(18, unit * .011 * scale));
  const usable = Math.max(4, width - inset * 2);
  const titleSize = Math.max(7, Math.min(unit * .014 * scale, height * .19));
  const detailSize = Math.max(6, Math.min(unit * .0095 * scale, titleSize * .72));
  const code = String(entry.code || "COURSE");
  const title = String(entry.title || "");
  const family = fontStack(options.font);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const section = String(entry.section || "");
  ctx.font = `750 ${detailSize}px ${family}`;
  let sectionWidth = section ? Math.min(usable * .24, ctx.measureText(section).width) : 0;
  const gap = Math.max(3, detailSize * .52);
  const codeFont = (size) => `900 ${size}px ${family}`;
  let codeSize = fittedCanvasFontSize(ctx, code, Math.max(6, usable - sectionWidth - gap), titleSize, 6, codeFont);
  let codeWidth = ctx.measureText(code).width;
  if (codeWidth + sectionWidth + gap > usable) {
    sectionWidth = 0;
    codeSize = fittedCanvasFontSize(ctx, code, usable, titleSize, 6, codeFont);
    codeWidth = ctx.measureText(code).width;
  }
  let y = top + inset * .7;
  ctx.fillStyle = "#171815"; ctx.font = codeFont(codeSize); ctx.fillText(code, left + inset, y);
  const showSection = Boolean(section && sectionWidth);
  if (showSection) {
    ctx.globalAlpha = .58; ctx.font = `750 ${detailSize}px ${family}`;
    ctx.fillText(ellipsizeCanvasText(ctx, section, usable * .25), left + width - inset - sectionWidth, top + inset * .8); ctx.globalAlpha = 1;
  }
  const titleLeft = left + inset + codeWidth + gap;
  const titleRight = showSection ? left + width - inset - sectionWidth - gap : left + width - inset;
  const titleWidth = Math.max(0, titleRight - titleLeft);
  if (title && titleWidth > detailSize * 1.4) {
    ctx.globalAlpha = .68; ctx.fillStyle = "#171815"; ctx.font = `700 ${Math.max(6, codeSize * .76)}px ${family}`;
    ctx.fillText(ellipsizeCanvasText(ctx, `– ${title}`, titleWidth), titleLeft, y + Math.max(0, codeSize * .12)); ctx.globalAlpha = 1;
  }
  y += Math.max(titleSize, codeSize) * 1.06;
  if (options.showTimes && y + detailSize <= top + height - inset * .35) {
    ctx.globalAlpha = .68; ctx.font = `600 ${detailSize}px ${family}`;
    ctx.fillText(ellipsizeCanvasText(ctx, `${formatTime(meet.start)}–${formatTime(meet.end)}`, usable), left + inset, y); ctx.globalAlpha = 1; y += detailSize * 1.22;
  }
  const place = [options.showRooms ? meetingRoom(entry, meet) || "TBA" : "", options.showProfessors ? meetingProfessor(entry, meet) || "TBA" : ""].filter(Boolean).join(" · ");
  if (place && y + detailSize <= top + height - inset * .3) {
    ctx.globalAlpha = .64; ctx.font = `560 ${detailSize}px ${family}`;
    ctx.fillText(ellipsizeCanvasText(ctx, place, usable), left + inset, y); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPastelWallpaperCanvas(ctx, width, height, entries, days, options) {
  const unit = Math.min(width, height);
  const portrait = height > width * 1.2;
  const clockSpace = portrait ? height * options.clockSpace / 100 : 0;
  const footerSpace = Math.max(26, height * .034);
  const groupSize = Math.max(1, neonGroupSize(options, days.length));
  const groups = chunkDays(days, groupSize);
  const range = neonTimeRange(entries, options);
  const hourCount = (range.end - range.start) / 60;
  const groupGap = Math.max(4, unit * .005);
  const groupAreaHeight = height - clockSpace - footerSpace;
  const groupHeight = (groupAreaHeight - groupGap * Math.max(0, groups.length - 1)) / groups.length;
  ctx.fillStyle = "#1d1f1c"; ctx.fillRect(0, 0, width, height);
  groups.forEach((group, groupIndex) => {
    const groupTop = clockSpace + groupIndex * (groupHeight + groupGap);
    const headerHeight = Math.max(28, groupHeight * (portrait ? .09 : .085));
    const bodyTop = groupTop + headerHeight;
    const bodyHeight = groupHeight - headerHeight;
    const railWidth = Math.max(52, width * (portrait ? .13 : groups.length > 1 ? .085 : .056));
    const dayWidth = (width - railWidth) / group.length;
    ctx.fillStyle = "#20221f"; ctx.fillRect(0, groupTop, width, headerHeight);
    ctx.strokeStyle = "#343631"; ctx.lineWidth = 1; ctx.strokeRect(0, groupTop, width, groupHeight);
    const daySize = Math.max(10, Math.min(20, unit * .014 * options.contentScale / 100));
    ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = "#bfc0ba"; ctx.font = `760 ${daySize}px ${fontStack(options.font)}`;
    group.forEach((day, dayIndex) => {
      const dayLeft = railWidth + dayIndex * dayWidth;
      const center = dayLeft + dayWidth / 2;
      const label = DAY_NAMES[day].toUpperCase();
      const dot = Math.max(4, daySize * .34);
      const labelWidth = ctx.measureText(label).width;
      ctx.beginPath(); ctx.arc(center - labelWidth / 2 - daySize * .7, groupTop + headerHeight / 2, dot / 2, 0, Math.PI * 2); ctx.fillStyle = "#a6aaa3"; ctx.fill();
      ctx.fillStyle = "#bfc0ba"; ctx.fillText(label, center + dot * .3, groupTop + headerHeight / 2);
      ctx.strokeStyle = "#373934"; ctx.beginPath(); ctx.moveTo(dayLeft, groupTop); ctx.lineTo(dayLeft, groupTop + groupHeight); ctx.stroke();
    });
    const timeSize = Math.max(8, Math.min(15, unit * .0098 * options.contentScale / 100));
    ctx.textAlign = "right"; ctx.font = `700 ${timeSize}px "Cascadia Mono", Consolas, monospace`;
    for (let hour = 0; hour <= hourCount; hour += 1) {
      const y = bodyTop + bodyHeight * hour / hourCount;
      ctx.strokeStyle = "#343631"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      const labelY = Math.max(bodyTop + timeSize / 2, Math.min(bodyTop + bodyHeight - timeSize / 2, y));
      ctx.fillStyle = "#a8aaa5"; ctx.fillText(formatTime(range.start + hour * 60), railWidth - Math.max(7, unit * .008), labelY);
    }
    group.forEach((day, dayIndex) => {
      const dayLeft = railWidth + dayIndex * dayWidth;
      ctx.save(); ctx.beginPath(); ctx.rect(dayLeft, bodyTop, dayWidth, bodyHeight); ctx.clip();
      if (options.showBreaks) for (const item of dailyBreaks(entries, day, 30)) {
        const top = bodyTop + (item.start - range.start) / (range.end - range.start) * bodyHeight;
        const breakHeight = item.minutes / (range.end - range.start) * bodyHeight;
        ctx.fillStyle = "rgba(139,100,25,.18)"; ctx.fillRect(dayLeft, top, dayWidth, breakHeight);
        ctx.strokeStyle = "rgba(197,145,41,.48)"; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(dayLeft, top); ctx.lineTo(dayLeft + dayWidth, top); ctx.moveTo(dayLeft, top + breakHeight); ctx.lineTo(dayLeft + dayWidth, top + breakHeight); ctx.stroke(); ctx.setLineDash([]);
        if (breakHeight >= timeSize * 1.8) {
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#a87516"; ctx.font = `820 ${Math.max(7, timeSize)}px ${fontStack(options.font)}`;
          ctx.fillText(ellipsizeCanvasText(ctx, formatBreakLabel(item.minutes), dayWidth - 12), dayLeft + dayWidth / 2, top + breakHeight / 2);
        }
      }
      const items = layoutMeetingLanes(entries.flatMap((entry) => entry.meetings.filter((meet) => meet.day === day && meet.end > range.start && meet.start < range.end).map((meet) => ({ entry, meet }))), { minimumMinutes: gridCardMinimumMinutes(options), maxEnd: range.end });
      for (const { entry, meet, lane, laneCount, displayEnd } of items) {
        const laneGap = Math.max(4, unit * .005);
        const cardWidth = dayWidth / laneCount - laneGap;
        const cardLeft = dayLeft + lane * dayWidth / laneCount + laneGap / 2;
        const cardTop = bodyTop + Math.max(0, meet.start - range.start) / (range.end - range.start) * bodyHeight;
        const cardHeight = Math.max(12, (Math.min(range.end, displayEnd) - Math.max(range.start, meet.start)) / (range.end - range.start) * bodyHeight);
        drawPastelCanvasEvent(ctx, entry, meet, options, cardLeft, cardTop, cardWidth, cardHeight, unit);
      }
      ctx.restore();
    });
  });
  const footerSize = Math.max(10, unit * .0105);
  const stats = scheduleStats(entries);
  ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "#858781"; ctx.font = `750 ${footerSize}px ${fontStack(options.font)}`;
  ctx.fillText(`${stats.units} UNITS`, Math.max(12, width * .015), height - footerSpace / 2);
  if (options.showWatermark) { ctx.textAlign = "right"; ctx.fillStyle = "#c9cbc5"; ctx.font = `italic 800 ${footerSize}px ${fontStack(options.font)}`; ctx.fillText("TIMORAFT", width - Math.max(12, width * .015), height - footerSpace / 2); }
  ctx.textAlign = "left";
}

function triggerWallpaperDownload(canvas, width, height, options) {
  $("#downloadWallpaper").dataset.lastExport = `${width}x${height}`;
  const link = document.createElement("a"); link.download = `timoraft-${options.ratio.replace(":", "x")}.png`; link.href = canvas.toDataURL("image/png"); link.click(); toast("Wallpaper downloaded");
}

async function downloadWallpaper() {
  const options = state.wallpaper;
  const sizes = { "16:9": [1920, 1080], "9:16": [1080, 1920], "9:19.5": [1170, 2535], "9:21": [1080, 2520], "4:3": [1600, 1200], "1:1": [1400, 1400] };
  const [width, height] = sizes[options.ratio];
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  const days = visibleDays(options.showSunday);
  const entries = resolvedWallpaperEntries();
  if (options.layout === "neon-grid") {
    drawNeonWallpaperCanvas(ctx, width, height, entries, days, options);
    triggerWallpaperDownload(canvas, width, height, options);
    return;
  }
  if (options.layout === "pastel-grid") {
    drawPastelWallpaperCanvas(ctx, width, height, entries, days, options);
    triggerWallpaperDownload(canvas, width, height, options);
    return;
  }
  const isPortrait = height > width * 1.2;
  const unit = Math.min(width, height);
  const padding = Math.round(unit * (isPortrait ? .064 : .058));
  const clockSpace = isPortrait ? height * options.clockSpace / 100 : 0;
  const contentTop = padding + clockSpace;
  const textColor = safeHex(options.textColor, "#20211f");
  const radians = options.angle * Math.PI / 180;
  const x = Math.cos(radians), y = Math.sin(radians);
  const gradient = ctx.createLinearGradient(width * (.5 - x / 2), height * (.5 - y / 2), width * (.5 + x / 2), height * (.5 + y / 2));
  gradient.addColorStop(0, safeHex(options.bgA, "#f2f0e9")); gradient.addColorStop(1, safeHex(options.bgB, "#d8e0d4"));
  const bg = await loadCanvasImage(safeImageData(options.image));
  if (bg) { const scale = Math.max(width / bg.width, height / bg.height); ctx.drawImage(bg, (width - bg.width * scale) / 2, (height - bg.height * scale) / 2, bg.width * scale, bg.height * scale); ctx.globalAlpha = .82; }
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
  const titleSize = Math.round(isPortrait ? width * .082 : height * .068);
  const subtitleSize = Math.max(16, Math.round(titleSize * .24));
  ctx.fillStyle = textColor; ctx.textBaseline = "alphabetic"; ctx.font = `700 ${titleSize}px ${fontStack(options.font)}`;
  ctx.fillText(ellipsizeCanvasText(ctx, options.title || "MY WEEK", width - padding * 2), padding, contentTop + titleSize);
  ctx.globalAlpha = .62; ctx.font = `500 ${subtitleSize}px ${fontStack(options.font)}`;
  ctx.fillText(ellipsizeCanvasText(ctx, options.subtitle || "", width - padding * 2), padding, contentTop + titleSize + subtitleSize * 1.65); ctx.globalAlpha = 1;
  const columns = wallpaperColumnCount(options, days.length);
  const rows = Math.ceil(days.length / columns);
  const gap = Math.round(unit * .014);
  const gridTop = contentTop + titleSize + subtitleSize * 2.8;
  const footerSpace = options.showWatermark ? Math.round(unit * .035) : 0;
  const dayWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const dayHeight = (height - gridTop - padding - footerSpace - gap * (rows - 1)) / rows;
  if (options.layout === "timeline") drawTimelineWallpaperCanvas(ctx, entries, days, options, { width, height, padding, gridTop, footerSpace, unit, textColor });
  else days.forEach((day, dayIndex) => {
    const column = dayIndex % columns;
    const row = Math.floor(dayIndex / columns);
    const left = padding + column * (dayWidth + gap);
    const dayTop = gridTop + row * (dayHeight + gap);
    const panelInset = Math.max(5, Math.round(unit * .008));
    const panelRadius = Math.max(8, Math.round(unit * .012));
    roundRect(ctx, left, dayTop, dayWidth, dayHeight, panelRadius);
    ctx.fillStyle = hexToRgba(textColor, options.layout === "compact-grid" ? .025 : .045); ctx.fill();
    ctx.strokeStyle = hexToRgba(textColor, .11); ctx.lineWidth = 1; ctx.stroke();
    const headingSize = Math.max(11, Math.round(unit * .014 * options.contentScale / 100));
    ctx.fillStyle = textColor; ctx.globalAlpha = .7; ctx.font = `760 ${headingSize}px ${fontStack(options.font)}`;
    ctx.fillText(DAY_NAMES[day].toUpperCase(), left + panelInset, dayTop + panelInset + headingSize); ctx.globalAlpha = 1;
    const meetings = entries.flatMap((entry) => entry.meetings.filter((meeting) => meeting.day === day).map((meeting) => ({ entry, meeting }))).sort((a, b) => a.meeting.start - b.meeting.start);
    const cardsLeft = left + panelInset;
    const cardsWidth = Math.max(4, dayWidth - panelInset * 2);
    const cardsTop = dayTop + panelInset + headingSize * 1.55;
    const available = Math.max(8, dayHeight - (cardsTop - dayTop) - panelInset);
    const cardGap = meetings.length ? Math.min(Math.max(2, Math.round(unit * .008)), available / Math.max(1, meetings.length * 9)) : 0;
    const idealHeight = (options.layout === "agenda" ? unit * .065 : unit * (isPortrait ? .078 : .07)) * options.contentScale / 100;
    const fitHeight = meetings.length ? (available - cardGap * Math.max(0, meetings.length - 1)) / meetings.length : 0;
    const cardHeight = meetings.length ? Math.max(5, Math.min(idealHeight, fitHeight)) : 0;
    let top = cardsTop;
    for (const { entry, meeting } of meetings) {
      drawWallpaperCanvasCard(ctx, entry, meeting, options, cardsLeft, top, cardsWidth, cardHeight, unit);
      top += cardHeight + cardGap;
    }
  });
  if (options.showWatermark) {
    ctx.fillStyle = textColor; ctx.globalAlpha = .48; ctx.font = `600 ${Math.max(13, Math.round(unit * .013))}px ${fontStack(options.font)}`;
    const mark = "timoraft"; ctx.fillText(mark, width - padding - ctx.measureText(mark).width, height - padding * .45); ctx.globalAlpha = 1;
  }
  triggerWallpaperDownload(canvas, width, height, options);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.roundRect(x, y, width, height, r);
}

async function init() {
  const saved = await storageGet();
  if (saved?.courses && saved?.options) state = migrateState(saved);
  bind(); renderAll();
}

init();
