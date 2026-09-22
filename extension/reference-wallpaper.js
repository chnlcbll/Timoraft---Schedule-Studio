// The reference layout is kept separate from the other wallpaper renderers.
// Both the preview and PNG use the same day/card ordering and phone geometry.
const DAY = { M: "MON", T: "TUE", W: "WED", H: "THU", F: "FRI", S: "SAT", U: "SUN" };

const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const courseCode = (entry) => String(entry.code || "COURSE").trim().split(/\s+[-–—]\s+/)[0].trim() || "COURSE";
const colorFor = (entry) => /^#[\da-f]{6}$/i.test(entry.displayColor || "") ? entry.displayColor : /^#[\da-f]{6}$/i.test(entry.color || "") ? entry.color : "#a6b2a7";
const rgba = (color, alpha) => {
  const hex = colorFor({ color });
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;
};
const clock = (minutes) => {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};
const meetingRoom = (entry, meeting) => String(meeting.room || entry.room || "TBA");
const meetingProfessor = (entry, meeting) => String(meeting.professor || entry.professor || "TBA");

function phoneModel(entries, days, width, height, options) {
  const groups = [];
  for (let index = 0; index < days.length; index += 2) {
    const pair = days.slice(index, index + 2).map((day) => ({
      day,
      events: entries.flatMap((entry) => (entry.meetings || []).filter((meeting) => meeting.day === day).map((meeting) => ({ entry, meeting })))
        .sort((a, b) => a.meeting.start - b.meeting.start || a.meeting.end - b.meeting.end),
    }));
    groups.push({ pair, slots: Math.max(1, ...pair.map(({ events }) => events.length)) });
  }
  const slots = groups.reduce((sum, group) => sum + group.slots, 0);
  const safeTop = Math.max(.30, Math.min(.48, (Number(options.clockSpace) || 30) / 100 + .015));
  const typeScale = Math.max(.8, Math.min(1.6, (Number(options.textScale) || 100) / 100));
  const growth = Math.max(0, (typeScale - 1) / .6);
  const outer = width * .031;
  const inset = width * .039;
  const panelBottom = height - height * .041;
  const titleSize = width * .038;
  const subtitleSize = width * .014;
  const footerHeight = Math.max(20, width * .026);
  const groupGap = Math.max(5, width * (.021 - growth * .010));
  const dayHeadingHeight = Math.max(15, width * .028);
  const cardGap = Math.max(3, width * (.008 - growth * .0045));
  const headerOffset = height * .022 + titleSize * 1.65 + subtitleSize * 2.25;
  const desiredCardHeight = width * (.061 + growth * .022);
  const fixedContentHeight = height * .022 + titleSize * 1.65 + subtitleSize * 2.25
    + inset + footerHeight + groupGap * (groups.length - 1)
    + groups.length * dayHeadingHeight + cardGap * (slots - groups.length);
  const preferredTop = height * Math.max(safeTop, Math.min(.39, .53 - slots * .018));
  // Preserve a substantial lock-screen clock area, but reclaim enough of the
  // optional safe area for the cards when the user explicitly enlarges them.
  const minimumTop = height * Math.max(.24, safeTop - growth * .075);
  const requestedTop = panelBottom - fixedContentHeight - slots * desiredCardHeight;
  const panelTop = Math.max(minimumTop, Math.min(preferredTop, requestedTop));
  const headingTop = panelTop + height * .022;
  const groupsTop = panelTop + headerOffset;
  const available = panelBottom - inset - footerHeight - groupsTop - groupGap * (groups.length - 1) - groups.length * dayHeadingHeight - cardGap * (slots - groups.length);
  const cardHeight = Math.max(12, available / Math.max(1, slots));
  const cardPadding = Math.max(.42, .75 - growth * .3);
  return { groups, slots, panelTop, panelBottom, outer, inset, headingTop, titleSize, subtitleSize, groupsTop, footerHeight, groupGap, dayHeadingHeight, cardGap, cardHeight, desiredCardHeight, cardPadding };
}

