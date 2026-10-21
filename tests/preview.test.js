// Editing inside the preview (it is contenteditable) and the features approved with it.
// Run:  cd tests && node --test preview.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, waitForMedia, launch, settle, CAPTION, TWEET_ID } = require("./harness");

const R = "‏";
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });
const open = (opts = {}) => openApp(browser, server.url, { viewport: { width: 1440, height: 900 }, ...opts });
const editor = (page) => page.inputValue("#input");

// puts the caret (or a selection of `len` characters) inside the preview at `text` + `off`
async function caretAt(page, text, off = 0, len = 0) {
  await page.focus("#preview");
  await page.evaluate(({ text, off, len }) => {
    const w = document.createTreeWalker(document.getElementById("preview"), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const i = n.nodeValue.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + off); r.setEnd(n, i + off + len);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return;
    }
    throw new Error("not in preview: " + text);
  }, { text, off, len });
}

test("typing in the middle of a bold line in the preview stays bold, and lands in the editor", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "**Batman × LEGO Fortnite**\n__~~*all*~~__");
  await caretAt(page, "Batman", 6);
  await page.keyboard.type(" X");
  assert.equal(await editor(page), "**Batman X × LEGO Fortnite**\n__~~*all*~~__", "other lines keep their exact text");
  assert.equal(await page.$eval("#preview b", (b) => b.textContent), "Batman X × LEGO Fortnite");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Persian typing inside bold, Enter makes a new line, untouched lines stay byte-for-byte", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "**🔥 آپدیت جدید**\n‌\n** x** و *y*");
  await caretAt(page, "جدید", 4);
  await page.keyboard.type(" امروز");
  await page.keyboard.press("Enter");
  await page.keyboard.type("خط تازه");
  const v = await editor(page);
  const lines = v.split("\n");
  assert.equal(lines[0], "**🔥 آپدیت جدید امروز**");
  assert.equal(lines[1], "**خط تازه**", "Enter at the end of a bold line keeps typing bold, like Telegram");
  assert.equal(lines.slice(2).join("\n"), "‌\n** x** و *y*");
  await ctx.close();
});

test("Link: and Media: lines the preview hides survive preview edits; the media card stays", async () => {
  const { ctx, page } = await open();
  await typeCaption(page);
  await waitForMedia(page, 4);
  await caretAt(page, "گلایدر", 0);
  await page.keyboard.type("نو ");
  const v = await editor(page);
  assert.ok(v.includes("• نو گلایدر Batwing"));
  assert.ok(v.endsWith(`\n\nLink: https://x.com/FortniteGame/status/${TWEET_ID}`), JSON.stringify(v.slice(-80)));
  assert.equal(v.split("\n").length, CAPTION.split("\n").length);
  assert.equal(await page.locator(".mcard .qitem").count(), 4);
  await ctx.close();
});

test("Ctrl+B / Ctrl+I in the preview format the selection", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "خط اول\nخط دوم");
  await caretAt(page, "دوم", 0, 3);
  await page.keyboard.press("Control+b");
  assert.equal(await editor(page), "خط اول\nخط **دوم**");
  await caretAt(page, "اول", 0, 3);
  await page.keyboard.press("Control+i");
  assert.equal(await editor(page), "خط *اول*\nخط **دوم**");
  await ctx.close();
});

