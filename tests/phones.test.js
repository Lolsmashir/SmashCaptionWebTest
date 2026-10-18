// «کپی برای تلگرام» as each Telegram phone app reads it.
// - Telegram iPhone reads the clipboard's plain text as markdown (CommonMark); it never takes a
//   quote from pasted HTML. markdown-it (CommonMark + GFM strikethrough) stands in for its parser.
// - Telegram Android reads the HTML, knows a spoiler only as <spoiler>, and makes no line break
//   around a quote or code block by itself.
// Run:  cd tests && node --test phones.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const MarkdownIt = require("markdown-it");
const { loadApp } = require("./load-app");
const { CAPTION } = require("./harness");

const R = "\u200F", Z = "\u200C";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const iphone = loadApp({ userAgent: IPHONE });
const android = loadApp({ userAgent: ANDROID });
const desktop = loadApp();
// Telegram iPhone: CommonMark with GFM strikethrough, inline <u> allowed, no typographic replacements
const md = new MarkdownIt("commonmark", { html: true }).enable("strikethrough");

const copy = (app, text) => { app.input.value = text; const o = app.output(); app.input.value = ""; return o; };

// what Telegram iPhone ends up with: lines of characters, each with its formats and whether it is in a quote
function readAsTelegramIphone(markdown) {
  const lines = [];
  let cur = null, quote = 0;
  const f = {};
  const newLine = () => { cur = { quote: quote > 0, chars: [] }; lines.push(cur); };
  const add = (text) => { for (const c of text) cur.chars.push({ c, f: { ...f } }); };
  for (const tok of md.parse(markdown, {})) {
    if (tok.type === "blockquote_open") quote++;
    else if (tok.type === "blockquote_close") quote--;
    else if (tok.type === "fence" || tok.type === "code_block") {
      tok.content.replace(/\n$/, "").split("\n").forEach((l) => { newLine(); cur.pre = true; add(l); });
    } else if (tok.type === "inline") {
      newLine();
      for (const t of tok.children) {
        if (t.type === "text") add(t.content);
        else if (t.type === "hardbreak") newLine();
        else if (t.type === "softbreak") throw new Error("a lone newline would join two lines: " + JSON.stringify(markdown));
        else if (t.type === "code_inline") { f.code = 1; add(t.content); delete f.code; }
        else if (t.type === "strong_open") f.b = 1; else if (t.type === "strong_close") delete f.b;
        else if (t.type === "em_open") f.i = 1; else if (t.type === "em_close") delete f.i;
        else if (t.type === "s_open") f.s = 1; else if (t.type === "s_close") delete f.s;
        else if (t.type === "link_open") f.a = t.attrGet("href"); else if (t.type === "link_close") delete f.a;
        else if (t.type === "html_inline" && /^<u>$/i.test(t.content)) f.u = 1;
        else if (t.type === "html_inline" && /^<\/u>$/i.test(t.content)) delete f.u;
        else throw new Error("unexpected markdown token " + t.type + " " + JSON.stringify(t.content) + " in " + JSON.stringify(markdown));
      }
    } else if (!/^(paragraph|blockquote)_(open|close)$/.test(tok.type)) {
      throw new Error("unexpected block " + tok.type + " in " + JSON.stringify(markdown));
    }
  }
  return lines;
}
// what the caption says: the same lines, from the site's own parse (spoilers have no markdown there)
function expected(app, text) {
  const lines = [];
  const runsLine = (s, q) => {
    const line = { quote: q, chars: [] };
    for (const r of app.htmlRuns(app.inline(s))) {
      const f = { ...r.f }; delete f.sp;
      for (const c of r.t) line.chars.push({ c, f });
    }
    lines.push(line);
  };
  for (const b of app.parse(app.autoFix(text))) {
    if (b.t === "pre") b.lines.forEach((l) => lines.push({ quote: false, pre: true, chars: [...l].map((c) => ({ c, f: {} })) }));
    else if (b.t === "quote") b.lines.forEach((l) => runsLine(l, true));
    else if (b.t === "blank") lines.push({ quote: false, chars: [{ c: Z, f: {} }] });
    else runsLine(b.text, false);
  }
  return lines;
}
// a space may sit inside or outside bold / italic / strike: it looks the same. Spaces at the very
// start or end of a line show nothing: markdown's line break takes the last ones, and markdown-it
// trims the first ones (Apple's parser keeps them, written as no-break spaces)
const trim = (chars) => {
  const c = [...chars];
  while (c.length && /\s/.test(c[c.length - 1].c)) c.pop();
  while (c.length && /\s/.test(c[0].c)) c.shift();
  return c;
};
const norm = (lines) => lines.map((l) => ({ ...l, chars: trim(l.chars) })).map((l) => ({
  quote: l.quote, pre: !!l.pre,
  text: l.chars.map((x) => x.c).join("").replace(/\u00A0/g, " "),
  fmt: l.chars.map((x) => Object.keys(x.f).filter((k) => !(/\s/.test(x.c) && /^[bis]$/.test(k))).sort().map((k) => k === "a" ? "a:" + x.f.a : k).join(",")).join("|"),
}));
function sameOnIphone(text) {
  const o = copy(iphone, text);
  assert.ok(o.md, "an iPhone copy of a formatted caption has markdown");
  assert.deepEqual(norm(readAsTelegramIphone(o.md)), norm(expected(iphone, text)), "markdown:\n" + o.md);
}