export function referencePhonePreviewMarkup(entries, days, options) {
  const width = 1080;
  const height = Math.round(width * Number(options.ratio.split(":")[1]) / 9);
  const model = phoneModel(entries, days, width, height, options);
  const merged = entries.some((entry) => entry.source === "A" || entry.source === "B");
  const cards = ({ events }) => events.map(({ entry, meeting }) => {
    const color = colorFor(entry);
    return `<article class="reference-phone-card" style="--reference-accent:${color};--reference-fill:${rgba(color, .14)};--reference-stroke:${rgba(color, .34)}" title="${escapeText(`${courseCode(entry)} · ${entry.section || ""} · ${clock(meeting.start)}–${clock(meeting.end)}`)}">
      <div class="reference-phone-card-head"><b>${escapeText(courseCode(entry))}</b><small>${escapeText(entry.section || "")}</small></div>
      <strong>${escapeText(`${clock(meeting.start)}–${clock(meeting.end)}`)}</strong>
      <span>${escapeText(meetingRoom(entry, meeting))}<i> · ${escapeText(meetingProfessor(entry, meeting))}</i></span>
    </article>`;
  }).join("");
  const groups = model.groups.map(({ pair, slots }) => `<div class="reference-phone-row" style="--row-slots:${slots}">${pair.map((item) => `<section class="reference-phone-day"><h4>${DAY[item.day]}</h4><div class="reference-phone-events">${cards(item)}</div></section>`).join("")}</div>`).join("");
  const units = entries.reduce((sum, entry) => sum + (Number(entry.units) || 0), 0);
  const rowTemplate = model.groups.map((group) => model.dayHeadingHeight + group.slots * model.cardHeight + (group.slots - 1) * model.cardGap).map((size) => `${size}fr`).join(" ");
  return `<div class="reference-phone-inner" style="--reference-panel-top:${model.panelTop / height * 100}%;--reference-card-scale:${Math.min(1, model.cardHeight / 80) * (options.textScale || 100) / 100};--reference-card-min:${model.cardHeight / width * 100}cqi;--reference-card-gap:${model.cardGap / width * 100}cqi;--reference-group-gap:${model.groupGap / width * 100}cqi;--reference-card-pad:${model.cardPadding}cqi">
    <div class="reference-phone-panel"><header><h3>${escapeText(options.title || "WEEKLY SCHEDULE")}</h3>${options.subtitle ? `<p>${escapeText(options.subtitle)}</p>` : ""}</header>
      <div class="reference-phone-rows" style="grid-template-rows:${rowTemplate}">${groups}</div>
      <footer><span>${units} UNITS</span>${merged ? `<span class="reference-phone-legend">${["A", "B"].map((source) => { const entry = entries.find((item) => item.source === source); return entry ? `<i style="--reference-accent:${colorFor(entry)}">${source}</i>` : ""; }).join("")}</span>` : ""}${options.showWatermark ? `<span>TIMORAFT</span>` : ""}</footer>
    </div>
  </div>`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(1, width), Math.max(1, height), radius);
}

function fitText(ctx, value, maxWidth, maxSize, minimumSize, weight = "700", family = "Arial, sans-serif") {
  let size = Math.max(minimumSize, maxSize);
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minimumSize && ctx.measureText(value).width > maxWidth) {
    size = Math.max(minimumSize, size - .5);
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function wrapDetail(ctx, value, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(value).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of word) {
      if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx, item, x, y, width, height, options) {
  const { entry, meeting } = item;
  const color = colorFor(entry);
  const radius = Math.max(8, Math.min(18, height * .17));
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = rgba(color, .14); ctx.fill();
  ctx.strokeStyle = rgba(color, .36); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); roundedRect(ctx, x, y, width, height, radius); ctx.clip();
  const pad = Math.max(7, Math.min(15, height * .14));
  const textX = x + pad;
  const usable = width - pad * 2;
  const scale = Math.max(.8, Math.min(1.6, (options.textScale || 100) / 100));
  const code = courseCode(entry);
  const section = String(entry.section || "");
  const codeSize = fitText(ctx, code, usable - (section ? width * .15 : 0), Math.min(23 * scale, height * .25), 9, "900", "Arial, sans-serif");
  ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.fillStyle = color; ctx.font = `900 ${codeSize}px Arial, sans-serif`;
  ctx.fillText(code, textX, y + pad * .7);
  if (section) {
    const sectionSize = fitText(ctx, section, width * .16, Math.min(14 * scale, height * .16), 7);
    ctx.font = `700 ${sectionSize}px Arial, sans-serif`; ctx.textAlign = "right"; ctx.fillStyle = "#979a96";
    ctx.fillText(section, x + width - pad, y + pad * .7 + Math.max(0, codeSize - sectionSize));
  }
  const secondY = y + pad * .7 + codeSize * 1.22;
  const time = `${clock(meeting.start)}–${clock(meeting.end)}`;
  const timeSize = fitText(ctx, time, usable, Math.min(19 * scale, height * .22), 8, "700");
  ctx.textAlign = "left"; ctx.font = `700 ${timeSize}px Arial, sans-serif`; ctx.fillStyle = "#f5f5f2";
  if (secondY + timeSize < y + height - 5) ctx.fillText(time, textX, secondY);
  const meta = `${meetingRoom(entry, meeting)}  ·  ${meetingProfessor(entry, meeting)}`;
  const metaY = secondY + timeSize * 1.28;
  let metaSize = Math.min(15 * scale, height * .17);
  let metaLines = [];
  while (metaSize >= 5) {
    ctx.font = `italic 500 ${metaSize}px Arial, sans-serif`;
    metaLines = wrapDetail(ctx, meta, usable);
    if (metaY + metaLines.length * metaSize * 1.1 < y + height - 3 || metaSize === 5) break;
    metaSize = Math.max(5, metaSize - .5);
  }
  ctx.fillStyle = "#b9bbb6";
  metaLines.forEach((line, index) => { if (metaY + (index + 1) * metaSize * 1.1 < y + height - 3) ctx.fillText(line, textX, metaY + index * metaSize * 1.1); });
  ctx.restore();
}

