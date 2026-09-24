// Run with Playwright installed (or NODE_PATH pointing to the bundled runtime).
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const days = ["M", "T", "W", "H", "F", "S", "U"];
const codes = ["MDPARAS", "INTROLI", "THELLAC", "TECLAED", "LBBBI19", "DEVBIOL", "LCLSTRI", "GEMATMW", "GEARTAP", "TRANSLT", "PRLEARN", "LBBBI18", "LCFAITH", "THBIOL1", "LASARE3", "PEDFOUR", "BIOLRES"];
const entries = [];
for (const [di, count] of [6, 7, 2, 6, 6, 1, 1].entries()) {
  for (let i = 0; i < count; i++) entries.push({
    code: codes[entries.length % codes.length], section: `N${40 + i}`, units: 3,
    room: "Online", professor: "Alexandra Reyes", source: i % 2 ? "A" : "B",
    displayColor: i % 2 ? "#fa9650" : "#ce7bcf",
    meetings: [{ day: days[di], start: 450 + i * 75, end: 540 + i * 75,
      room: i % 2 ? "Y408" : "C406", professor: "Maria Alexandra Dela Cruz" }],
  });
}

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/test") {
      res.setHeader("Content-Type", "text/html");
      return res.end('<link rel="stylesheet" href="/extension/assets/app.css"><link rel="stylesheet" href="/extension/assets/reference-wallpaper.css"><style>body{overflow:auto;background:#222}#preview{width:430px;aspect-ratio:9/21}canvas{width:430px;height:auto}</style><div id="preview"></div><canvas id="export"></canvas>');
    }
    const file = path.resolve(root, "." + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/test`);
    const report = await page.evaluate(async ({ entries, days }) => {
      const { referencePhonePreviewMarkup, referencePhoneLayout, drawReferencePhoneCanvas } = await import("/extension/reference-wallpaper.js");
      const failures = [];
      let cases = 0;
      const canvas = document.querySelector("canvas");
      const preview = document.querySelector("#preview");
      for (const ratio of ["9:16", "9:19.5", "9:21"]) for (const textScale of [80, 100, 160]) for (const clockSpace of [0, 30, 44]) {
        const width = 1080, height = 1080 * Number(ratio.split(":")[1]) / 9;
        const options = { ratio, textScale, clockSpace, title: "WEEKLY SCHEDULE", subtitle: "", showWatermark: true };
        preview.style.aspectRatio = ratio.replace(":", "/");
        preview.innerHTML = referencePhonePreviewMarkup(entries, days, options);
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        const drawn = [];
        const original = ctx.fillText.bind(ctx);
        ctx.fillText = (text, ...args) => { drawn.push(text); original(text, ...args); };
        const model = drawReferencePhoneCanvas(ctx, width, height, entries, days, options);
        ctx.fillText = original;
        const svgTexts = [...preview.querySelectorAll("text")].map((node) => node.textContent);
        if (JSON.stringify(svgTexts) !== JSON.stringify(drawn)) failures.push("Preview/export text mismatch");
        if (model.cards.length !== entries.length) failures.push("Missing card");
        for (const card of model.cards) {
          if (card.y + card.height > model.footerY - 20) failures.push("Card beyond footer");
          for (const field of ["code", "section", "time", "room", "professor"]) {
            if (!card.lines.some((line) => line.field === field)) failures.push(`Missing ${field}`);
          }
          const room = card.lines.filter((line) => line.field === "room").map((line) => line.text).join(" ");
          if (room !== `Room: ${card.meeting.room}`) failures.push("Meeting room lost");
        }
        for (const card of preview.querySelectorAll(".reference-phone-card")) {
          const width = Number(card.dataset.width), height = Number(card.dataset.height);
          for (const text of card.querySelectorAll("text")) {
            const box = text.getBBox();
            if (box.x < -0.1 || box.y < -0.1 || box.x + box.width > width + .1 || box.y + box.height > height + .1) {
              failures.push(`Clipped ${text.textContent} at ${ratio}/${textScale}/${clockSpace}`);
            }
          }
        }
        for (let i = 0; i < model.cards.length; i++) for (let j = i + 1; j < model.cards.length; j++) {
          const a = model.cards[i], b = model.cards[j];
          if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) failures.push("Overlapping cards");
        }
        cases++;
      }
      const sparse = entries.filter((entry) => entry.section === "N40");
      const options = { ratio: "9:21", clockSpace: 30, textScale: 100 };
      const base = referencePhoneLayout(sparse, days, 1080, 2520, options);
      const large = referencePhoneLayout(sparse, days, 1080, 2520, { ...options, textScale: 160 });
      if (!(large.cards[0].height > base.cards[0].height * 1.3)) failures.push("Cards did not grow with slider");
      const long = [{ ...entries[0], section: "LONG-SECTION-NAME", code: "LONGCOURSECODE123456789", meetings: [{ ...entries[0].meetings[0], room: "Laboratory Building Level 12 Classroom A1702", professor: "Dr. Maria Alexandra Patricia Delos Santos Dela Cruz" }] }];
      preview.innerHTML = referencePhonePreviewMarkup(long, days, { ...options, textScale: 160 });
      for (const card of preview.querySelectorAll(".reference-phone-card")) for (const text of card.querySelectorAll("text")) {
        const b = text.getBBox();
        if (b.x + b.width > Number(card.dataset.width) + .1 || b.y + b.height > Number(card.dataset.height) + .1) failures.push("Long detail clipped");
      }
      preview.style.aspectRatio = "9/21";
      preview.style.width = "540px";
      preview.innerHTML = referencePhonePreviewMarkup(entries, days, { ...options, textScale: 160 });
      canvas.width = 1080; canvas.height = 2520;
      drawReferencePhoneCanvas(canvas.getContext("2d"), 1080, 2520, entries, days, { ...options, textScale: 160 });
      return { failures, cases, png: canvas.toDataURL("image/png") };
    }, { entries, days });
    assert.deepEqual(report.failures, []);
    fs.mkdirSync(path.join(root, "tmp", "wallpaper-qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "tmp", "wallpaper-qa", "reference-export.png"), Buffer.from(report.png.split(",")[1], "base64"));
    await page.locator("#preview").screenshot({ path: path.join(root, "tmp", "wallpaper-qa", "reference-preview.png") });
    console.log(`${report.cases} phone layout cases passed: all text fits, rooms present, no card overlaps, preview/export text match; large-text growth and long details checked.`);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluate((entries) => localStorage.setItem("timoraft-state-v1", JSON.stringify({
      courses: [], selected: {}, options: {}, saved: [{ id: "qa", name: "Merged QA schedule", entries }], activeView: "wallpaper",
      wallpaper: { scheduleId: "qa", ratio: "9:21", layout: "reference-dark", textScale: 160, clockSpace: 30, showSunday: true },
    })), entries);
    await page.goto(`http://127.0.0.1:${server.address().port}/extension/sidepanel.html`);
    await page.locator("#wallpaperPreview .reference-phone-card").first().waitFor();
    assert.equal(await page.locator("#wallpaperPreview .reference-phone-card").count(), entries.length);
    assert.match(await page.locator("#wallpaperTextScaleHint").textContent(), /All card details are fitted/);
    await page.locator("#wallpaperClockSpace").fill("0");
    await page.locator("#wallpaperTextScale").fill("80");
    const smallHeight = Number(await page.locator("#wallpaperPreview .reference-phone-card").first().getAttribute("data-height"));
    await page.locator("#wallpaperTextScale").fill("160");
    const largeHeight = Number(await page.locator("#wallpaperPreview .reference-phone-card").first().getAttribute("data-height"));
    assert.ok(largeHeight > smallHeight, "real UI slider grows the cards");
    assert.match(await page.locator("#wallpaperPreview").textContent(), /Room: C406/);
    const downloadPending = page.waitForEvent("download");
    await page.locator("#downloadWallpaper").click();
    const download = await downloadPending;
    await download.saveAs(path.join(root, "tmp", "wallpaper-qa", "actual-ui-export.png"));
    assert.deepEqual(errors, []);
    console.log("Real Wallpaper Studio: saved schedule loaded, size slider grows cards, room visible, fit notice shown, PNG download succeeds, no page errors.");
    await page.locator("#wallpaperProfessors").check();
    let layoutCases = 0;
    for (const ratio of ["16:9", "9:16", "9:19.5", "9:21", "4:3", "1:1"]) {
      await page.locator("#wallpaperRatio").selectOption(ratio);
      for (const layout of ["board", "split", "agenda", "timeline", "compact-grid", "neon-grid", "pastel-grid"]) {
        await page.locator("#wallpaperLayout").selectOption(layout);
        await page.waitForFunction(() => !!document.querySelector("#wallpaperPreview canvas")?.wallpaperReport?.cards.length);
        const failures = await page.locator("#wallpaperPreview canvas").evaluate((canvas) => {
          const failures = [], ctx = canvas.getContext("2d");
          ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          for (const card of canvas.wallpaperReport.cards) {
            for (const field of ["code", "section", "time", "room", "professor"]) {
              if (!card.layout.lines.some((line) => line.field === field)) failures.push(`Missing ${field}`);
            }
            if (card.top + card.height > canvas.height + .1 || card.left + card.width > canvas.width + .1) failures.push("Card outside canvas");
            for (const line of card.layout.lines) {
              ctx.font = line.font;
              const m = ctx.measureText(line.text);
              if (line.x - m.actualBoundingBoxLeft < -.1 || line.x + m.actualBoundingBoxRight > card.width + .1 ||
                  line.y - m.actualBoundingBoxAscent < -.1 || line.y + m.actualBoundingBoxDescent > card.height + .1) failures.push(`Clipped ${line.field}: ${line.text}`);
            }
          }
          ctx.restore();
          return failures;
        });
        assert.deepEqual(failures, [], `${layout} ${ratio}`);
        layoutCases++;
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${layoutCases} additional layout/device combinations passed actual rendered text bounds checks at 160% text.`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
