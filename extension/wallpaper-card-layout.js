// Measure every visible field before allocating a card. Both preview and PNG
// render these same lines; no renderer may discard a line to make it fit.
function fontFor(size, weight, family) { return `${weight} ${size}px ${family}`; }

function textWidth(ctx, text) {
  const metrics = ctx.measureText(text);
  return Math.max(metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
}

function wrap(ctx, value, width) {
  const lines = [];
  let line = "";
  for (const word of String(value).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(ctx, candidate) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of word) {
      if (line && textWidth(ctx, line + character) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function measureCardText(ctx, fields, width, style, factor = 1) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const scale = style.scale * factor;
  const padding = style.unit * .009 * scale;
  const usable = Math.max(.01, width - padding * 2);
  const codeSize = style.unit * .017 * scale;
  const detailSize = style.unit * .0125 * scale;
  const family = style.family || "Arial, sans-serif";
  const gap = detailSize * .12;
  const lines = [];
  let y = padding;
  const metricsFor = (text, size, weight) => {
    const font = fontFor(size, weight, family);
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const ascent = Math.max(size * .85, metrics.actualBoundingBoxAscent || 0);
    const descent = Math.max(size * .25, metrics.actualBoundingBoxDescent || 0);
    return { font, size, ascent, descent, width: textWidth(ctx, text), bearing: Math.max(0, metrics.actualBoundingBoxLeft || 0) };
  };
  const append = (field, text, size, weight) => {
    ctx.font = fontFor(size, weight, family);
    for (const value of wrap(ctx, text, usable - size * .08)) {
      const metrics = metricsFor(value, size, weight);
      lines.push({ field, text: value, x: padding + metrics.bearing, y: y + metrics.ascent, ...metrics });
      y += metrics.ascent + metrics.descent + gap;
    }
  };
  const code = metricsFor(fields.code, codeSize, 800);
  const section = metricsFor(fields.section || "", detailSize, 600);
  if (fields.section && code.width + section.width + detailSize * .7 <= usable) {
    const baseline = y + Math.max(code.ascent, section.ascent);
    lines.push({ field: "code", text: fields.code, x: padding + code.bearing, y: baseline, ...code });
    lines.push({ field: "section", text: fields.section, x: width - padding - section.width, y: baseline, ...section });
    y = baseline + Math.max(code.descent, section.descent) + gap;
  } else {
    append("code", fields.code, codeSize, 800);
    if (fields.section) append("section", `Section: ${fields.section}`, detailSize, 600);
  }
  for (const field of ["time", "room", "professor"]) {
    if (fields[field]) append(field, field === "room" ? `Room: ${fields[field]}` : fields[field], detailSize, field === "time" ? 650 : 500);
  }
  ctx.restore();
  return { width, height: y + padding, lines, factor, padding };
}

export function fitCardText(ctx, fields, width, height, style) {
  const preferred = measureCardText(ctx, fields, width, style);
  if (preferred.height <= height) return preferred;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (measureCardText(ctx, fields, width, style, middle).height <= height) low = middle;
    else high = middle;
  }
  return measureCardText(ctx, fields, width, style, low);
}

export function paintCardText(ctx, layout, x, y, colors) {
  ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  for (const line of layout.lines) {
    ctx.font = line.font;
    ctx.fillStyle = colors[line.field] || colors.text;
    ctx.fillText(line.text, x + line.x, y + line.y);
  }
  ctx.restore();
}

// Assign rows their measured content height instead of dividing the canvas into
// equal-height day cells. A shared fit factor retains every field when crowded.
export function fitCardRows(ctx, days, columns, width, available, style, header, gap, cardGap) {
  const measure = (factor) => {
    const measured = days.map((items) => items.map((fields) => measureCardText(ctx, fields, width, style, factor)));
    const rows = [];
    for (let index = 0; index < days.length; index += columns) {
      const heights = measured.slice(index, index + columns).map((cards) => cards.reduce((sum, card) => sum + card.height, 0) + Math.max(0, cards.length - 1) * cardGap);
      rows.push(header + Math.max(0, ...heights));
    }
    return { measured, rows, height: rows.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * gap, factor };
  };
  let result = measure(1);
  if (result.height > available) {
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) / 2;
      if (measure(middle).height <= available) low = middle; else high = middle;
    }
    result = measure(low);
  }
  return result;
}
