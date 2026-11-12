// «لینک‌ها»: every link of the caption and links added by hand, and files from YouTube, Instagram,
// TikTok … through a cobalt download server (mocked here, like the tweet APIs).
// Run:  cd tests && node --test links.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, launch, settle } = require("./harness");

let srv, url, browser;
test.before(async () => { ({ srv, url } = await startServer()); browser = await launch(); });
test.after(async () => { await browser.close(); srv.close(); });
const open = (o = {}) => openApp(browser, url, { viewport: { width: 1440, height: 900 }, ...o });
const editor = (page) => page.$eval("#input", (t) => t.value);
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// the quality rows of the card whose title has `title`, in the order they show
async function rowsOf(page, title) {
  await page.waitForFunction((t) => [...document.querySelectorAll(".mcard .mtitle")].some((e) => e.textContent.includes(t)), title);
  return page.$$eval(".mcard", (cards, t) => {
    const c = cards.find((x) => (x.querySelector(".mtitle") || {}).textContent === t);
    return [...c.querySelectorAll(".qitem .qname")].map((q) => q.textContent.trim());
  }, title);
}

test("a YouTube link in the caption: a card with its title, picture, qualities and MP3; a download asks the server for that quality", async () => {
  const { ctx, page, dlLog, errors } = await open();
  await typeCaption(page, "تریلر جدید فورتنایت\n" + YT);
  const rows = await rowsOf(page, "Fortnite Chapter 7 Trailer - Fortnite");
  assert.deepEqual(rows, ["720p ★", "1080p", "480p", "360p", "فقط صدا · MP3"]);
  assert.equal(await page.$eval(".mcard .mthumb img", (i) => i.getAttribute("src")), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(await page.$eval(".mcard .mbadge", (b) => b.textContent), "YouTube");
  // the server was asked once, to read the link: every file through the server itself
  assert.equal(dlLog.length, 1);
  assert.equal(dlLog[0].body.url, YT);
  assert.equal(dlLog[0].body.alwaysProxy, true);
  // download 1080p: a fresh request for that quality, saved under the server's file name
  let dl = page.waitForEvent("download");
  await page.click(".qitem:nth-child(3) button[data-act='dl']");
  let file = await dl;
  assert.equal(file.suggestedFilename(), "Fortnite Chapter 7 Trailer - Fortnite (1080p, h264, youtube).mp4");
  assert.equal(dlLog[dlLog.length - 1].body.videoQuality, "1080");
  // audio only
  dl = page.waitForEvent("download");
  await page.click(".qitem:last-child button[data-act='dl']");
  file = await dl;
  assert.ok(file.suggestedFilename().endsWith("(youtube).mp3"));
  assert.equal(dlLog[dlLog.length - 1].body.downloadMode, "audio");
  // «کپی» on a computer copies the video's own link (the server's link only lives a minute)
  await page.click(".qitem.rec button[data-act='copy']");
  await page.waitForFunction(() => /لینک کپی شد/.test(document.getElementById("toast").textContent));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), YT);
  // the header's links button counts it
  assert.equal(await page.textContent("#lnBadge"), "1");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the links sheet: add several links at once; they show with their site and what was found, stay after a reload and stay out of the post", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "متن پست");
  await page.click("#bLinks");
  await page.fill("#lnInput", "https://youtu.be/abcdEFGH123 https://www.instagram.com/p/XYZ/\nhttps://example.com/page");
  await page.click("#lnAdd");
  await page.waitForFunction(() => /3 لینک اضافه شد/.test(document.getElementById("toast").textContent));
  await page.waitForFunction(() => document.querySelectorAll("#lnList .ln-st.busy").length === 0);
  const rows = await page.$$eval("#lnList .ln-row", (r) => r.map((x) => x.querySelector(".ln-site").textContent));
  assert.deepEqual(rows, ["YouTubeاضافه‌شدهویدیو آماده‌ست", "Instagramاضافه‌شده2 فایل", "example.comاضافه‌شدهلینک معمولی"]);
  // their files are in the media panel: one YouTube video, the post's two pictures
  await page.click("#bCloseLinks");
  await page.waitForFunction(() => document.querySelectorAll(".mcard:not(.mskel)").length === 3);
  assert.equal(await editor(page), "متن پست", "added links never go into the post");
  // a reload keeps them
  await page.reload();
  await page.waitForFunction(() => document.getElementById("lnBadge").textContent === "3");
  // remove one; adding the same link again says it is there already
  await page.click("#bLinks");
  await page.click("#lnList .ln-row:nth-child(2) [data-lact='del']");
  assert.equal(await page.$$eval("#lnList .ln-row", (r) => r.length), 2);
  await page.fill("#lnInput", "https://youtu.be/abcdEFGH123");
  await page.press("#lnInput", "Enter");
  await page.waitForFunction(() => /از قبل هست/.test(document.getElementById("toast").textContent));
  // Esc closes the sheet
  await page.keyboard.press("Escape");
  assert.equal(await page.$eval("#linkSheet", (s) => s.classList.contains("on")), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a caption's link comes out of the caption from the sheet (its Link: line too), and one undo brings it back", async () => {
  const { ctx, page } = await open();
  const text = "خبر\nLink: " + YT + "\nآخر";
  await typeCaption(page, text);
  await page.click("#bLinks");
  await page.waitForSelector("#lnList .ln-row");
  assert.match(await page.textContent("#lnList .ln-row"), /تو متن/);
  await page.click("#lnList .ln-row [data-lact='del']");
  assert.equal(await editor(page), "خبر\nآخر");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  assert.equal(await editor(page), text);
  await ctx.close();
});

