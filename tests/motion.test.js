// The animations: short, cleared away when done, and none at all with "reduce motion".
// Run:  cd tests && node --test motion.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, waitForMedia, launch, settle, CAPTION } = require("./harness");

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });
const open = (opts = {}) => openApp(browser, server.url, { viewport: { width: 1440, height: 900 }, motion: true, ...opts });

test("the opening plays in about a second, then clears itself; the panes end exactly in place", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(server.url);
  assert.ok(await page.$("#intro"), "the opening is there at first");
  await page.waitForFunction(() => !document.getElementById("intro") && !document.querySelector(".app.boot"), null, { timeout: 3000 });
  assert.ok(Date.now() - t0 < 2500, "and gone in about a second (" + (Date.now() - t0) + " ms)");
  const panes = await page.$$eval(".pane:not(.hide),.top", (els) => els.map((e) => [getComputedStyle(e).opacity, getComputedStyle(e).transform]));
  for (const [op, tr] of panes) { assert.equal(op, "1"); assert.equal(tr, "none"); }
  // the editor works during the opening too: nothing waits for it
  await ctx.close();

  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await calm.newPage();
  await p2.goto(server.url);
  assert.equal(await p2.$("#intro"), null, "with reduce motion there is no opening at all");
  assert.equal(await p2.$(".app.boot"), null);
  await calm.close();
});

test("download: a real progress bar fills the quality row as the bytes arrive, then a check", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, CAPTION);
  await waitForMedia(page, 4);
  // the file arrives slowly, in eight pieces of a known total size (slow enough to watch on a busy machine)
  await page.evaluate(() => {
    const real = window.fetch;
    window.fetch = (u, o) => {
      if (!/video\.twimg\.com/.test(u) || (o && o.method === "HEAD")) return real(u, o);
      const body = new ReadableStream({
        async start(c) {
          for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 250)); c.enqueue(new Uint8Array(1000)); }
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { headers: { "content-length": "8000", "content-type": "video/mp4" } }));
    };
    window.__seen = [];
    const btn = document.querySelector(".mcard .qitem.rec button[data-act='dl']");
    new MutationObserver(() => window.__seen.push(btn.textContent)).observe(btn, { childList: true, characterData: true, subtree: true });
  });
  const download = page.waitForEvent("download");
  const btn = ".mcard .qitem.rec button[data-act='dl']";
  const width = await page.$eval(btn, (b) => b.offsetWidth);
  await page.click(btn);
  await page.waitForSelector(".mcard .qitem.rec .qbar");
  // the percentage and the bar, read at the same moment (the download may finish right after)
  const mid = await (await page.waitForFunction((s) => {
    const b = document.querySelector(s), bar = document.querySelector(".mcard .qitem.rec .qbar");
    return /\d+%/.test(b.textContent) && bar && bar.style.transform ? bar.style.transform : false;
  }, btn, { polling: 40 })).jsonValue();
  assert.match(mid, /^scaleX\(0?\.\d+\)$/, "the bar is part-way: " + mid);
  assert.ok(await page.$eval(btn, (b) => b.offsetWidth) >= width, "the button keeps its width while it counts");
  await download;
  await page.waitForSelector(btn + " svg.chk");
  const seen = await page.evaluate(() => window.__seen.filter((t) => /%$/.test(t)));
  assert.ok(seen.length >= 3, "the percentage counts up: " + seen.join(" "));
  assert.deepEqual(seen.map((t) => parseInt(t, 10)), [...seen.map((t) => parseInt(t, 10))].sort((a, b) => a - b));
  assert.ok(await page.$(".mcard .qitem.rec .qbar.ok"), "the bar turns green");
  await page.waitForFunction(() => !document.querySelector(".qbar"), null, { timeout: 3000 });
  await page.waitForFunction((s) => document.querySelector(s).textContent === "دانلود", btn, { timeout: 3000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("copy for Telegram = sent: a check draws on the button, the ticks turn blue, a light passes the bubble", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "**سلام** دنیا");
  await page.click("#bCopy");
  await page.waitForSelector("#bCopy.done svg.chk");
  assert.ok(await page.$("#ticks.read"));
  await page.waitForFunction(() => !document.querySelector(".bubble.sent"), null, { timeout: 3000 });
  await page.waitForFunction(() => !document.querySelector("#bCopy.done"), null, { timeout: 3000 });
  assert.equal(await page.textContent("#bCopy"), "کپی برای تلگرام");
  // two quick clicks never leave the button stuck on its "done" label
  await page.click("#bPlain");
  await page.click("#bPlain");
  await page.waitForFunction(() => !document.querySelector("#bPlain.done"), null, { timeout: 3000 });
  assert.equal(await page.textContent("#bPlain"), "ساده");
  // typing again: the ticks wait (not blue any more)
  await page.focus("#input");
  await page.keyboard.type(" x");
  assert.equal(await page.$("#ticks.read"), null);
  assert.ok(await page.$("#pEdit.typing"), "the editor glows while you type");
  await page.waitForFunction(() => !document.querySelector("#pEdit.typing,.bubble.typing"), null, { timeout: 2000 });
  await ctx.close();
});

test("a press glows from the finger and the button still does its job; the mode pill glides", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  const b = await page.$("#bSign");
  const box = await b.boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  assert.ok(await page.$("#bSign.rip"));
  assert.match(await page.$eval("#bSign", (el) => el.style.getPropertyValue("--rx")), /^\d+(\.\d+)?px$/);
  await page.mouse.up();
  assert.ok((await page.inputValue("#input")).includes("@LolSmash"), "the signature went in");
  await page.waitForFunction(() => !document.querySelector(".rip"), null, { timeout: 2000 });

  const pill = () => page.$eval(".seg", (s) => {
    const on = s.querySelector(".seg-b.on");
    return { x: s.style.getPropertyValue("--x"), w: s.style.getPropertyValue("--w"), want: on.offsetLeft + "px", wantW: on.offsetWidth + "px", rich: s.classList.contains("rich-on") };
  });
  let p = await pill();
  assert.equal(p.x, p.want); assert.equal(p.w, p.wantW); assert.equal(p.rich, false);
  await page.click(".seg-b[data-mode='rich']");
  p = await pill();
  assert.equal(p.x, p.want); assert.equal(p.rich, true);
  await page.click(".seg-b[data-mode='classic']");
  await ctx.close();
});

test("the counter fills as the caption grows; toasts show how long they stay", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "x".repeat(512));
  assert.equal(await page.$eval("#count", (c) => c.style.getPropertyValue("--p")), "50.0%");
  await page.click("#bSign");
  const t = await page.$eval("#toast", (el) => ({ n: el.dataset.n, life: el.style.getPropertyValue("--life") }));
  assert.match(t.life, /^\d+ms$/);
  await page.click("#bFix");
  assert.notEqual(await page.$eval("#toast", (el) => el.dataset.n), t.n, "each message restarts its line");
  await ctx.close();
});