test("the toolbar works on the preview: bold, spoiler, link, insert, bullet, quote", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "اسکین جدید\nقیمت ارزون");
  assert.equal(await page.$eval(".toolbar", (t) => t.classList.contains("for-preview")), false);
  await caretAt(page, "جدید", 0, 4);
  assert.equal(await page.$eval(".toolbar", (t) => t.classList.contains("for-preview")), true);
  await page.click(".tb[title='Bold']");
  assert.equal(await editor(page), "اسکین **جدید**\nقیمت ارزون");
  await caretAt(page, "اسکین", 0, 5);
  await page.click(".tb[title='Spoiler']");
  assert.equal(await editor(page), "||اسکین|| **جدید**\nقیمت ارزون");
  await caretAt(page, "ارزون", 0, 5);
  page.once("dialog", (d) => d.accept("https://fortnite.com/shop"));
  await page.click(".tb[title='Link']");
  assert.equal(await editor(page), "||اسکین|| **جدید**\nقیمت [ارزون](https://fortnite.com/shop)");
  await caretAt(page, "قیمت", 0);
  await page.click(".tb[data-ins='⟡ ']");
  assert.equal(await editor(page), "||اسکین|| **جدید**\n⟡ قیمت [ارزون](https://fortnite.com/shop)");
  await caretAt(page, "قیمت", 2);
  await page.click(".tb[data-line='• ']");
  assert.equal(await editor(page), "||اسکین|| **جدید**\n• ⟡ قیمت [ارزون](https://fortnite.com/shop)");
  await caretAt(page, "اسکین", 1);
  await page.click(".tb[title='Quote']");
  assert.equal(await editor(page), "> ||اسکین|| **جدید**\n• ⟡ قیمت [ارزون](https://fortnite.com/shop)");
  assert.ok(await page.$("#preview blockquote .spoiler"), "the quote shows up right away");
  // and with the editor focused the same buttons work on the editor again
  await page.locator("#input").evaluate((t) => { t.focus(); t.setSelectionRange(0, 0); });
  await page.click(".tb[data-ins='✦ ']");
  assert.ok((await editor(page)).startsWith("✦ > ||"));
  await ctx.close();
});

test("pasting into the preview keeps the Telegram formats and nothing else of the source", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  await caretAt(page, "سلام", 4);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", "<b style='color:red;font-size:40px'>دنیا</b><script>window.bad=1</script><img src='x' onerror='window.bad=1'>");
    dt.setData("text/plain", "دنیا");
    document.getElementById("preview").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.equal(await editor(page), "سلام**دنیا**");
  assert.equal(await page.$eval("#preview b", (b) => b.outerHTML), "<b>دنیا</b>");
  assert.equal(await page.evaluate(() => window.bad), undefined, "nothing in the pasted HTML runs");
  await ctx.close();
});

test("undo after typing in the preview, and leaving the preview tidies it up", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  await page.waitForTimeout(400);           // typing within ~⅓ s is one undo step
  await caretAt(page, "سلام", 4);
  await page.keyboard.type(" Fortnite");
  assert.equal(await editor(page), "سلام Fortnite");
  // leaving the preview re-draws it with direction marks
  await page.click("#input");
  await page.waitForFunction(() => document.getElementById("preview").textContent.includes("‏Fortnite‏"));
  await caretAt(page, "سلام", 0);
  await page.keyboard.press("Control+z");
  assert.equal(await editor(page), "سلام");
  assert.equal(await page.$eval("#preview", (p) => p.textContent), "سلام");
  await ctx.close();
});

test("spoilers open on click and while you edit inside them", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "راز: ||Fortnite OG||");
  const sp = page.locator("#preview .spoiler");
  assert.equal(await sp.evaluate((e) => e.classList.contains("open")), false);
  await sp.click();
  assert.equal(await sp.evaluate((e) => e.classList.contains("open")), true);
  await page.keyboard.type("!");
  // the caret lands where you clicked, inside the spoiler
  assert.match(await editor(page), /^راز: \|\|[^|]*![^|]*\|\|$/);
  await ctx.close();
});

test("the preview shows exactly what gets copied", async () => {
  const { ctx, page } = await open();
  await typeCaption(page);
  const { shown, copied } = await page.evaluate(async () => {
    let copied = "";
    navigator.clipboard.writeText = async (t) => { copied = t; };
    document.getElementById("bPlain").click();
    await new Promise((r) => setTimeout(r, 50));
    const shown = [...document.getElementById("preview").children].map((d) => d.innerText.replace(/\n$/, ""));
    return { shown, copied };
  });
  const norm = (l) => l.replace(/^‌$/, "");
  assert.deepEqual(shown.join("\n").split("\n").map(norm), copied.split("\n").map(norm));
  await ctx.close();
});

