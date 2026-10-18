// Behaviour tests in a real Chromium, with the tweet APIs mocked.
// Run:  cd tests && node --test browser.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, waitForMedia, launch, settle, CAPTION } = require("./harness");

const R = "‏";
const DESKTOP = { width: 1440, height: 900 };
let server, browser;

test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });

async function open(opts = {}) {
  return openApp(browser, server.url, { viewport: DESKTOP, ...opts });
}
// replaces the clipboard API with recorders; mode: "full" | "noItem" | "broken"
async function recordClipboard(page, mode = "full") {
  await page.evaluate((mode) => {
    window.__clip = { write: [], writeText: [], exec: [] };
    if (mode !== "full") window.ClipboardItem = undefined;
    navigator.clipboard.write = async (items) => {
      for (const it of items) {
        const out = {};
        for (const t of it.types) out[t] = await (await it.getType(t)).text();
        window.__clip.write.push(out);
      }
    };
    navigator.clipboard.writeText = async (t) => {
      if (mode === "broken") throw new Error("denied");
      window.__clip.writeText.push(t);
    };
    const real = document.execCommand.bind(document);
    document.execCommand = (cmd) => {
      if (cmd === "copy") { window.__clip.exec.push(document.activeElement.value); return true; }
      return real(cmd);
    };
  }, mode);
}

test("copy for Telegram writes text/html AND text/plain, ending on the hashtag line", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page);
  await recordClipboard(page);
  await page.click("#bCopy");
  await page.waitForFunction(() => window.__clip.write.length === 1);
  const [item] = await page.evaluate(() => window.__clip.write);
  assert.deepEqual(Object.keys(item).sort(), ["text/html", "text/plain"]);
  assert.ok(item["text/plain"].endsWith("\n#Fortnite | #فورتنایت"), JSON.stringify(item["text/plain"].slice(-30)));
  assert.ok(item["text/html"].endsWith("<b>#Fortnite | #فورتنایت</b>"));
  assert.ok(item["text/html"].includes(`پک ${R}The Final Reckoning${R} 29 شهریور`));
  assert.ok(item["text/html"].includes('<span class="tg-spoiler">'));
  assert.ok(!item["text/plain"].includes("x.com"));
  assert.equal(await page.inputValue("#input"), CAPTION, "the editor text itself is not rewritten");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("copy falls back to writeText, then to execCommand", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام **Fortnite**");
  await recordClipboard(page, "noItem");
  await page.click("#bCopy");
  await page.waitForFunction(() => window.__clip.writeText.length === 1);
  assert.equal(await page.evaluate(() => window.__clip.writeText[0]), `سلام ${R}Fortnite${R}`);
  await recordClipboard(page, "broken");
  await page.click("#bCopy");
  await page.waitForFunction(() => window.__clip.exec.length === 1);
  assert.equal(await page.evaluate(() => window.__clip.exec[0]), `سلام ${R}Fortnite${R}`);
  await ctx.close();
});

test("preview: Telegram bubble, dir=auto lines, dust spoiler that opens on click", async () => {
  const { ctx, page } = await open();
  await typeCaption(page);
  const dirs = await page.$$eval("#preview > div", (ds) => ds.map((d) => d.getAttribute("dir")));
  assert.ok(dirs.length > 10 && dirs.every((d) => d === "auto"));
  const sp = page.locator("#preview .spoiler").first();
  assert.match(await sp.evaluate((e) => getComputedStyle(e).animationName), /dust/);
  await sp.click();
  assert.ok(await sp.evaluate((e) => e.classList.contains("open")));
  assert.equal(await page.locator("#preview").innerText().then((t) => t.includes("x.com")), false);
  await page.fill("#input", "متن ||راز|| و **پررنگ با ||راز دوم||**");
  await settle(page);
  assert.equal(await page.locator("#preview .spoiler").count(), 2, "spoilers in plain and bold text");
  await ctx.close();
});

test("signature button adds exactly the four lines", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "متن");
  await page.click("#bSign");
  assert.equal(await page.inputValue("#input"), "متن\n‌\n" + [
    "**🛒 USE CODE : FNLS ❤️‍🩹**", "**📣 TG | @LolSmash**", "**🛍️ SP | DeftGame.com**", "**#Fortnite | #فورتنایت**",
  ].join("\n"));
  await ctx.close();
});

