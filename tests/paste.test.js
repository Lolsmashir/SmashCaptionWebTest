// Pasting formatted text: from Telegram (Desktop writes HTML), Telegram Web, and this site itself.
// The formats come back as markdown in the editor and as formats in the preview.
// Run:  cd tests && node --test paste.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { startServer, openApp, typeCaption, launch, settle, CAPTION } = require("./harness");
const { loadApp, INDEX } = require("./load-app");

const RLM = "\u200F", ZWNJ = "\u200C";
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });
const open = (opts = {}) => openApp(browser, server.url, { viewport: { width: 1440, height: 900 }, ...opts });
const editor = (page) => page.inputValue("#input");
// the caption as it is copied: everything but the Link: line (and the blank line above it)
const COPIED = CAPTION.split("\n").slice(0, -2).join("\n");

// a paste event like the one the browser fires for Ctrl+V; returns whether the app took it over
function paste(page, sel, html, plain = "") {
  return page.evaluate(({ sel, html, plain }) => {
    const dt = new DataTransfer();
    if (html) dt.setData("text/html", html);
    dt.setData("text/plain", plain);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    document.querySelector(sel).dispatchEvent(ev);
    return ev.defaultPrevented;
  }, { sel, html, plain });
}
async function editorCaret(page, pos) {
  await page.focus("#input");
  await page.evaluate((p) => document.getElementById("input").setSelectionRange(p, p), pos);
}
async function previewCaret(page, text, off) {
  await page.focus("#preview");
  await page.evaluate(({ text, off }) => {
    const w = document.createTreeWalker(document.getElementById("preview"), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const i = n.nodeValue.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + off); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return;
    }
    throw new Error("not in preview: " + text);
  }, { text, off });
}
// the preview's markup without direction marks and attributes, to compare formats
const previewTags = (page) => page.$eval("#preview", (p) =>
  p.innerHTML.replace(/[\u200E\u200F]/g, "").replace(/<(\w+)[^>]*>/g, "<$1>"));

// what Telegram Desktop puts on the clipboard (lib_ui TextWithTagsToHtml): <b> <i> <u> <s>
// <tg-spoiler> <code> <pre> <blockquote> <a>, line breaks as <br>, also around quotes
const TDESKTOP = "<html><body><b>🔥 آپدیت " + RLM + "Fortnite" + RLM + "</b><br>" + ZWNJ + "<br>" +
  "✦ <i>ایتالیک</i> و <u>زیرخط</u> و <s>خط‌خورده</s><br>" +
  "<blockquote>نقل‌قول <tg-spoiler>اسپویلر</tg-spoiler><br>خط دوم</blockquote><br>" +
  "<code>v42.00</code> و <a href=\"https://fortnite.com/news\">خبر</a> و <a href=\"https://t.me/LolSmash\">@LolSmash</a>" +
  " و <a href=\"http://deftgame.com/\">DeftGame.com</a><br>" +
  "<pre>line 1\nline 2</pre><br><b>#Fortnite | #فورتنایت</b></body></html>";
const TDESKTOP_MD = [
  "**🔥 آپدیت Fortnite**",
  "",
  "✦ *ایتالیک* و __زیرخط__ و ~~خط‌خورده~~",
  "> نقل‌قول ||اسپویلر||",
  "> خط دوم",
  "`v42.00` و [خبر](https://fortnite.com/news) و @LolSmash و DeftGame.com",
  "```", "line 1", "line 2", "```",
  "**#Fortnite | #فورتنایت**",
].join("\n");