test("iPhone: the copy's plain text is markdown Telegram iPhone reads back line for line — quote included", () => {
  sameOnIphone(CAPTION);
  const o = copy(iphone, CAPTION);
  assert.match(o.md, /\n\n> آپدیت/, "the quote is a markdown quote, on its own block");
  assert.ok(!/\|\|/.test(o.md), "no spoiler markers: Telegram iPhone has no markdown for them");
  assert.match(o.html, /<blockquote>/, "the HTML is still there for older Telegram versions and other apps");
  // the user's posts: [ ] around links, bold+italic, underline, a link with its own brackets
  sameOnIphone([
    "**🛒 آیتم شاپ آپدیت شد🔥**", "", "***🗓️ یکشنبه | ۲۶ مهر | ۱۴۰۵***",
    "***[ [آیتم شاپ | ITEM SHOP](https://www.fortnite.com/item-shop?creator-code=FNLS) ]***",
    "", "📣 ***__@LolSmash__***", "[**💢 [ پابلیک چت سیو ده ورلد ]** ](https://t.me/LolSmashCity/942)",
    "> نقل قول **اول**", "> خط دوم", "بعد از نقل", "```", "code *not* bold", "```", "~~خط\u200Cخورده~~ و `کد`",
  ].join("\n"));
});

test("iPhone: characters that markdown would misread stay text", () => {
  sameOnIphone([
    "**تیتر**", "- نه لیست", "+ نه لیست", "1. نه شماره", "2) نه شماره", "# نه تیتر", "===", "    چهار فاصله",
    "5 * 3 و a_b و @Fortnite_Leaks و #فورتنایت و [x] و <b>نه</b> و ~ و $5 و &amp; و !عکس و \\ و |",
    "https://x.com/a_b_c*d و https://fortnite.com/news",
  ].join("\n"));
});

test("iPhone: a caption with no format at all is copied as plain text; desktop never gets markdown", () => {
  assert.equal(copy(iphone, "فقط متن ساده\nخط دوم").md, null);
  assert.equal(copy(iphone, "فقط ||راز||").md, null, "a spoiler alone has nothing markdown can carry");
  assert.equal(copy(desktop, CAPTION).md, null);
  assert.equal(copy(android, CAPTION).md, null);
});

