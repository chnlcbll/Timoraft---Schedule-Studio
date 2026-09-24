// Preview and PNG share measured text lines, card bounds and positions.
const DAY = { M: "MON", T: "TUE", W: "WED", H: "THU", F: "FRI", S: "SAT", U: "SUN" };
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const courseCode = (entry) => String(entry.code || "COURSE").trim().split(/\s+[-–—]\s+/)[0].trim() || "COURSE";
const colorFor = (entry) => /^#[\da-f]{6}$/i.test(entry.displayColor || "") ? entry.displayColor : /^#[\da-f]{6}$/i.test(entry.color || "") ? entry.color : "#a6b2a7";
const rgba = (color, alpha) => `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
const readableAccent = (color) => `#${[1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .65 + 255 * .35).toString(16).padStart(2, "0")).join("")}`;
const clock = (minutes) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${minutes < 720 ? "AM" : "PM"}`;
const font = (line) => `${line.italic ? "italic " : ""}${line.weight} ${line.size}px Arial, sans-serif`;
let measuringContext;

function wrapText(ctx, value, width, style) {
  ctx.font = font(style);
  const lines = [];
  let line = "";
  for (const word of String(value).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of word) {
      if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(ctx, value, x, y, width, style, field) {
  const leading = style.size * 1.27;
  const lines = wrapText(ctx, value, width, style).map((text, index) => ({
    ...style, text, x, y: y + style.size + index * leading, field,
  }));
  return { lines, height: lines.length * leading };
}

function measureCard(ctx, item, width, unit, scale) {
  const { entry, meeting } = item;
  const color = colorFor(entry);
  const pad = unit * 10;
  const gap = unit * 2;
  const usable = width - pad * 2;
  const sectionWidth = entry.section ? usable * .23 : 0;
  const code = textBlock(ctx, courseCode(entry), pad, pad, usable - sectionWidth - gap,
    { size: 23 * unit * scale, weight: 900, color: readableAccent(color) }, "code");
  const section = textBlock(ctx, entry.section || "", width - pad - sectionWidth, pad, sectionWidth || usable,
    { size: 13 * unit * scale, weight: 600, color: "#c4c6c0" }, "section");
  const lines = [...code.lines, ...section.lines];
  let y = pad + Math.max(code.height, section.height) + gap;
  const details = [
    ["time", `${clock(meeting.start)}–${clock(meeting.end)}`, 18, 700, "#f5f5f2"],
    ["room", `Room: ${meeting.room || entry.room || "TBA"}`, 16, 600, "#e0e2dc"],
    ["professor", `Prof: ${meeting.professor || entry.professor || "TBA"}`, 15, 400, "#c3c6be"],
  ];
  for (const [field, value, size, weight, textColor] of details) {
    const block = textBlock(ctx, value, pad, y, usable, { size: size * unit * scale, weight, color: textColor }, field);
    lines.push(...block.lines);
    y += block.height + gap;
  }
  return { ...item, color, lines, width, height: y - gap + pad, radius: 13 * unit };
}

export function referencePhoneLayout(entries, days, width, height, options, ctx) {
  if (!ctx) {
    measuringContext ||= document.createElement("canvas").getContext("2d");
    ctx = measuringContext;
  }
  const unit = width / 1080;
  const outer = width * .031;
  const inset = width * .032;
  const contentX = outer + inset;
  const contentWidth = width - contentX * 2;
  const columnGap = width * .018;
  const columnWidth = (contentWidth - columnGap) / 2;
  const scale = Math.max(.8, Math.min(1.6, (Number(options.textScale) || 100) / 100));
  const clockSpace = Math.max(0, Math.min(44, Number(options.clockSpace ?? 30)));
  const panelTop = height * clockSpace / 100 + 18 * unit;
  const panelBottom = height * .959;
  const headingTop = panelTop + inset;
  const title = textBlock(ctx, options.title || "WEEKLY SCHEDULE", contentX, headingTop, contentWidth,
    { size: 41 * unit, weight: 900, italic: true, color: "#f6f5f2" }, "title");
  const subtitle = textBlock(ctx, options.subtitle || "", contentX, headingTop + title.height + 8 * unit, contentWidth,
    { size: 15 * unit, weight: 400, color: "#b3b6ae" }, "subtitle");
  const groupsTop = headingTop + title.height + (subtitle.height ? subtitle.height + 8 * unit : 0) + 22 * unit;
  const footerY = panelBottom - inset;
  const cardGap = 7 * unit;
  const dayGap = 23 * unit;
  const dayHeadingHeight = 31 * unit;
  const groups = days.map((day, index) => ({ day, column: index % 2, events: entries.flatMap((entry) =>
    (entry.meetings || []).filter((meeting) => meeting.day === day).map((meeting) => ({ entry, meeting })))
    .sort((a, b) => a.meeting.start - b.meeting.start || a.meeting.end - b.meeting.end) }));
  const available = Math.max(1, footerY - 28 * unit - groupsTop);
  function arrange(textScale) {
    const bottoms = [0, 0];
    const cards = [];
    const headings = [];
    for (const group of groups) {
      const x = contentX + group.column * (columnWidth + columnGap);
      let y = bottoms[group.column];
      headings.push({ text: DAY[group.day], x, y: groupsTop + y + 22 * unit, size: 22 * unit, weight: 900, italic: true, color: "#cfd0cb", field: "day" });
      y += dayHeadingHeight;
      for (const item of group.events) {
        const card = measureCard(ctx, item, columnWidth, unit, textScale);
        cards.push({ ...card, day: group.day, x, y: groupsTop + y });
        y += card.height + cardGap;
      }
      bottoms[group.column] = y + dayGap;
    }
    return { cards, headings, height: Math.max(...bottoms) - dayGap };
  }
  // Measure every wrapped line before fitting. Never clip/drop a detail to fit.
  let fittedScale = scale;
  let layout = arrange(fittedScale);
  if (layout.height > available) {
    let low = 0;
    let high = scale;
    for (let step = 0; step < 20; step += 1) {
      const middle = (low + high) / 2;
      if (arrange(middle).height <= available) low = middle;
      else high = middle;
    }
    fittedScale = low;
    layout = arrange(fittedScale);
  }
  const units = entries.reduce((sum, entry) => sum + (Number(entry.units) || 0), 0);
  const footer = [{ text: `${units} UNITS`, x: contentX, y: footerY, size: 14 * unit, weight: 700, color: "#a0a39a", field: "footer" }];
  const sources = ["A", "B"].filter((source) => entries.some((entry) => entry.source === source));
  sources.forEach((source, index) => footer.push({ text: source, x: width / 2 + index * 30 * unit, y: footerY,
    size: 14 * unit, weight: 700, color: colorFor(entries.find((entry) => entry.source === source)), field: "footer" }));
  if (options.showWatermark) footer.push({ text: "TIMORAFT", x: width - contentX, y: footerY, size: 14 * unit, weight: 700, color: "#a0a39a", anchor: "end", field: "footer" });
  return { ...layout, width, height, outer, panelTop, panelBottom, footerY, available, fittedScale,
    fitLimited: fittedScale < scale - .005, labels: [...title.lines, ...subtitle.lines, ...layout.headings, ...footer] };
}

function svgText(line) {
  return `<text data-field="${line.field}" x="${line.x}" y="${line.y}" fill="${line.color}" font-size="${line.size}" font-weight="${line.weight}" font-style="${line.italic ? "italic" : "normal"}" text-anchor="${line.anchor || "start"}">${escapeText(line.text)}</text>`;
}

export function referencePhonePreviewMarkup(entries, days, options) {
  const width = 1080;
  const [a, b] = options.ratio.split(":").map(Number);
  const height = Math.round(width * b / a);
  const model = referencePhoneLayout(entries, days, width, height, options);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="reference-phone-art" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly schedule wallpaper" data-fit-limited="${model.fitLimited}">
    <rect width="${width}" height="${height}" fill="#090909" />
    <rect x="${model.outer}" y="${model.panelTop}" width="${width - model.outer * 2}" height="${model.panelBottom - model.panelTop}" rx="${width * .055}" fill="#111210" stroke="#2b2c29" stroke-width="1.5" />
    ${model.labels.map(svgText).join("")}
    ${model.cards.map((card) => `<g class="reference-phone-card" transform="translate(${card.x} ${card.y})" data-height="${card.height}" data-width="${card.width}">
      <title>${escapeText(`${courseCode(card.entry)} · ${card.entry.section || ""} · Room: ${card.meeting.room || card.entry.room || "TBA"}`)}</title>
      <rect width="${card.width}" height="${card.height}" rx="${card.radius}" fill="${rgba(card.color, .14)}" stroke="${rgba(card.color, .36)}" stroke-width="1.5" />
      ${card.lines.map(svgText).join("")}</g>`).join("")}
  </svg>`;
}

export function drawReferencePhoneCanvas(ctx, width, height, entries, days, options) {
  const model = referencePhoneLayout(entries, days, width, height, options, ctx);
  ctx.save();
  ctx.fillStyle = "#090909"; ctx.fillRect(0, 0, width, height);
  ctx.beginPath(); ctx.roundRect(model.outer, model.panelTop, width - model.outer * 2, model.panelBottom - model.panelTop, width * .055);
  ctx.fillStyle = "#111210"; ctx.fill(); ctx.strokeStyle = "#2b2c29"; ctx.lineWidth = 1.5; ctx.stroke();
  const drawText = (line, x = 0, y = 0) => {
    ctx.font = font(line); ctx.fillStyle = line.color;
    ctx.textAlign = line.anchor === "end" ? "right" : "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(line.text, x + line.x, y + line.y);
  };
  model.labels.forEach((line) => drawText(line));
  for (const card of model.cards) {
    ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, card.radius);
    ctx.fillStyle = rgba(card.color, .14); ctx.fill(); ctx.strokeStyle = rgba(card.color, .36); ctx.stroke();
    card.lines.forEach((line) => drawText(line, card.x, card.y));
  }
  ctx.restore();
  return model;
}
