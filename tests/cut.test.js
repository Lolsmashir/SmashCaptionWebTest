// ✂ Splitting a long post into parts that each fit Telegram's caption limit.
// Run:  cd tests && node --test cut.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");
const { startServer, openApp, typeCaption, launch, settle } = require("./harness");

const app = loadApp();
const SHORT = app.SIGNATURE.split("\n").slice(0, 2).join("\n");

// a long post the way the channel writes them: a title, sections, a quote, the signature, a Link: line
const section = (n) => [
  "**🔥 بخش " + n + ": آپدیت جدید Fortnite امروز اومد**", "✦ آیتم\u200Cهای پک جدید این هفته:",
  "• اسکین The Dark Knight با استایل جدید و افکت\u200Cهای خاص", "◦ بک\u200Cبلینگ Bat-Signal و پیک\u200Cاکس Batarang",
  "• گلایدر Batwing که تو بازی پرواز می\u200Cکنه.", "⟡ قیمت: 1,200 ➥ 1,000 وی\u200Cباکس برای همه\u200Cی بازیکن\u200Cها",
  "⏰ ساعت 3:30 صبح به وقت ایران میاد تو شاپ.",
];
function longPost(sections = 6) {
  const lines = ["**📢 خبر بزرگ هفته**", ""];
  for (let i = 1; i <= sections; i++) {
    lines.push(...section(i), "");
    if (i === 3) lines.push("> نکته: این آپدیت ||سرورها رو ۲ ساعت|| آفلاین می\u200Cکنه", "> خط دوم نقل", "");
  }
  lines.push(app.SIGNATURE, "", "Link: https://x.com/FortniteGame/status/1834567890123456789");
  return lines.join("\n");
}
const parts = (text, n, limit = 1024) => {
  const p = app.cutPlan(text, limit), cuts = app.autoCuts(p, n);
  return { p, cuts, texts: Array.from({ length: n }, (_, k) => app.partText(p, cuts, k)) };
};
const bodyOf = (t, k) => t.split("\n").slice(0, -(k ? SHORT.split("\n").length : app.SIGNATURE.split("\n").length) - 1).join("\n").replace(/\n+$/, "");

test("a long post is cut into the fewest parts that fit, at blank lines, the parts about the same size", () => {
  const text = longPost();
  assert.ok(app.lengthOf(text) > 1024);
  const p = app.cutPlan(text, 1024);
  assert.equal(app.minParts(p), 3);
  assert.equal(app.minParts(app.cutPlan(text, 4096)), 1, "with Premium it fits in one");
  const { texts } = parts(text, 3);
  const lens = texts.map(app.lengthOf);
  lens.forEach((n) => assert.ok(n <= 1024, "part fits: " + lens));
  assert.ok(Math.max(...lens) - Math.min(...lens) < 250, "about the same size: " + lens);
  // every part starts at a section's title (the cuts sit on blank lines)
  texts.slice(1).forEach((t) => assert.match(t.split("\n")[0], /^\*\*🔥 بخش \d/));
});

test("part 1 keeps the full signature, the others end with the short one; nothing is lost or repeated", () => {
  const text = longPost();
  const { texts } = parts(text, 3);
  assert.ok(texts[0].endsWith("\n\n" + app.SIGNATURE));
  texts.slice(1).forEach((t) => {
    assert.ok(t.endsWith("\n\n" + SHORT), t.slice(-80));
    assert.ok(!t.includes("SP | DeftGame.com"));
  });
  assert.equal(SHORT, "**🛒 USE CODE : FNLS ❤️‍🩹**\n**📣 TG | @LolSmash**");
  // the parts' text, put back together, is the post's text (without its signature and Link: line)
  const body = text.split("\n\n" + app.SIGNATURE)[0];
  assert.equal(texts.map(bodyOf).join("\n\n"), body);
  assert.ok(!texts.some((t) => /Link:/.test(t)), "Link: lines are in no part (they are never copied)");
});