test("toolbar: one column, drag pans it, a click after a drag does nothing, wheel scrolls", async () => {
  const { ctx, page } = await open({ viewport: { width: 800, height: 600 } });
  await typeCaption(page, "hello");
  const tb = page.locator(".toolbar");
  const box = await page.locator(".tb[title='Strike']").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 8 });
  await page.mouse.up();
  assert.ok((await tb.evaluate((t) => t.scrollTop)) > 50, "dragged up = panned down");
  assert.equal(await page.inputValue("#input"), "hello", "the drag must not press the button");
  await tb.evaluate((t) => { t.scrollTop = 0; });
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(() => document.querySelector(".toolbar").scrollTop > 100);
  await tb.evaluate((t) => { t.scrollTop = 0; });
  await page.locator("#input").evaluate((t) => t.setSelectionRange(0, 5));
  await page.click(".tb[title='Bold']");
  assert.equal(await page.inputValue("#input"), "**hello**", "a plain click still works");
  await ctx.close();
});

test("shortcuts: Ctrl+B/I/U, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+Enter = fix + copy", async () => {
  const { ctx, page } = await open();
  await page.click("#input");
  await page.keyboard.type("سلام Fortnite");
  await page.waitForTimeout(400);
  await page.locator("#input").evaluate((t) => t.setSelectionRange(5, 13));
  await page.keyboard.press("Control+b");
  assert.equal(await page.inputValue("#input"), "سلام **Fortnite**");
  await page.keyboard.press("Control+z");
  assert.equal(await page.inputValue("#input"), "سلام Fortnite");
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await page.inputValue("#input"), "سلام **Fortnite**");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  assert.equal(await page.inputValue("#input"), "سلام **Fortnite**");
  await page.locator("#input").evaluate((t) => t.setSelectionRange(0, 0));
  await page.keyboard.press("Control+i");
  await page.keyboard.press("Control+u");
  assert.equal(await page.inputValue("#input"), "*____*سلام **Fortnite**");
  await page.fill("#input", "سلام Fortnite");
  await recordClipboard(page);
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => window.__clip.write.length === 1);
  assert.equal(await page.inputValue("#input"), `سلام ${R}Fortnite${R}`, "Ctrl+Enter also fixes the editor");
  await ctx.close();
});

test("undo keeps 120 steps", async () => {
  const { ctx, page } = await open();
  await page.click("#input");
  const steps = await page.evaluate(() => {
    const b = document.querySelector(".tb[data-ins='⟡ ']");
    for (let i = 0; i < 130; i++) b.click();
    let n = 0;
    while (true) {
      const before = document.getElementById("input").value;
      document.getElementById("tbUndo").click();
      if (document.getElementById("input").value === before) break;
      n++;
    }
    return n;
  });
  assert.equal(steps, 119, "120 states = 119 undos");
  await ctx.close();
});

test("media: both APIs, one card, 4 qualities high→low, 3 buttons per row, ★ on 720p", async () => {
  const { ctx, page, log } = await open();
  await typeCaption(page);
  await waitForMedia(page, 4);
  assert.ok(log.some((u) => u.includes("api.fxtwitter.com")) && log.some((u) => u.includes("api.vxtwitter.com")));
  assert.equal(await page.locator(".mcard").count(), 1);
  const rows = await page.$$eval(".mcard .qitem", (rs) => rs.map((r) => ({
    name: r.querySelector(".qname").innerText.replace(/\s+/g, " ").trim(),
    rec: r.classList.contains("rec"),
    buttons: [...r.querySelectorAll("button")].map((b) => b.innerText.trim()),
  })));
  assert.deepEqual(rows.map((r) => r.name), ["720p · 9.8 MB★", "1080p · 25 MB", "360p · 3.1 MB", "270p · 1.2 MB"]);
  assert.deepEqual(rows.map((r) => r.rec), [true, false, false, false]);
  for (const r of rows) assert.deepEqual(r.buttons, ["دانلود", "کپی", "ارسال"]);
  const fit = await page.$eval(".mthumb video", (v) => getComputedStyle(v).objectFit);
  assert.equal(fit, "contain");
  assert.ok(await page.$(".mthumb .mblur"), "blurred copy behind the preview");
  // typing elsewhere must not rebuild the card
  const marked = await page.$eval(".mcard", (c) => { c.dataset.mark = "1"; return true; });
  assert.ok(marked);
  await page.locator("#input").press("End");
  await page.keyboard.type(" بیشتر");
  await page.waitForTimeout(200);
  assert.equal(await page.$eval(".mcard", (c) => c.dataset.mark), "1");
  await ctx.close();
});

test("media: video 'کپی' copies the link on desktop and opens the share sheet on a phone", async () => {
  const desk = await open();
  await typeCaption(desk.page);
  await waitForMedia(desk.page, 4);
  await recordClipboard(desk.page);
  await desk.page.click(".mcard .qitem.rec button[data-act='copy']");
  await desk.page.waitForFunction(() => window.__clip.writeText.length === 1);
  assert.match(await desk.page.evaluate(() => window.__clip.writeText[0]), /1280x720\/clip\.mp4/);
  await desk.ctx.close();

  const phone = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await typeCaption(phone.page);
  await waitForMedia(phone.page, 4);
  await phone.page.click(".mcard .qitem.rec button[data-act='copy']");
  await phone.page.waitForFunction(() => window.__shared.length === 1);
  assert.match(await phone.page.evaluate(() => window.__shared[0].files[0].name), /\.mp4$/);
  await phone.ctx.close();
});