test("«کپی برای تلگرام» then Ctrl+V into the editor gives back the same caption", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, CAPTION);
  await page.click("#bCopy");
  await page.fill("#input", "");
  await settle(page);
  await page.focus("#input");
  await page.keyboard.press("Control+V");
  await settle(page);
  assert.equal(await editor(page), COPIED);
  assert.ok(await page.$("#preview blockquote .spoiler"), "the preview shows the quote and the spoiler");
  assert.equal(await page.$eval("#preview b", (b) => b.textContent.replace(/\u200F/g, "")), "🔥 کلاب ماه بعد: Batman × LEGO Fortnite — 12 شهریور 🦇");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("text selected in the preview and copied pastes back with its formats, in the editor and in the preview", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, CAPTION);
  await page.focus("#preview");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+C");
  await page.fill("#input", "");
  await settle(page);
  await page.focus("#input");
  await page.keyboard.press("Control+V");
  await settle(page);
  assert.equal(await editor(page), COPIED, "into the editor");
  await page.fill("#input", "");
  await settle(page);
  await page.focus("#preview");
  await page.keyboard.press("Control+V");
  await settle(page);
  assert.equal(await editor(page), COPIED, "into the empty preview");
  assert.equal(await page.$$eval("#preview [style], #preview font", (e) => e.length), 0, "none of the copied styling comes in");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Telegram Desktop's clipboard HTML becomes markdown in the editor", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  assert.equal(await paste(page, "#input", TDESKTOP, "plain"), true);
  assert.equal(await editor(page), TDESKTOP_MD);
  await settle(page);
  const tags = await previewTags(page);
  for (const t of ["<b>🔥 آپدیت Fortnite</b>", "<i>ایتالیک</i>", "<u>زیرخط</u>", "<s>خط‌خورده</s>", "<span>اسپویلر</span>", "<code>v42.00</code>", "<a>خبر</a>", "<pre><code>line 1\nline 2</code></pre>"])
    assert.ok(tags.includes(t), "preview has " + t);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("pasting into the middle of a line in the editor keeps the rest of the line", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام دنیا");
  await editorCaret(page, 5);
  await paste(page, "#input", "<b>پررنگ</b> ", "پررنگ ");
  assert.equal(await editor(page), "سلام **پررنگ**دنیا");
  // Ctrl+Z takes the paste back in one step
  await page.keyboard.press("Control+Z");
  assert.equal(await editor(page), "سلام دنیا");
  await ctx.close();
});

