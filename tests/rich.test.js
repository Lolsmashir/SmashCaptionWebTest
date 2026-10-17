// Rich mode: Telegram's rich-text posts (headings, lists, tables, pictures between paragraphs).
// Run:  cd tests && node --test rich.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, waitForMedia, launch, settle, CAPTION, RICH_CAPTION } = require("./harness");

const R = "‏";
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });
const open = (opts = {}) => openApp(browser, server.url, { viewport: { width: 1440, height: 900 }, ...opts });
const editor = (page) => page.inputValue("#input");
async function toRich(page) { await page.click(".seg-b[data-mode='rich']"); await settle(page); }

async function caretAt(page, text, off = 0, len = 0) {
  await page.focus("#preview");
  await page.evaluate(({ text, off, len }) => {
    const w = document.createTreeWalker(document.getElementById("preview"), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const i = n.nodeValue.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange(); r.setStart(n, i + off); r.setEnd(n, i + off + len);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return;
    }
    throw new Error("not in preview: " + text);
  }, { text, off, len });
}

test("the switch turns rich mode on and off, shows the rich toolbar buttons, and is remembered", async () => {
  const { ctx, page, errors } = await open();
  const visibleTb = () => page.$$eval(".tb", (b) => b.filter((x) => x.offsetParent).length);
  assert.equal(await visibleTb(), 25);
  await toRich(page);
  assert.ok(await page.$eval("body", (b) => b.classList.contains("rich")));
  assert.equal(await visibleTb(), 31);
  assert.equal(await page.getAttribute(".seg-b[data-mode='rich']", "aria-selected"), "true");
  await page.reload();
  assert.ok(await page.$eval("body", (b) => b.classList.contains("rich")), "rich mode survives a reload");
  await page.click(".seg-b[data-mode='classic']");
  assert.equal(await visibleTb(), 25);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("rich preview: headings, lists, table, divider, quote; the media panel's pictures open the post", async () => {
  const { ctx, page } = await open();
  await toRich(page);
  await typeCaption(page, RICH_CAPTION);
  await waitForMedia(page, 6);
  const v = await page.evaluate(() => {
    const p = document.getElementById("preview");
    return {
      h1: p.querySelector("h1")?.textContent, h2: p.querySelector("h2")?.textContent,
      nested: !!p.querySelector("ul li ul li"), ol: p.querySelectorAll("ol li").length,
      tasks: [...p.querySelectorAll("li")].map((li) => li.textContent.charAt(0)).filter((c) => "☑☐".includes(c)),
      th: [...p.querySelectorAll("th")].map((t) => t.textContent), rows: p.querySelectorAll("tbody tr").length,
      hr: !!p.querySelector("hr"), quote: !!p.querySelector("blockquote"),
      spoiler: !!p.querySelector("li .spoiler"),
      gallery: [...document.querySelectorAll("#gallery img")].map((i) => i.getAttribute("src")),
      play: document.querySelectorAll("#gallery .gplay").length,
      text: p.textContent, count: document.getElementById("count").textContent,
    };
  });
  assert.equal(v.h1, `آپدیت ${R}v42.00${R} فورتنایت`);
  assert.equal(v.h2, "آیتم‌های جدید");
  assert.ok(v.nested);
  assert.equal(v.ol, 2);
  assert.deepEqual(v.tasks, ["☑", "☐"]);
  assert.deepEqual(v.th, ["آیتم", "قیمت"]);
  assert.equal(v.rows, 2);
  assert.ok(v.hr && v.quote && v.spoiler);
  assert.deepEqual(v.gallery.slice(0, 2), ["https://pbs.twimg.com/media/PHOTO1.jpg?name=orig", "https://pbs.twimg.com/media/PHOTO2.jpg?name=orig"]);
  assert.equal(v.play, 1, "the tweet's video shows as a poster with ▶");
  assert.ok(!v.text.includes("pbs.twimg") && !v.text.includes("x.com"));
  assert.match(v.count, / \/ 32768$/);
  await ctx.close();
});

test("rich copy puts real HTML on the clipboard: headings, lists, table, and the pictures", async () => {
  const { ctx, page } = await open();
  await toRich(page);
  await typeCaption(page, RICH_CAPTION);
  await waitForMedia(page, 6);
  await page.click("#bCopy");
  await page.waitForFunction(() => /کپی شد/.test(document.getElementById("toast").textContent));
  const toast = await page.textContent("#toast");
  assert.match(toast, /پست ریچ کپی شد · 2 عکس — ویدیو رو جدا بفرست/);
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out = {};
    for (const t of items[0].types) out[t] = await (await items[0].getType(t)).text();
    return out;
  });
  const html = clip["text/html"];
  assert.ok(html, "text/html on the clipboard: " + Object.keys(clip));
  for (const part of ["<h1", "<h2", "<ul", "<ol", "<table", "<th", "<hr", "<blockquote",
    'src="https://pbs.twimg.com/media/PHOTO1.jpg?name=orig"', 'src="https://pbs.twimg.com/media/PHOTO2.jpg?name=orig"'])
    assert.ok(html.includes(part), part + " missing in " + html.slice(0, 400));
  assert.ok(html.indexOf("PHOTO1") < html.indexOf("<h1"), "pictures come first");
  assert.ok(!html.includes("x.com/FortniteGame"), "the Link: line is not in the post");
  assert.ok(clip["text/plain"].includes("آپدیت"));
  // the editor is untouched, and the clipboard text has the direction marks
  assert.equal(await editor(page), RICH_CAPTION);
  assert.ok(html.includes(R + "Batman" + R));
  await ctx.close();
});