test("English names inside a Persian line read the right way round in the preview", async () => {
  const { ctx, page } = await open();
  const names = ["A$AP Rocky", "Ke$ha", "P!nk", "LEGO® Fortnite", "Marvel™", "C++", "Galaxy S24+", "@LolSmash", "#Fortnite", "@Fortnite_Leaks"];
  await typeCaption(page, names.map((n) => "**اسکین " + n + " که قراره بیاد!**").join("\n"));
  // the characters of each line in the order they sit on screen, left to right
  const shown = await page.evaluate(() => {
    document.getElementById("preview").style.whiteSpace = "nowrap";
    return [...document.getElementById("preview").children].map((line) => {
      const chars = [];
      const w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        for (let i = 0; i < n.data.length;) {
          const len = n.data.codePointAt(i) > 0xffff ? 2 : 1, ch = n.data.slice(i, i + len);
          if (!/[\u200c\u200e\u200f]/.test(ch)) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + len);
            const b = r.getBoundingClientRect();
            chars.push({ ch, x: b.left + b.width / 2 });
          }
          i += len;
        }
      }
      return chars.sort((a, b) => a.x - b.x).map((c) => c.ch).join("");
    });
  });
  names.forEach((n, i) => assert.ok(shown[i].includes(n), n + " shows as: " + shown[i]));
  await ctx.close();
});

/* ---------- approved features ---------- */

test("caption counter: counts the copied text, yellow near 1024, Premium above it, red above 4096", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  assert.equal(await page.textContent("#count"), "4 / 1024");
  // stars and the address behind a link are not part of the post Telegram counts
  await typeCaption(page, "**سلام** [لینک](https://www.fortnite.com/item-shop?creator-code=FNLS)");
  assert.equal(await page.textContent("#count"), "9 / 1024");
  await typeCaption(page, "ا".repeat(950));
  assert.equal(await page.$eval("#count", (c) => c.className), "cnt near");
  // over 1024: only Telegram Premium sends it — the counter switches to Premium's 4096
  await typeCaption(page, "ا".repeat(1100));
  assert.equal(await page.$eval("#count", (c) => c.className), "cnt prem");
  assert.equal(await page.textContent("#count"), "1100 / 4096");
  assert.match(await page.textContent("#toast"), /پریمیوم/);
  assert.ok(await page.$("#bCut.hot"), "✂ lights up");
  // over 4096: too long even for Premium
  await typeCaption(page, "ا".repeat(4200));
  assert.equal(await page.$eval("#count", (c) => c.className), "cnt over");
  assert.match(await page.textContent("#toast"), /۴۰۹۶/);
  await ctx.close();
});

test("'دوباره امتحان کن' on a tweet that gave nothing tries again", async () => {
  const { ctx, page } = await open({ apis: "fail" });
  await typeCaption(page);
  await page.waitForSelector(".mfail .mretry");
  await ctx.unrouteAll();
  const fresh = await openApp(browser, server.url, { viewport: { width: 1440, height: 900 } });
  await fresh.ctx.close();
  // re-mock the APIs as working on the same page
  const { FX, VX } = require("./harness");
  await ctx.route("https://api.fxtwitter.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(FX) }));
  await ctx.route("https://api.vxtwitter.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(VX) }));
  await ctx.route("https://video.twimg.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-length": "1000" }, body: "" }));
  await page.click(".mretry");
  await page.waitForSelector(".mcard .qitem");
  assert.equal(await page.locator(".mfail").count(), 0);
  await ctx.close();
});

test("Esc closes the help sheet", async () => {
  const { ctx, page } = await open();
  await page.click("#bHelp");
  assert.ok(await page.isVisible("#sheet"));
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#sheet"), false);
  await ctx.close();
});

/* ---------- phone zoom, paste button, draft ---------- */

test("no zoom on phones: viewport is capped and taps don't double-tap-zoom", async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  assert.match(await page.getAttribute("meta[name=viewport]", "content"), /maximum-scale=1/);
  assert.equal(await page.$eval("html", (h) => getComputedStyle(h).touchAction), "manipulation");
  assert.equal(await page.$eval("#input", (t) => getComputedStyle(t).fontSize), "16px");
  await ctx.close();
});