test("a cut never goes through a quote or a code block, and avoids a line that opens a list", () => {
  const lines = ["**تیتر**", "مقدمه\u200Cی کوتاه"];
  for (let i = 0; i < 10; i++) lines.push("> خط نقل\u200Cقول شماره " + i + " با کمی متن بیشتر برای طول");
  lines.push("```", ...Array.from({ length: 10 }, (_, i) => "code line " + i + " with some more text"), "```");
  for (let i = 0; i < 6; i++) lines.push("آیتم\u200Cهای این بخش:", "• یک مورد خوب و طولانی برای این آزمایش", "• یک مورد دیگه با متن بیشتر");
  const text = lines.join("\n");
  for (const n of [2, 3, 4]) {
    const { texts } = parts(text, n, 600);
    for (const t of texts) {
      const fences = (t.match(/^```/gm) || []).length;
      assert.equal(fences % 2, 0, "a code block stays whole");
      const body = bodyOf(t, texts.indexOf(t));
      assert.doesNotMatch(body.split("\n").pop(), /:$/, "no part ends on a line that opens a list");
    }
    // the quote is in exactly one part
    assert.equal(texts.filter((t) => /^> خط نقل\u200Cقول شماره 0/m.test(t)).length, 1);
    const withQuote = texts.find((t) => /^> خط نقل\u200Cقول شماره 0/m.test(t));
    assert.match(withQuote, /^> خط نقل\u200Cقول شماره 9/m, "and the whole of it");
  }
});

test("a cut moves one line at a time, steps over blank lines, and never empties a part", () => {
  const text = longPost(4);
  const { p, cuts } = parts(text, 2);
  const down = app.movedCuts(p, cuts, 0, 1), up = app.movedCuts(p, cuts, 0, -1);
  assert.ok(down && up);
  const len = (c, k) => app.lengthOf(app.partText(p, c, k));
  assert.ok(len(down, 0) > len(cuts, 0) && len(down, 1) < len(cuts, 1), "down: a line moves into part 1");
  assert.ok(len(up, 0) < len(cuts, 0), "up: a line moves out of part 1");
  let c = cuts;
  for (let i = 0; i < 200 && c; i++) { const next = app.movedCuts(p, c, 0, -1); if (!next) break; c = next; }
  assert.ok(app.partText(p, c, 0).split("\n")[0].length, "part 1 still has its first line");
  assert.equal(app.movedCuts(p, c, 0, -1), null, "and the cut stops there");
});

test("a post without the signature: part 1 has none, the others get the short one", () => {
  const text = longPost(5).split("\n\n" + app.SIGNATURE)[0];
  const { texts } = parts(text, 2);
  assert.ok(!texts[0].includes("USE CODE"));
  assert.ok(texts[1].endsWith("\n\n" + SHORT));
});

/* ---------- in the browser ---------- */
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });

test("✂ opens the parts: counts, 2/3/4 parts, a cut moved by hand, each part copied with its signature", async () => {
  const { ctx, page, errors } = await openApp(browser, server.url, { viewport: { width: 1440, height: 900 } });
  await typeCaption(page, longPost());
  await page.click("#bCut");
  await page.waitForSelector("#cutSheet.on");
  const counts = () => page.$$eval("#cutParts .cpart .cnt", (els) => els.map((e) => e.textContent));
  let c = await counts();
  assert.equal(c.length, 3, "the fewest parts that fit: " + c);
  c.forEach((t) => assert.ok(+t.split(" / ")[0] <= 1024 && t.endsWith("/ 1024"), t));
  assert.ok(await page.$("#cutCount [data-parts='2'][disabled]"), "fewer parts than fit can't be chosen");
  await page.click("#cutCount [data-parts='4']");
  assert.equal((await counts()).length, 4);
  // move the first cut one line down: part 1 grows
  const before = await counts();
  await page.click(".cut-at [data-move='0'][data-dir='1']");
  const after = await counts();
  assert.ok(+after[0].split(" ")[0] > +before[0].split(" ")[0], before + " → " + after);
  // Premium: one part would do, but it can still be split in two
  await page.click("#cutSheet [data-limit='4096']");
  assert.equal((await counts()).length, 2);
  assert.ok((await counts()).every((t) => t.endsWith("/ 4096")));
  await page.click("#cutSheet [data-limit='1024']");
  // copy part 2
  await page.click("#cutParts [data-copy='1']");
  await page.waitForSelector("#cutParts [data-copy='1'].done");
  const clip = await page.evaluate(async () => {
    const out = {};
    for (const it of await navigator.clipboard.read()) for (const t of it.types) out[t] = await (await it.getType(t)).text();
    return out;
  });
  assert.match(clip["text/plain"], /🛒 USE CODE : FNLS ❤️‍🩹\n📣 TG \| \u200F?@LolSmash\u200F?$/);
  assert.match(clip["text/html"], /<b>📣 TG \| @LolSmash<\/b>$/);
  assert.doesNotMatch(clip["text/plain"], /DeftGame/);
  assert.match(await page.textContent("#toast"), /قسمت ۲ کپی شد|قسمت 2 کپی شد/);
  // Esc closes it; the caption itself is untouched
  await page.keyboard.press("Escape");
  assert.equal(await page.$("#cutSheet.on"), null);
  assert.equal(await page.inputValue("#input"), longPost());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("on a phone the ✂ sheet fits: nothing sideways, no cut-off labels; ✂ is not in rich mode", async () => {
  const { ctx, page } = await openApp(browser, server.url, { viewport: { width: 390, height: 844 }, mobile: true });
  await typeCaption(page, longPost());
  await page.evaluate(() => document.getElementById("input").blur());   // the keyboard is down
  await page.tap("#bCut");
  await page.waitForSelector("#cutSheet.on");
  const bad = await page.evaluate(() => {
    const out = [], box = document.querySelector("#cutSheet .sheet-in"), b = box.getBoundingClientRect();
    if (box.scrollWidth > box.clientWidth + 1) out.push("sheet scrolls sideways");
    document.querySelectorAll("#cutSheet button, #cutSheet .cnt").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1) out.push("truncated: " + el.textContent);
      if (r.left < b.left - 1 || r.right > b.right + 1) out.push("outside: " + el.textContent);
    });
    return out;
  });
  assert.deepEqual(bad, []);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "", "the keyboard didn't come up");
  await page.tap("#bCloseCut");
  assert.equal(await page.$("#cutSheet.on"), null);
  await page.tap(".seg-b[data-mode='rich']");
  await settle(page);
  assert.equal(await page.$eval("#bCut", (b) => getComputedStyle(b).display), "none");
  await ctx.close();
});