test("iPhone: 600 random captions come back with the same lines, quotes and formats", () => {
  let seed = 5;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const words = ["سلام", "Fortnite", "۲۶ مهر", "v42.00", "🔥", "@LolSmash", "#فورتنایت", "TG | @LolSmash", "5 * 3", "a_b",
    "[ x ]", "<3", "$5", "&", "!", "~", "https://x.com/a_b", "Chapter 7", "1,200", "#️⃣"];
  const keys = ["b", "i", "u", "s", "sp"];
  for (let n = 0; n < 600; n++) {
    const lines = [];
    for (let l = 0, count = 1 + rnd(6); l < count; l++) {
      const kind = rnd(9);
      if (kind === 0 && lines.length) { lines.push(""); continue; }
      if (kind === 1) { lines.push("```", words[rnd(words.length)] + " *x* " + words[rnd(words.length)], "```"); continue; }
      const runs = [];
      for (let k = 0, m = 1 + rnd(4); k < m; k++) {
        const f = {};
        for (const key of keys) if (rnd(3) === 0) f[key] = 1;
        if (rnd(10) === 0) f.code = 1;
        if (rnd(12) === 0) f.a = "https://fortnite.com/p" + rnd(3);
        const pool = f.a || f.code ? words.filter((w) => !/[\[\]`|]|^#|https?:/.test(w)) : words;
        let t = pool[rnd(pool.length)];
        if (rnd(4) === 0) t = " " + t;
        if (rnd(4) === 0) t += " ";
        runs.push({ t, f });
      }
      lines.push((kind === 2 || kind === 3 ? "> " : "") + iphone.runsToMarkdown(runs).trim());
    }
    const text = lines.join("\n");
    const o = copy(iphone, text);
    if (!o.md) continue;   // nothing formatted: plain text
    assert.deepEqual(norm(readAsTelegramIphone(o.md)), norm(expected(iphone, text)), "caption:\n" + text + "\nmarkdown:\n" + o.md);
  }
});

test("Android: spoilers carry a <spoiler> tag, and quotes and code blocks keep their line breaks", () => {
  const text = "خط اول\n> نقل ||راز||\nبعد\n```\nکد\n```\nآخر";
  const a = copy(android, text).html, d = copy(desktop, text).html;
  assert.match(a, /<br><blockquote>/); assert.match(a, /<\/blockquote><br>/);
  assert.match(a, /<br><pre>/); assert.match(a, /<\/pre><br>/);
  assert.match(a, /<span class="tg-spoiler"><spoiler>راز<\/spoiler><\/span>/);
  // Telegram Desktop and browsers make that break themselves: no <br> there, or a blank line would show
  assert.doesNotMatch(d, /<br><blockquote>|<\/blockquote><br>|<br><pre>|<\/pre><br>/);
  assert.match(d, /<span class="tg-spoiler"><spoiler>راز<\/spoiler><\/span>/, "desktop ignores <spoiler> and reads the class");
});

test("in the browser on an iPhone, «کپی برای تلگرام» puts that markdown in the plain text, and the HTML beside it", async () => {
  const { startServer, openApp, typeCaption, launch } = require("./harness");
  const server = await startServer(), browser = await launch();
  try {
    const { ctx, page } = await openApp(browser, server.url, { viewport: { width: 390, height: 844 }, mobile: true });
    await typeCaption(page, "**تیتر**\n> نقل قول\nبعد");
    await page.click("#bCopy");
    await page.waitForSelector("#bCopy.done");
    const clip = await page.evaluate(async () => {
      const out = {};
      for (const it of await navigator.clipboard.read()) for (const t of it.types) out[t] = await (await it.getType(t)).text();
      return out;
    });
    assert.equal(clip["text/plain"], "**تیتر**\n\n> نقل قول\n\nبعد");
    assert.match(clip["text/html"], /<b>تیتر<\/b><blockquote>نقل قول<\/blockquote>بعد/);
    await ctx.close();
  } finally { await browser.close(); server.srv.close(); }
});
