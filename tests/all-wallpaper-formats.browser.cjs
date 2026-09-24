// NODE_PATH may point to the bundled Node packages; requires Playwright + Chrome.
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp", "all-wallpaper-qa");

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/test") {
      res.setHeader("Content-Type", "text/html");
      return res.end('<body style="margin:0;background:#222"><div id="preview"></div></body>');
    }
    if (url.pathname === "/extension/render-test.js") {
      res.setHeader("Content-Type", "text/javascript");
      // Test-only exports: production code on disk is unmodified.
      return res.end(fs.readFileSync(path.join(root, "extension", "sidepanel.js"), "utf8")
        .replace(/\ninit\(\);\s*$/, "\nexport { renderWallpaperCanvas, defaultWallpaper, defaults };"));
    }
    const file = path.resolve(root, "." + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/test`);
    const result = await page.evaluate(async (onlyLayout) => {
      const { renderWallpaperCanvas, defaultWallpaper, defaults } = await import("/extension/render-test.js");
      const { referencePhoneLayout } = await import("/extension/reference-wallpaper.js");
      const days = ["M", "T", "W", "H", "F", "S", "U"];
      const layouts = onlyLayout ? [onlyLayout] : ["board", "split", "agenda", "timeline", "compact-grid", "neon-grid", "pastel-grid", "reference-dark"];
      const ratios = ["16:9", "9:16", "9:19.5", "9:21", "4:3", "1:1"];
      const fonts = ["neo", "aptos", "geometric", "condensed", "humanist", "editorial", "classic", "literary", "rounded", "mono"];
      const codes = ["MDPARAS", "INTROLI", "THELLAC", "TECLAED", "LBBBI19", "DEVBIOL", "LCLSTRI"];
      const dense = days.flatMap((day, index) => Array.from({ length: [6, 7, 2, 6, 6, 1, 1][index] }, (_, i) => ({
        code: codes[i % codes.length], section: `N${40 + i}`, units: 3, source: i % 2 ? "A" : "B",
        color: i % 2 ? "#cd88dc" : "#ed9860", room: "Fallback room", professor: "Fallback professor",
        meetings: [{ day, start: 390 + i * 65, end: 400 + i * 65 + (i % 2 ? 105 : 30), room: i === 0 ? "Y408" : "Laboratory A1702",
          professor: "Dr. María Alexandra Dela Cruz" }],
      })));
      dense.push({ ...dense[0], code: "LATECLASS", section: "N99", meetings: [{ day: "U", start: 1260, end: 1320, room: "Online", professor: "Evening Instructor" }] });
      const sparse = dense.filter((entry) => entry.section === "N40");
      const base = { ...defaultWallpaper(), title: "WEEKLY SCHEDULE", subtitle: "", showSunday: true, showTimes: true, showRooms: true, showProfessors: true, showWatermark: true };
      const failures = [], snapshots = [], growth = [];
      let cases = 0;
      const normal = (value) => String(value).replace(/\s/g, "");
      async function check(options, entries, label) {
        const canvas = await renderWallpaperCanvas(options, entries, days);
        const ctx = canvas.getContext("2d");
        let cards = canvas.wallpaperReport.cards;
        if (options.layout === "reference-dark" && options.ratio.startsWith("9:")) {
          const model = referencePhoneLayout(entries, days, canvas.width, canvas.height, options);
          cards = model.cards.map((card) => ({ fields: { code: card.entry.code, section: card.entry.section,
            room: card.meeting.room, professor: card.meeting.professor, time: "" },
            left: card.x, top: card.y, width: card.width, height: card.height,
            layout: { lines: card.lines.map((line) => ({ ...line, font: `${line.weight} ${line.size}px Arial, sans-serif` })) } }));
        }
        if (cards.length !== entries.length) failures.push(`${label}: ${cards.length}/${entries.length} cards`);
        for (const [index, card] of cards.entries()) {
          if (![card.left, card.top, card.width, card.height].every(Number.isFinite) || card.width <= 0 || card.height <= 0) failures.push(`${label}: invalid bounds ${index}`);
          if (card.left < -.1 || card.top < -.1 || card.left + card.width > canvas.width + .1 || card.top + card.height > canvas.height + .1) failures.push(`${label}: off canvas ${index}`);
          const lines = card.layout.lines;
          for (const field of ["code", "section", "time", "room", "professor"]) {
            const drawn = lines.filter((line) => line.field === field).map((line) => line.text).join("");
            if (!drawn || !normal(drawn).includes(normal(card.fields[field]))) failures.push(`${label}: missing ${field} in ${index}`);
          }
          for (const line of lines) {
            ctx.font = line.font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
            const m = ctx.measureText(line.text);
            if (line.x - m.actualBoundingBoxLeft < -.2 || line.x + m.actualBoundingBoxRight > card.width + .2 || line.y - m.actualBoundingBoxAscent < -.2 || line.y + m.actualBoundingBoxDescent > card.height + .2) failures.push(`${label}: clipped ${line.field} ${index}`);
          }
          for (let j = index + 1; j < cards.length; j++) {
            const b = cards[j];
            if (card.left < b.left + b.width - .2 && card.left + card.width > b.left + .2 && card.top < b.top + b.height - .2 && card.top + card.height > b.top + .2) failures.push(`${label}: overlap ${index}/${j}`);
          }
        }
        cases++;
        return { canvas, cards };
      }
      for (const layout of layouts) for (const ratio of ratios) {
        for (const textScale of [80, 100, 160]) {
          const options = { ...base, layout, ratio, textScale, clockSpace: 30 };
          await check(options, dense, `${layout}/${ratio}/${textScale}/dense`);
          const sample = await check(options, sparse, `${layout}/${ratio}/${textScale}/sparse`);
          growth.push({ layout, ratio, textScale, height: sample.cards[0].height, font: sample.cards[0].layout.lines[0].size });
        }
        for (const font of fonts) {
          await check({ ...base, layout, ratio, textScale: 160, contentScale: 115, clockSpace: 44, font }, dense, `${layout}/${ratio}/${font}/stress`);
        }
        if (["board", "timeline", "neon-grid", "pastel-grid", "reference-dark"].includes(layout) && ["9:21", "16:9"].includes(ratio)) {
          const { canvas } = await check({ ...base, layout, ratio, textScale: 160, clockSpace: 0 }, dense, `${layout}/${ratio}/screenshot`);
          snapshots.push({ name: `${layout}-${ratio.replace(":", "-")}`, png: canvas.toDataURL() });
        }
      }
      for (const item of growth.filter((row) => row.textScale === 160)) {
        const small = growth.find((row) => row.layout === item.layout && row.ratio === item.ratio && row.textScale === 80);
        if (item.height < small.height - .5 || item.font < small.font - .5) failures.push(`${item.layout}/${item.ratio}: increasing size shrinks text/cards`);
        if (item.font <= small.font + .1) failures.push(`${item.layout}/${item.ratio}: text size control has no effect on sparse schedule`);
      }
      window.qa = { dense, base, defaults };
      return { failures, cases, snapshots, growth };
    }, process.env.TEST_LAYOUT || "");
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ ...result, snapshots: result.snapshots.map(({ name }) => name) }, null, 2));
    for (const item of result.snapshots) fs.writeFileSync(path.join(output, `${item.name}.png`), Buffer.from(item.png.split(",")[1], "base64"));
    console.log(`${result.cases} rendered cases; ${result.failures.length} failures.`);
    console.log(result.failures.slice(0, 30).join("\n"));
    assert.deepEqual(result.failures, []);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluate(() => {
      const state = window.qa.defaults();
      state.courses = []; state.selected = {};
      state.saved = [{ id: "qa", name: "Merged test schedule", entries: window.qa.dense }];
      state.activeView = "wallpaper";
      state.wallpaper = { ...window.qa.base, scheduleId: "qa", layout: "board", ratio: "16:9", textScale: 160 };
      localStorage.setItem("timoraft-state-v1", JSON.stringify(state));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/extension/sidepanel.html`);
    await page.locator("#wallpaperPreview canvas").waitFor();
    const layouts = await page.locator("#wallpaperLayout option").evaluateAll((options) => options.map((option) => option.value));
    const ratios = await page.locator("#wallpaperRatio option").evaluateAll((options) => options.map((option) => option.value));
    let previews = 0;
    for (const layout of layouts) for (const ratio of ratios) {
      await page.evaluate(() => { const item = document.querySelector("#wallpaperPreview").firstElementChild; if (item) item.dataset.oldPreview = "true"; });
      await page.selectOption("#wallpaperLayout", layout);
      await page.selectOption("#wallpaperRatio", ratio);
      await page.waitForFunction(() => {
        const item = document.querySelector("#wallpaperPreview").firstElementChild;
        return item && !item.dataset.oldPreview;
      });
      if (layout === "reference-dark" && ratio.startsWith("9:")) {
        assert.equal(await page.locator("#wallpaperPreview .reference-phone-card").count(), 30);
        assert.equal(await page.locator('#wallpaperPreview [data-field="room"]').count(), 30);
      } else {
        const count = await page.locator("#wallpaperPreview canvas").evaluate((canvas) => canvas.wallpaperReport.cards.length);
        assert.equal(count, 30, `${layout}/${ratio} UI card count`);
        // The downloaded bitmap must be identical to the visible preview.
        const previewPng = await page.locator("#wallpaperPreview canvas").evaluate((canvas) => canvas.toDataURL());
        const downloadPending = page.waitForEvent("download");
        await page.locator("#downloadWallpaper").click();
        const download = await downloadPending;
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.ok(Buffer.concat(chunks).equals(Buffer.from(previewPng.split(",")[1], "base64")), `${layout}/${ratio}: preview PNG differs from downloaded PNG`);
      }
      previews++;
    }
    assert.deepEqual(errors, []);
    console.log(`${previews} actual UI previews passed; every canvas PNG download matches its preview byte for byte; no page errors.`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