test("media: a loading card shows while the tweet resolves, then the real card replaces it", async () => {
  const { ctx, page, releaseApis } = await open({ apis: "slow" });
  await typeCaption(page);
  await page.waitForSelector(".mcard.mskel");
  assert.ok(await page.isVisible("#pMedia"));
  assert.match(await page.locator(".mskel .mmsg").innerText(), /در حال گرفتن/);
  releaseApis();
  await waitForMedia(page, 4);
  assert.equal(await page.locator(".mskel").count(), 0);
  await ctx.close();
});

test("media: a friendly card when the tweet gives nothing; no links = no media panel", async () => {
  const { ctx, page } = await open({ apis: "fail" });
  await typeCaption(page);
  await page.waitForSelector(".mcard.mfail");
  assert.match(await page.locator(".mfail .mmsg").innerText(), /پیدا نشد/);
  await page.fill("#input", "فقط متن");
  assert.equal(await page.isVisible("#pMedia"), false);
  await ctx.close();
});

test("media: a tweet API answer in an unexpected shape ends in the friendly card, not a loader", async () => {
  const { ctx, page } = await open();
  await ctx.route("https://api.fxtwitter.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: '{"tweet":{"media":{"photos":7}}}' }));
  await typeCaption(page);
  await page.waitForSelector(".mcard.mfail");
  assert.equal(await page.locator(".mskel").count(), 0);
  await ctx.close();
});

test("keyboard focus shows a ring", async () => {
  const { ctx, page } = await open();
  await page.keyboard.press("Tab");
  const style = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el.tagName, outline: getComputedStyle(el).outlineStyle };
  });
  assert.equal(style.tag, "BUTTON");
  assert.equal(style.outline, "solid");
  await ctx.close();
});

test("on a phone, پاک / پیست / اصلاح / امضا and the toolbar never pull the keyboard up", async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await typeCaption(page, "سلام Fortnite");
  await page.evaluate(() => {
    navigator.clipboard.read = async () => [new ClipboardItem({ "text/plain": new Blob(["متن تازه"], { type: "text/plain" }) })];
    document.getElementById("input").blur();
  });
  const focused = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  for (const sel of ["#bClear", "#bPaste", "#bFix", "#bSign", ".tb[title='Bold']", ".tb[data-ins='⟡ ']"]) {
    await page.tap(sel);
    await page.waitForTimeout(60);
    assert.notEqual(await focused(), "input", sel + " focused the editor (keyboard would pop up)");
  }
  await page.waitForFunction(() => document.getElementById("input").value.includes("متن تازه"), null, { timeout: 3000 }).catch(() => {});
  assert.ok((await page.inputValue("#input")).includes("متن تازه"), "the buttons still did their job");
  // when you are already typing, the keyboard stays where it is
  await page.focus("#input");
  await page.tap("#bClear");
  assert.equal(await focused(), "input");
  await ctx.close();
});

test("on a computer پاک still puts the cursor in the editor", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  await page.evaluate(() => document.getElementById("input").blur());
  await page.click("#bClear");
  assert.equal(await page.evaluate(() => document.activeElement.id), "input");
  await ctx.close();
});

test("messages drop in at the top, in the header band, and cover no button", async () => {
  for (const vp of [{ width: 390, height: 844, mobile: true }, { width: 1440, height: 900 }]) {
    const { ctx, page } = await open({ viewport: { width: vp.width, height: vp.height }, mobile: !!vp.mobile });
    await typeCaption(page, "سلام");
    await page.click("#bSign");
    await page.waitForFunction(() => document.querySelector(".toast.show"));
    await page.waitForTimeout(450);
    const r = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const t = box(document.getElementById("toast")), top = box(document.querySelector(".top"));
      const hits = [...document.querySelectorAll(".act,.tb,textarea,#preview,.qitem button")].filter((el) => {
        const b = box(el);
        return b.width && !(b.right <= t.left || b.left >= t.right || b.bottom <= t.top || b.top >= t.bottom);
      }).map((el) => el.id || el.className);
      return { t: { top: t.top, bottom: t.bottom }, headerBottom: top.bottom, hits, text: document.getElementById("toast").textContent };
    });
    assert.equal(r.text, "امضا اضافه شد");
    assert.ok(r.t.top >= 0 && r.t.top < r.headerBottom, JSON.stringify(r));
    assert.deepEqual(r.hits, [], `${vp.width}px: toast covers ${r.hits}`);
    await ctx.close();
  }
});