test("Telegram Desktop's HTML pasted into the preview, inside bold text: both sides stay bold, the paste keeps its own formats", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "**سلام دنیا**\nخط بعد");
  await previewCaret(page, "دنیا", 0);
  assert.equal(await paste(page, "#preview", "<html><body><i>کج</i> <tg-spoiler>راز</tg-spoiler> </body></html>", "کج راز "), true);
  await settle(page);
  assert.equal(await previewTags(page),
    "<div><b>سلام</b> <i>کج</i> <span>راز</span><b>دنیا</b></div><div>خط بعد</div>");
  assert.equal((await editor(page)).split("\n")[1], "خط بعد", "the next line is untouched");
  // the caret sits right after what was pasted: typing goes there
  await page.keyboard.type("X");
  assert.ok((await editor(page)).replace(/[*|_~`]/g, "").startsWith("سلام کج رازXدنیا"), await editor(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a pasted quote or code block gets its own lines; pasted lines inside a quote stay in the quote", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "اول آخر\n> پایان");
  await previewCaret(page, "آخر", 0);
  await paste(page, "#preview", "<blockquote>نقل <b>تازه</b></blockquote>", "نقل تازه");
  assert.equal(await editor(page), "اول \n> نقل **تازه**\nآخر\n> پایان");
  await previewCaret(page, "پایان", 5);
  await paste(page, "#preview", "<b>یک</b><br>دو", "یک\nدو");
  assert.equal(await editor(page), "اول \n> نقل **تازه**\nآخر\n> پایان**یک**\n> دو");
  await ctx.close();
});

test("Telegram Web markup: strong/em/del, spoiler spans, monospace, emoji pictures, entity attributes", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  // web.telegram.org/k and /a, as a browser copies a selection of a message
  await paste(page, "#input",
    "<div class=\"message\"><strong>پررنگ</strong> <em>کج</em> <del>خط</del> " +
    "<span class=\"spoiler\"><span class=\"spoiler-text\">راز</span></span> " +
    "<code class=\"monospace-text\">x</code> <img class=\"emoji\" src=\"/e/1f525.png\" alt=\"🔥\"> " +
    "<span data-entity-type=\"MessageEntitySpoiler\">دوم</span> <span class=\"Spoiler\">سوم</span> " +
    "<font face=\"monospace\">mono</font> <span style=\"font-family: Menlo-Regular\">menlo</span></div>", "");
  assert.equal(await editor(page), "**پررنگ** *کج* ~~خط~~ ||راز|| `x` 🔥 ||دوم|| ||سوم|| `mono` `menlo`");
  await ctx.close();
});

test("foreign styling never comes in: colours, fonts and sizes are dropped, bold stays", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "سلام عزیز");
  await previewCaret(page, "عزیز", 0);
  await paste(page, "#preview",
    "<span style=\"color:red;font-size:40px;font-family:Arial;background:yellow\">قرمز <span style=\"font-weight:700\">پررنگ</span></span>",
    "قرمز پررنگ");
  await settle(page);
  assert.equal(await editor(page), "سلام قرمز **پررنگ**عزیز");
  assert.equal(await page.$$eval("#preview [style], #preview font", (e) => e.length), 0);
  await ctx.close();
});

test("text without any format pastes as plain text, the way the browser does it", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  // a normal web page: the editor leaves the paste to the browser
  assert.equal(await paste(page, "#input", "<p style=\"color:#333;font-weight:400\">یک  متن   ساده</p>", "یک  متن   ساده"), false);
  // the preview inserts the plain text itself
  await typeCaption(page, "سلام عزیز");
  await previewCaret(page, "عزیز", 0);
  await paste(page, "#preview", "<span style=\"color:red\">دنیا</span>", "دنیا ");
  assert.equal(await editor(page), "سلام دنیا عزیز");
  await ctx.close();
});

test("pasted links: a text link stays a link, a bare address / @handle / #tag stays plain text", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  await paste(page, "#input",
    "<b>لینک‌ها:</b> <a href=\"https://x.com/i/status/1\">توییت</a> <a href=\"https://fortnite.com\">https://fortnite.com</a> " +
    "<a href=\"https://t.me/s/LolSmash\">@LolSmash</a> <a href=\"https://t.me/hashtag\">#فورتنایت</a> <a href=\"javascript:alert(1)\">بد</a>");
  assert.equal(await editor(page), "**لینک‌ها:** [توییت](https://x.com/i/status/1) https://fortnite.com @LolSmash #فورتنایت بد");
  await ctx.close();
});

test("pages and docs: paragraphs, blank lines, headings, lists and tables become caption lines", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  // Google Docs: zero-margin paragraphs, a <br> between them is a blank line
  await paste(page, "#input",
    "<meta charset=\"utf-8\"><b style=\"font-weight:normal;\" id=\"docs-internal-guid-1\">" +
    "<p dir=\"rtl\" style=\"margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-weight:700;\">عنوان</span></p><br>" +
    "<p dir=\"rtl\" style=\"margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-weight:400;\">متن</span></p></b>");
  assert.equal(await editor(page), "**عنوان**\n\nمتن");
  await page.fill("#input", "");
  await editorCaret(page, 0);
  // an article: a heading is a bold line, paragraphs with a margin keep a blank line between them
  await paste(page, "#input",
    "<h2>خبر</h2>\n  <p>بند <strong>اول</strong></p>\n  <p>بند دوم</p>\n<ul>\n <li>یک</li>\n <li>دو<ul><li>زیر</li></ul></li>\n</ul>" +
    "<ol><li>اول</li><li>دوم</li></ol><table><tr><td>آیتم</td><td>قیمت</td></tr><tr><td>اسکین</td><td>1,500</td></tr></table><hr>");
  assert.equal(await editor(page), "**خبر**\nبند **اول**\n\nبند دوم\n\n• یک\n• دو\n◦ زیر\n1. اول\n2. دوم\nآیتم | قیمت\nاسکین | 1,500\n———");
  await ctx.close();
});

test("the پیست button pastes with formats when the clipboard has them", async () => {
  const { ctx, page } = await open();
  await typeCaption(page, "");
  await page.evaluate((html) => {
    navigator.clipboard.read = async () => [new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob(["plain"], { type: "text/plain" }),
    })];
  }, TDESKTOP);
  await page.click("#bPaste");
  await page.waitForFunction(() => document.getElementById("input").value);
  assert.equal(await editor(page), TDESKTOP_MD);
  assert.ok(await page.$("#preview blockquote .spoiler"));
  // a browser without clipboard.read() still pastes the plain text
  await page.fill("#input", "");
  await page.evaluate(() => { navigator.clipboard.read = undefined; navigator.clipboard.readText = async () => "**ساده**"; });
  await page.click("#bPaste");
  await page.waitForFunction(() => document.getElementById("input").value);
  assert.equal(await editor(page), "**ساده**");
  await ctx.close();
});

// two real posts of the channel, as Telegram Desktop copies them: "[ ]" around links, bold+italic
// lines, a link whose text has its own brackets
const SHOP = "<html><body><b>🛒 آیتم شاپ آپدیت شد🔥</b><br>" + ZWNJ + "<br><b><i>🗓️ یکشنبه | ۲۶ مهر | ۱۴۰۵</i></b><br>" +
  "<b>🛒 سایت آیتم شاپ فورتنایت</b><br>" +
  "<b><i>[ </i></b><a href=\"https://www.fortnite.com/item-shop?creator-code=FNLS\"><b><i>آیتم شاپ | ITEM SHOP</i></b></a><b><i> ]</i></b><br>" +
  "<b><i>[ </i></b><a href=\"https://deftgame.com/gifting-id/\"><b><i>آیدی های گیفتینگ</i></b></a><b><i> | </i></b>" +
  "<a href=\"https://deftgame.com/product-category/gifting/\"><b><i>خرید گیفت</i></b></a><b><i> ]</i></b><br>" +
  ZWNJ + "<br>📣 <b><i><u>@LolSmash</u></i></b></body></html>";
const STW = "<html><body><b>50 ویباکس رایگان</b> 💰<br>" + ZWNJ + "<br>" +
  "<a href=\"https://t.me/LolSmashCity/942\"><b>💢 [ پابلیک چت سیو ده ورلد ]</b> </a><br><b>📣 TG | @LolSmash</b></body></html>";

test("Telegram posts with [ ] around their links paste as real links, with tidy markdown", async () => {
  const { ctx, page, errors } = await open();
  await typeCaption(page, "");
  await editorCaret(page, 0);
  await paste(page, "#input", SHOP);
  assert.equal(await editor(page), [
    "**🛒 آیتم شاپ آپدیت شد🔥**",
    "",
    "***🗓️ یکشنبه | ۲۶ مهر | ۱۴۰۵***",
    "**🛒 سایت آیتم شاپ فورتنایت**",
    "***[ [آیتم شاپ | ITEM SHOP](https://www.fortnite.com/item-shop?creator-code=FNLS) ]***",
    "***[ [آیدی های گیفتینگ](https://deftgame.com/gifting-id/) | [خرید گیفت](https://deftgame.com/product-category/gifting/) ]***",
    "",
    "📣 ***__@LolSmash__***",
  ].join("\n"));
  await settle(page);
  const tags = await previewTags(page);
  assert.ok(tags.includes("<b><i>[ <a>آیتم شاپ | ITEM SHOP</a> ]</i></b>"), tags);
  assert.ok(tags.includes("<b><i>[ <a>آیدی های گیفتینگ</a> | <a>خرید گیفت</a> ]</i></b>"), tags);
  assert.ok(!/\*|\]\(/.test(await page.textContent("#preview")), "no markdown left showing in the preview");

  // the same post pasted into the preview
  await page.fill("#input", "");
  await settle(page);
  await page.focus("#preview");
  await paste(page, "#preview", STW);
  assert.equal(await editor(page), "**50 ویباکس رایگان** 💰\n\n[**💢 [ پابلیک چت سیو ده ورلد ]** ](https://t.me/LolSmashCity/942)\n**📣 TG | @LolSmash**");
  assert.equal(await page.$eval("#preview a", (a) => a.textContent.replace(/[\u200E\u200F]/g, "")), "💢 [ پابلیک چت سیو ده ورلد ] ");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// the page with a few of its internals reachable from the test (served in place of index.html)
async function openWithHook() {
  const o = await open();
  const html = fs.readFileSync(INDEX, "utf8").replace('"use strict";',
    '"use strict";window.__paste=function(){return{htmlToMarkdown:htmlToMarkdown,output:output,input:input};};');
  await o.ctx.route(server.url, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await o.page.goto(server.url);
  return o;
}

test("round trip: 400 random captions copied with «کپی برای تلگرام» and pasted back keep every format", async () => {
  const app = loadApp();
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const words = ["سلام", "Fortnite", "LEGO", "شهریور", "۱۲", "v42.00", "🦇", "Batman", "اسکین", "@LolSmash", "#فورتنایت",
                 "https://fortnite.com/news", "x", "29", "Chapter 7", "آیتم‌های", "❤️‍🩹", "1,200"];
  const linkable = words.filter((w) => !/^[@#]/.test(w));
  const keys = ["b", "i", "u", "s", "sp"];
  const captions = [];
  for (let n = 0; n < 400; n++) {
    const lines = [];
    for (let l = 0, count = 1 + rnd(6); l < count; l++) {
      const kind = rnd(10);
      if (kind === 0 && lines.length) { lines.push(""); continue; }
      if (kind === 1) { lines.push("```", words[rnd(words.length)] + "  " + words[rnd(words.length)], "```"); continue; }
      const runs = [];
      for (let k = 0, m = 1 + rnd(4); k < m; k++) {
        const f = {};
        for (const key of keys) if (rnd(3) === 0) f[key] = 1;
        if (rnd(12) === 0) f.code = 1;
        if (rnd(14) === 0) f.a = "https://fortnite.com/p" + rnd(3);
        const w = (f.a ? linkable : words)[rnd(f.a ? linkable.length : words.length)];
        runs.push({ t: (k ? (rnd(8) ? " " : "  ") : "") + w, f });
      }
      lines.push((kind === 2 ? "> " : kind === 3 ? "• " : "") + app.runsToMarkdown(runs).trim());
    }
    captions.push(lines.join("\n"));
  }
  const { ctx, page, errors } = await openWithHook();
  const bad = await page.evaluate((captions) => {
    const a = window.__paste(), strip = (s) => s.replace(/[\u200E\u200F]/g, "");
    const out = [];
    for (const c of captions) {
      a.input.value = c;
      const first = a.output();
      const md = a.htmlToMarkdown(first.html);
      // nothing formatted: the browser pastes the plain text, as it is
      a.input.value = md === null ? first.plain : md;
      const again = a.output();
      if (strip(again.html) !== strip(first.html) || strip(again.plain) !== strip(first.plain))
        out.push({ caption: c, pasted: md, html: strip(first.html), again: strip(again.html) });
    }
    return out;
  }, captions);
  assert.deepEqual(bad.slice(0, 2), [], bad.length + " of " + captions.length + " captions changed");
  assert.deepEqual(errors, []);
  await ctx.close();
});
