// Screenshots + layout audit at the five reference sizes.
// Run:  cd tests && node screens.js [output-dir]
// Exits non-zero when anything is clipped, overflowing, truncated or scrolls the page.
"use strict";
const fs = require("fs");
const path = require("path");
const { startServer, openApp, typeCaption, waitForMedia, launch, settle, CAPTION, RICH_CAPTION } = require("./harness");

const SIZES = [
  { w: 390, h: 844, mobile: true },
  { w: 507, h: 449 },
  { w: 800, h: 600 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  // extra sizes, not in the brief, to make sure nothing breaks in between
  { w: 360, h: 740, mobile: true },
  { w: 375, h: 667, mobile: true },
  { w: 844, h: 390, mobile: true },
  { w: 1024, h: 768 },
  { w: 2560, h: 1440 },
];

// runs inside the page; returns a list of human-readable problems
function audit() {
  const problems = [];
  const r = (el) => el.getBoundingClientRect();
  const name = (el) => {
    const t = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
      (el.classList.length ? "." + [...el.classList].join(".") : "") + (t ? ` "${t}"` : "");
  };
  const visible = (el) => { const b = r(el); const s = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const E = 0.75;
  const inside = (a, b) => a.left >= b.left - E && a.right <= b.right + E && a.top >= b.top - E && a.bottom <= b.bottom + E;

  const de = document.documentElement;
  if (de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1 ||
      document.body.scrollHeight > innerHeight + 1 || document.body.scrollWidth > innerWidth + 1)
    problems.push(`page scrolls: ${de.scrollWidth}x${de.scrollHeight} in ${innerWidth}x${innerHeight}`);
  window.scrollTo(0, 99999);
  if (scrollY || scrollX) problems.push("page can be scrolled");
  window.scrollTo(0, 0);

  const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const edit = document.getElementById("pEdit"), view = document.getElementById("pView"), media = document.getElementById("pMedia");
  for (const p of [edit, view, media]) {
    if (!visible(p)) { problems.push(name(p) + " not visible"); continue; }
    if (!inside(r(p), vp)) problems.push(name(p) + " leaves the screen");
  }
  // structure: editor right, preview left, same row; media full width underneath
  const e = r(edit), v = r(view), m = r(media);
  if (Math.abs(e.top - v.top) > 1 || !(e.left > v.left)) problems.push("editor/preview are not side by side");
  if (!(m.top >= Math.max(e.bottom, v.bottom) - 1) || m.left > v.left + 1 || m.right < e.right - 1) problems.push("media is not underneath both");

  // toolbar: one vertical column on the right edge of the editor
  const tb = document.querySelector(".toolbar"), edrow = document.querySelector(".edrow");
  const tbs = [...tb.querySelectorAll(".tb")].filter(visible);
  const xs = new Set(tbs.map((b) => Math.round(r(b).left)));
  if (xs.size !== 1) problems.push("toolbar is not a single column");
  // a floating capsule may sit a few px in from the edge, but nothing may be to its right
  const taBox = r(document.getElementById("input"));
  if (r(edrow).right - r(tb).right > 10 || r(tb).left < taBox.right - 1) problems.push("toolbar is not on the right edge");
  const expected = document.body.classList.contains("rich") ? 31 : 25;
  if (tbs.length !== expected) problems.push("toolbar has " + tbs.length + " buttons, expected " + expected);
  if (getComputedStyle(tb).scrollbarWidth !== "none") problems.push("toolbar scrollbar visible");

  // everything stays inside its pane; things inside a scroller stay inside it horizontally
  for (const pane of [edit, view, media]) {
    const pb = r(pane);
    pane.querySelectorAll("*").forEach((el) => {
      if (!visible(el) || el.closest(".tb-sep")) return;
      const b = r(el);
      const scroller = el.parentElement && el.parentElement.closest(".scroll,.toolbar,.acts");
      if (scroller) {
        const sb = r(scroller);
        const horizontalOk = b.left >= sb.left - E && b.right <= sb.right + E;
        if (!horizontalOk) problems.push(`${name(el)} sticks out of ${name(scroller).split(" ")[0]} sideways`);
        return;
      }
      if (!inside(b, pb)) problems.push(`${name(el)} overflows ${pane.id}`);
    });
  }
  // nothing truncated or hidden behind a sideways scroll
  document.querySelectorAll(".act,.tb,.qname,.qitem button,.top h1,.mbadge,.mnum,.iconbtn,.seg-b").forEach((el) => {
    if (!visible(el)) return;
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`${name(el)} is truncated (${el.scrollWidth}>${el.clientWidth})`);
  });
  document.querySelectorAll(".qname").forEach((el) => {
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
    if (el.offsetHeight > lh * 1.5) problems.push(`${name(el)} wraps onto two lines`);
  });
  document.querySelectorAll(".acts").forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`action bar hides buttons (${el.scrollWidth}>${el.clientWidth}) in ${el.closest(".pane").id}`);
  });
  // media cards: preview beside the list, rows and buttons inside the card
  document.querySelectorAll(".mcard").forEach((c, i) => {
    const cb = r(c), th = r(c.querySelector(".mthumb")), ql = r(c.querySelector(".qlist"));
    if (!(th.left >= ql.right - 1 || th.right <= ql.left + 1)) problems.push(`card ${i + 1}: preview is not beside the list`);
    c.querySelectorAll(".qitem,.qitem *").forEach((el) => { if (visible(el) && !inside(r(el), cb)) problems.push(`card ${i + 1}: ${name(el)} overflows card`); });
    c.querySelectorAll(".qitem").forEach((row) => {
      const btns = row.querySelectorAll("button");
      if (btns.length !== 3) problems.push(`card ${i + 1}: row "${row.innerText.trim()}" has ${btns.length} buttons`);
      btns.forEach((b) => { if (!inside(r(b), r(row))) problems.push(`card ${i + 1}: ${name(b)} overflows its row`); });
    });
  });
  // tap targets / text that became unreadably small
  document.querySelectorAll(".act,.qitem button").forEach((el) => {
    if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 8) problems.push(`${name(el)} font < 8px`);
  });
  const ta = document.getElementById("input");
  if (matchMedia("(pointer:coarse)").matches && getComputedStyle(ta).fontSize !== "16px") problems.push("editor font is not 16px on touch");
  return problems;
}