test("the پیست button pastes, and explains what to do when the browser blocks it", async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => {
    navigator.clipboard.read = async () => [new ClipboardItem({ "text/plain": new Blob(["متن کپی‌شده"], { type: "text/plain" }) })];
  });
  await page.click("#bPaste");
  await page.waitForFunction(() => document.getElementById("input").value);
  assert.equal(await editor(page), "متن کپی‌شده");
  await page.fill("#input", "");
  await page.evaluate(() => {
    navigator.clipboard.read = async () => { throw new DOMException("no", "NotAllowedError"); };
    navigator.clipboard.readText = async () => { throw new DOMException("no", "NotAllowedError"); };
  });
  await page.click("#bPaste");
  await page.waitForFunction(() => /Ctrl\+V/.test(document.getElementById("toast").textContent));
  assert.equal(await page.evaluate(() => document.activeElement.id), "input");
  await ctx.close();
});

test("the caption is saved and comes back after a reload", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "پیش‌نویس **مهم**");
  await page.waitForTimeout(700);
  await page.reload();
  assert.equal(await editor(page), "پیش‌نویس **مهم**");
  await page.click("#bClear");
  await page.waitForTimeout(400);
  await page.reload();
  assert.equal(await editor(page), "");
  await ctx.close();
});

/* ---------- harder edits ---------- */

async function selectBetween(page, a, b) {
  await page.focus("#preview");
  await page.evaluate(({ a, b }) => {
    const find = (t) => {
      const w = document.createTreeWalker(document.getElementById("preview"), NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { const i = n.nodeValue.indexOf(t); if (i >= 0) return [n, i]; }
      throw new Error("not in preview: " + t);
    };
    const [n1, i1] = find(a), [n2, i2] = find(b);
    const r = document.createRange(); r.setStart(n1, i1); r.setEnd(n2, i2 + b.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, { a, b });
}

test("bold across two lines makes two bold lines", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "یک دو\nسه چهار");
  await selectBetween(page, "دو", "سه");
  await page.keyboard.press("Control+b");
  assert.equal(await editor(page), "یک **دو**\n**سه** چهار");
  await ctx.close();
});

test("joining two lines across a hidden Link line keeps the Link line", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "خط یک\nLink: https://x.com/a/status/1\nخط دو\nخط سه");
  await selectBetween(page, "یک", "دو");
  await page.keyboard.type("+");
  const v = await editor(page);
  assert.ok(v.includes("Link: https://x.com/a/status/1"), v);
  assert.ok(v.includes("خط +"), v);
  assert.ok(v.endsWith("خط سه"), v);
  await ctx.close();
});

test("select-all + delete in the preview clears the caption but keeps hidden links", async () => {
  const { ctx, page } = await open();
  await typeCaption(page);
  await page.focus("#preview");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("کپشن تازه");
  const v = await editor(page);
  assert.ok(v.startsWith("کپشن تازه"), v);
  assert.ok(v.endsWith(`Link: https://x.com/FortniteGame/status/${TWEET_ID}`), v);
  await ctx.close();
});

test("Ctrl+Enter inside the preview fixes and copies", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام");
  await caretAt(page, "سلام", 4);
  await page.keyboard.type(" Fortnite");
  const html = await page.evaluate(async () => {
    let got = null;
    navigator.clipboard.write = async (items) => { got = await (await items[0].getType("text/html")).text(); };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    return got;
  });
  assert.equal(html, `سلام ${R}Fortnite${R}`);
  assert.equal(await editor(page), `سلام ${R}Fortnite${R}`);
  await ctx.close();
});

test("on a phone: tap the preview, then tap a toolbar button — it still works on the preview", async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await typeCaption(page, "اسکین جدید");
  await page.tap("#preview");
  await caretAt(page, "جدید", 0, 4);
  await page.tap(".tb[title='Bold']");
  assert.equal(await editor(page), "اسکین **جدید**");
  await ctx.close();
});