export function drawReferencePhoneCanvas(ctx, width, height, entries, days, options) {
  const model = phoneModel(entries, days, width, height, options);
  ctx.fillStyle = "#090909"; ctx.fillRect(0, 0, width, height);
  const panelX = model.outer;
  const panelWidth = width - model.outer * 2;
  roundedRect(ctx, panelX, model.panelTop, panelWidth, model.panelBottom - model.panelTop, width * .055);
  ctx.fillStyle = "#111210"; ctx.fill(); ctx.strokeStyle = "#2b2c29"; ctx.lineWidth = 1.5; ctx.stroke();
  const contentX = panelX + model.inset;
  const contentWidth = panelWidth - model.inset * 2;
  ctx.fillStyle = "#f6f5f2"; ctx.textBaseline = "top"; ctx.font = `italic 900 ${model.titleSize}px Arial, sans-serif`;
  ctx.fillText(String(options.title || "WEEKLY SCHEDULE").toUpperCase(), contentX, model.headingTop, contentWidth);
  if (options.subtitle) {
    const subtitle = String(options.subtitle);
    const subtitleY = model.headingTop + model.titleSize * 1.25;
    ctx.font = `500 ${model.subtitleSize}px Arial, sans-serif`;
    const pillWidth = Math.min(contentWidth, ctx.measureText(subtitle).width + model.subtitleSize * 1.6);
    roundedRect(ctx, contentX, subtitleY, pillWidth, model.subtitleSize * 1.65, model.subtitleSize);
    ctx.fillStyle = "#151614"; ctx.fill(); ctx.strokeStyle = "#262724"; ctx.stroke();
    ctx.fillStyle = "#92958f"; ctx.fillText(subtitle, contentX + model.subtitleSize * .8, subtitleY + model.subtitleSize * .3, pillWidth - model.subtitleSize * 1.6);
  }
  const columnGap = width * .015;
  const columnWidth = (contentWidth - columnGap) / 2;
  let y = model.groupsTop;
  for (const group of model.groups) {
    const headingSize = Math.min(23, width * .021);
    group.pair.forEach(({ day, events }, index) => {
      const x = contentX + index * (columnWidth + columnGap);
      ctx.fillStyle = "#d0d0cc"; ctx.font = `italic 850 ${headingSize}px Arial, sans-serif`; ctx.textBaseline = "top";
      ctx.fillText(DAY[day], x, y);
      events.forEach((item, eventIndex) => drawCard(ctx, item, x, y + model.dayHeadingHeight + eventIndex * (model.cardHeight + model.cardGap), columnWidth, model.cardHeight, options));
    });
    y += model.dayHeadingHeight + group.slots * model.cardHeight + (group.slots - 1) * model.cardGap + model.groupGap;
  }
  const units = entries.reduce((sum, entry) => sum + (Number(entry.units) || 0), 0);
  ctx.fillStyle = "#737570"; ctx.font = `700 ${Math.max(13, width * .014)}px Arial, sans-serif`;
  ctx.fillText(`${units} UNITS`, contentX, model.panelBottom - model.inset - 2);
  const sources = ["A", "B"].map((source) => ({ source, entry: entries.find((item) => item.source === source) })).filter((item) => item.entry);
  if (sources.length) {
    ctx.textAlign = "center";
    sources.forEach(({ source, entry }, index) => {
      ctx.fillStyle = colorFor(entry);
      ctx.fillText(source, contentX + contentWidth / 2 + (index - (sources.length - 1) / 2) * width * .035, model.panelBottom - model.inset - 2);
    });
    ctx.textAlign = "left";
  }
  if (options.showWatermark) {
    ctx.textAlign = "right"; ctx.fillText("TIMORAFT", contentX + contentWidth, model.panelBottom - model.inset - 2); ctx.textAlign = "left";
  }
}