(async () => {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, "screens"));
  fs.mkdirSync(outDir, { recursive: true });
  const { srv, url } = await startServer();
  const browser = await launch();
  let failed = 0;
  try {
    // every size twice: a classic caption, and a rich post (headings, lists, table, pictures)
    for (const s of SIZES) for (const rich of [false, true]) {
      const { ctx, page, errors } = await openApp(browser, url, { viewport: { width: s.w, height: s.h }, mobile: !!s.mobile });
      if (rich) { await page.click(".seg-b[data-mode='rich']"); await settle(page); }
      await typeCaption(page, rich ? RICH_CAPTION : CAPTION);
      await waitForMedia(page, rich ? 6 : 4);
      // let the "found" toast slide away so the screenshot shows the plain layout
      await page.waitForFunction(() => !document.querySelector(".toast.show"), null, { timeout: 7000 });
      await page.waitForTimeout(450);
      const file = path.join(outDir, `${s.w}x${s.h}${rich ? "-rich" : ""}.png`);
      await page.screenshot({ path: file });
      const problems = (await page.evaluate(audit)).concat(errors.map((e) => "JS error: " + e));
      // the toolbar must still reach its last button by dragging when it doesn't fit
      const tb = await page.$eval(".toolbar", (t) => ({ sh: t.scrollHeight, ch: t.clientHeight }));
      const extra = tb.sh > tb.ch ? ` (toolbar pans ${tb.sh - tb.ch}px)` : "";
      console.log(`${s.w}x${s.h}${s.mobile ? " (iPhone)" : ""}${rich ? " rich" : ""}: ${problems.length ? "PROBLEMS" : "ok"}${extra} -> ${file}`);
      [...new Set(problems)].forEach((p) => console.log("   - " + p));
      if (problems.length) failed++;
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  process.exit(failed ? 1 : 0);
})();