test("a link the server can't read says why and can be tried again; your own server is asked first, with its key", async () => {
  const { ctx, page, dlLog } = await open();
  await typeCaption(page, "https://www.tiktok.com/@fortnite/video/123");
  await page.waitForSelector(".mcard.mfail [data-retry-link]");
  assert.match(await page.textContent(".mcard.mfail"), /از لینک TikTok چیزی نیومد.*سایت جواب نداد یا پست حذف شده/);
  const before = dlLog.length;
  await page.click(".mcard.mfail [data-retry-link]");
  await page.waitForFunction((n) => document.querySelector(".mcard.mfail") && true, before);
  assert.ok(dlLog.length > before, "tried again");
  // your own server, with a key
  await page.click("#bLinks");
  await page.click(".ln-set summary");
  await page.fill("#lnServer", "https://my-cobalt.example");
  await page.fill("#lnKey", "secret123");
  await page.click("#lnSave");
  await page.keyboard.press("Escape");
  await page.fill("#input", YT); await page.dispatchEvent("#input", "input");
  await page.waitForSelector(".mcard .mtitle");
  const yt = dlLog.filter((x) => x.body.url === YT);
  assert.equal(yt.length, 1, "your own server answered, so the free one was not asked");
  assert.equal(yt[0].server, "https://my-cobalt.example");
  assert.equal(yt[0].auth, "Api-Key secret123");
  // a link your server can't read is tried on the free server after it
  const tk = dlLog.filter((x) => /tiktok/.test(x.body.url)).slice(-2).map((x) => x.server);
  assert.deepEqual(tk, ["https://my-cobalt.example", "https://cobaltapi.cjs.nz"]);
  await ctx.close();
});

test("on a phone the links sheet and the header fit; the keyboard does not pop up by itself", async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await typeCaption(page, YT + "\nhttps://example.com/x");
  await page.click("#bLinks");
  await page.waitForFunction(() => document.querySelectorAll("#lnList .ln-row").length === 2);
  await settle(page);
  const fit = await page.evaluate(() => {
    const over = [...document.querySelectorAll("#linkSheet *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1);
    return { over: over.map((e) => e.className || e.tagName), scroll: document.documentElement.scrollWidth <= innerWidth, focus: document.activeElement.id };
  });
  assert.deepEqual(fit.over, []);
  assert.ok(fit.scroll);
  assert.notEqual(fit.focus, "lnInput");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("«دانلود همه» saves every file of the media panel at its best quality, one after another", async () => {
  const { ctx, page, dlLog, errors } = await open();
  const { CAPTION } = require("./harness");
  await typeCaption(page, CAPTION + "\nLink: " + YT);
  await page.waitForFunction(() => document.querySelectorAll(".mcard .qitem").length >= 9 && document.querySelector(".mcard .mtitle"));
  const names = [];
  page.on("download", (d) => names.push(d.suggestedFilename()));
  await page.click("#bDlAll");
  await page.waitForFunction(() => /همه‌ی 2 فایل دانلود شد/.test(document.getElementById("toast").textContent), null, { timeout: 15000 });
  // the tweet's highest video and YouTube's 1080p
  assert.deepEqual(names, ["clip.mp4", "Fortnite Chapter 7 Trailer - Fortnite (1080p, h264, youtube).mp4"]);
  assert.equal(dlLog[dlLog.length - 1].body.videoQuality, "1080");
  // the button says it is done, then has its label back
  assert.match(await page.textContent("#bDlAll"), /دانلود شد/);
  await page.waitForFunction(() => document.getElementById("bDlAll").textContent === "دانلود همه", null, { timeout: 4000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("emptying the caption («پاک» or deleting it all) clears the added links too; one undo brings both back", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "متن پست");
  await page.click("#bLinks");
  await page.fill("#lnInput", YT + " https://www.instagram.com/p/XYZ/");
  await page.click("#lnAdd");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("lnBadge").textContent === "2");
  await page.click("#bClear");
  assert.equal(await editor(page), "");
  assert.match(await page.textContent("#toast"), /لینک‌های اضافه‌شده هم/);
  assert.equal(await page.$eval("#lnBadge", (b) => b.classList.contains("show")), false);
  assert.equal(await page.evaluate(() => localStorage.getItem("caption-studio-links")), "[]");
  assert.ok(await page.$eval("#pMedia", (p) => p.classList.contains("hide")), "the media panel is empty again");
  // one undo: the caption and its links
  await page.click("#tbUndo");
  assert.equal(await editor(page), "متن پست");
  await page.waitForFunction(() => document.getElementById("lnBadge").textContent === "2");
  // deleting everything by hand does the same
  await page.click("#input");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => !document.getElementById("lnBadge").classList.contains("show"));
  assert.match(await page.textContent("#toast"), /لینک‌های اضافه‌شده هم پاک شدن/);
  // links added while the editor is empty stay
  await page.click("#bLinks");
  await page.fill("#lnInput", YT);
  await page.click("#lnAdd");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("lnBadge").textContent === "1");
  assert.deepEqual(errors, []);
  await ctx.close();
});
