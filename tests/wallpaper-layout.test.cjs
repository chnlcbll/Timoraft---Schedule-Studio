const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "sidepanel.js"), "utf8");
const start = source.indexOf("const WALLPAPER_EXPORT_SIZES =");
const end = source.indexOf("function chunkDays(", start);
assert.ok(start >= 0 && end > start, "wallpaper layout helpers are available");
const sandbox = { module: { exports: {} } };
vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports = { wallpaperCourseCode, neonTimeRange, elasticGridAxis, gridCardMinimumFraction, layoutWallpaperGridMeetings };`, sandbox);
const { wallpaperCourseCode, neonTimeRange, elasticGridAxis, gridCardMinimumFraction, layoutWallpaperGridMeetings } = sandbox.module.exports;

assert.equal(wallpaperCourseCode({ code: "BIOLRES - FUNDAMENTALS OF BIOLOGICAL RESEARCH" }), "BIOLRES");
assert.equal(wallpaperCourseCode({ code: "CS 101" }), "CS 101");

const entries = [
  { code: "MDPARAS", meetings: [{ day: "M", start: 450, end: 540 }] },
  { code: "THBIOL1", meetings: [{ day: "M", start: 660, end: 780 }] },
  { code: "LCLSTRI", meetings: [{ day: "T", start: 450, end: 570 }] },
];
const base = { ratio: "9:16", clockSpace: 30, contentScale: 100, textScale: 100, showTimes: true, showRooms: true, showProfessors: true };
const range = neonTimeRange(entries, base);
const position = elasticGridAxis(entries, ["M", "T"], range, base);
assert.equal(position(range.start), 0);
assert.equal(position(range.end), 1);
assert.ok(position(450) < position(540) && position(540) < position(660));
assert.ok(gridCardMinimumFraction({ ...base, textScale: 160 }, 4) > gridCardMinimumFraction(base, 4));
const cards = layoutWallpaperGridMeetings(entries, "M", range, position, .1);
assert.equal(cards.length, 2);
assert.equal(cards[0].laneCount, 1);
assert.equal(cards[1].laneCount, 1);

const overlapping = layoutWallpaperGridMeetings([
  ...entries,
  { code: "CONFLICT", meetings: [{ day: "M", start: 480, end: 570 }] },
], "M", range, elasticGridAxis([...entries, { code: "CONFLICT", meetings: [{ day: "M", start: 480, end: 570 }] }], ["M", "T"], range, base), .1);
assert.ok(overlapping.some((card) => card.laneCount === 2));

const referenceSource = fs.readFileSync(path.join(__dirname, "..", "extension", "reference-wallpaper.js"), "utf8");
const referenceEnd = referenceSource.indexOf("export function referencePhonePreviewMarkup");
assert.ok(referenceEnd > 0, "reference phone sizing helpers are available");
const referenceSandbox = { module: { exports: {} } };
vm.runInNewContext(`${referenceSource.slice(0, referenceEnd)}\nmodule.exports = { phoneModel };`, referenceSandbox);
const referenceEntries = [];
for (const [day, count] of [["M", 6], ["T", 7], ["W", 2], ["H", 6], ["F", 6], ["S", 1], ["U", 1]]) {
  for (let index = 0; index < count; index += 1) {
    referenceEntries.push({ code: `${day}${index}`, meetings: [{ day, start: 450 + index * 75, end: 510 + index * 75 }] });
  }
}
const referenceBase = referenceSandbox.module.exports.phoneModel(referenceEntries, ["M", "T", "W", "H", "F", "S", "U"], 1080, 2520, { clockSpace: 30, textScale: 100 });
const referenceLarge = referenceSandbox.module.exports.phoneModel(referenceEntries, ["M", "T", "W", "H", "F", "S", "U"], 1080, 2520, { clockSpace: 30, textScale: 160 });
assert.ok(referenceLarge.cardHeight > referenceBase.cardHeight, "larger reference card text increases card height");
assert.ok(referenceLarge.panelTop < referenceBase.panelTop, "the reference panel expands upward to make room for larger cards");
assert.ok(referenceLarge.cardHeight >= referenceLarge.desiredCardHeight * .75, "dense phone layouts retain most of the requested card growth");

console.log("Wallpaper layout regression checks passed.");