test("classic copy is unchanged when rich mode is off again", async () => {
  const { ctx, page } = await open();
  await toRich(page);
  await page.click(".seg-b[data-mode='classic']");
  await typeCaption(page, CAPTION);
  await page.evaluate(() => {
    window.__w = null;
    navigator.clipboard.write = async (items) => { window.__w = await (await items[0].getType("text/html")).text(); };
  });
  await page.click("#bCopy");
  await page.waitForFunction(() => window.__w);
  const html = await page.evaluate(() => window.__w);
  assert.ok(!/<h1|<table|<img|<p/.test(html));
  assert.ok(html.endsWith("<b>#Fortnite | #فورتنایت</b>"));
  await ctx.close();
});

test("rich toolbar: heading, list, numbered, checklist, table and divider — in the editor and in the preview", async () => {
  const { ctx, page } = await open();
  await toRich(page);
  await typeCaption(page, "عنوان\nمتن");
  await page.locator("#input").evaluate((t) => { t.focus(); t.setSelectionRange(0, 0); });
  await page.click(".tb[title='تیتر']");
  assert.equal(await editor(page), "## عنوان\nمتن");
  await page.locator("#input").evaluate((t) => { t.setSelectionRange(t.value.length, t.value.length); });
  await page.click(".tb[title='جدول']");
  assert.equal(await editor(page), "## عنوان\nمتن\n| عنوان | مقدار |\n|---|---|\n|  |  |");
  await page.click(".tb[title='خط جداکننده']");
  assert.ok((await editor(page)).endsWith("|  |  |\n---"));
  // in the preview
  await caretAt(page, "متن", 1);
  await page.click(".tb[title='لیست']");
  assert.ok((await editor(page)).includes("\n- متن\n"));
  assert.ok(await page.$("#preview ul li"));
  await caretAt(page, "متن", 0);
  await page.click(".tb[title='تیتر']");
  assert.ok((await editor(page)).includes("\n## - متن\n") || (await editor(page)).includes("\n- متن\n"));
  await ctx.close();
});

test("editing tables, lists and headings inside the rich preview writes clean markdown back", async () => {
  const { ctx, page } = await open();
  await toRich(page);
  await typeCaption(page, "## تیتر\n- یک\n- دو\n\n| آیتم | قیمت |\n|---|---|\n| اسکین | 1,500 |\nLink: https://x.com/a/status/1");
  await caretAt(page, "1,500", 5);
  await page.keyboard.type(" وی‌باکس");
  let v = await editor(page);
  assert.ok(v.includes("| اسکین | 1,500 وی‌باکس |"), v);
  assert.ok(v.includes("| آیتم | قیمت |\n|---|---|"), "header row and separator stay");
  assert.ok(v.endsWith("Link: https://x.com/a/status/1"), "hidden Link line kept");
  await caretAt(page, "دو", 2);
  await page.keyboard.press("Enter");
  await page.keyboard.type("سه");
  v = await editor(page);
  assert.ok(v.includes("- یک\n- دو\n- سه"), v);
  await caretAt(page, "تیتر", 4);
  await page.keyboard.type(" نو");
  assert.ok((await editor(page)).startsWith("## تیتر نو\n"));
  await ctx.close();
});

test("rich mode at phone size: switch, gallery and table fit", async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await toRich(page);
  await typeCaption(page, RICH_CAPTION);
  await waitForMedia(page, 6);
  const r = await page.evaluate(() => {
    const view = document.querySelector("#pView .scroll").getBoundingClientRect();
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    return { view, seg: box(".seg"), gallery: box("#gallery"), table: box("#preview table") };
  });
  for (const k of ["seg", "gallery", "table"])
    assert.ok(r[k].left >= r.view.left - 1 && r[k].right <= r.view.right + 1, k + " sticks out sideways");
  await ctx.close();
});
