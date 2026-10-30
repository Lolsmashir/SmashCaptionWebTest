// The tweet picture is painted from a card the browser lays out: every word must land where the
// browser put it. Each picture is compared, pixel by pixel, with the browser's own drawing of the
// same card's text; a misplaced, reversed or overlapping word makes one small block go bad.
// Run:  cd tests && node --test shot.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, openApp, typeCaption, launch } = require("./harness");

const Z = "\u200C";
// the hard cases: English inside Persian words, ZWNJ, emoji pairs, numbers with signs, dashes,
// digits leading a name, links, a quote, code, underline / strike, a long line that wraps
const HARD = [
  "**روز چهارم و آخر ایونت Spritemare فورتنایت فعال شد! 🔥🎃**", "",
  "**🎁 جوایز و تغییرات امروز:**",
  "• افزایش تعداد Pumpkin Chest" + Z + "ها در سراسر جزیره",
  "• احتمال دراپ 1-Up Token و Portable Extractor از چست" + Z + "ها",
  "• A$AP Rocky",
  "• اسکین«Mastering 0 Sprites» با قیمت $9.99 و 50% تخفیف تا 2026-10-30",
  "• پک 3D و کیفیت 4K برای Battle Pass" + Z + "ه",
  "⏰ ساعت 3:30 صبح | 🇮🇷 ایران | تعداد: 4 Squad",
  "> نقل قول **بولد** و __زیرخط__ و ~~خط خورده~~",
  "منبع: @Fortnite_Leaks و #فورتنایت و https://www.fortnite.com/news/some-very-long-article-name-that-wraps?lang=en-US",
  "[لینک آیتم شاپ](https://fortnite.com/item-shop) و `کد 123`",
  "یه جمله" + Z + "ی خیلی طولانی که Fortnite Battle Royale Chapter 7 Season 1 رو داره و باید سر خط بشکنه",
  "", "**🛒 USE CODE : FNLS**", "",
  "Link: https://x.com/FortniteGame/status/1834567890123456789",
].join("\n");
const PERSIAN_TWEET = "روز چهارم ایونت Spritemare فعال شد! 🔥🎃\n\nافزایش تعداد Pumpkin Chest" + Z +
  "ها و احتمال دراپ 1-Up Token از چست" + Z + "ها — قیمت $9.99 و 50% تخفیف #Fortnite @FortniteGame";

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); server.srv.close(); });

async function openPicture(page, mode) {
  const ready = () => page.waitForFunction(() => {
    const i = document.getElementById("shotImg");
    return i.src && i.complete && i.naturalWidth > 0 && !document.getElementById("shotBox").classList.contains("wait");
  });
  await page.click(".mtweet [data-tshot]");
  await ready();
  if (mode === "ours") {
    const src = await page.$eval("#shotImg", (i) => i.src);
    await page.click("[data-shot='ours']");
    await page.waitForFunction((s) => document.getElementById("shotImg").src !== s, src);
    await ready();
  }
}
// the worst 24px block: pixels of text in one picture with nothing like them within 2px in the other
async function worstBlock(page, part = ".shot-text") {
  const crop = await page.evaluate((part) => {
    const c = window.__shot;
    c.style.visibility = "visible"; c.style.zIndex = "99999";
    document.querySelectorAll(".sheet").forEach((s) => s.classList.remove("on"));
    const cr = c.getBoundingClientRect(), tr = c.querySelector(part).getBoundingClientRect();
    return { x: Math.round((tr.left - cr.left) * 2), y: Math.round((tr.top - cr.top) * 2) };
  }, part);
  const dom = (await (await page.evaluateHandle((part) => window.__shot.querySelector(part), part)).screenshot()).toString("base64");
  return page.evaluate(async ({ dom, crop }) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const a = await load(document.getElementById("shotImg").src), b = await load("data:image/png;base64," + dom);
    const w = b.naturalWidth, h = b.naturalHeight;
    const px = (img, sx, sy) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, sx, sy, w, h, 0, 0, w, h);
      return c.getContext("2d").getImageData(0, 0, w, h).data;
    };
    const da = px(a, crop.x, crop.y), db = px(b, 0, 0), lum = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3;
    const wrong = (p, q, i, x, y) => {
      const v = lum(p, i); let best = 255;
      for (let dy = -2; dy <= 2 && best > 70; dy++) for (let dx = -2; dx <= 2; dx++) best = Math.min(best, Math.abs(v - lum(q, ((y + dy) * w + x + dx) * 4)));
      return best > 70;
    };
    const B = 24, blocks = new Map();
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = (y * w + x) * 4;
      if ((lum(da, i) > 90 && wrong(da, db, i, x, y)) || (lum(db, i) > 90 && wrong(db, da, i, x, y))) {
        const k = ((y / B) | 0) * 1000 + ((x / B) | 0); blocks.set(k, (blocks.get(k) || 0) + 1);
      }
    }
    let worst = 0, at = null;
    blocks.forEach((n, k) => { if (n > worst) { worst = n; at = { x: (k % 1000) * B / 2, y: Math.floor(k / 1000) * B / 2 }; } });
    return { worst, at };
  }, { dom, crop });
}
async function openWithShotKept(opts) {
  const o = await openApp(browser, server.url, { viewport: { width: 1440, height: 900 }, scale: 2, ...opts });
  await o.page.evaluate(() => {
    // keep the hidden card the picture was painted from, to compare with it
    const remove = Element.prototype.remove;
    Element.prototype.remove = function () { if (this.classList && this.classList.contains("shot")) { window.__shot = this; return; } return remove.call(this); };
  });
  return o;
}

test("«با متن ما»: every word of a hard Persian caption is where the browser puts it", async () => {
  const { ctx, page, errors } = await openWithShotKept();
  await typeCaption(page, HARD);
  await openPicture(page, "ours");
  const r = await worstBlock(page);
  assert.ok(r.worst < 110, "words out of place near " + JSON.stringify(r.at) + " (" + r.worst + " px)");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("«اصلی»: a Persian tweet with English, emoji and numbers is drawn where the browser puts it", async () => {
  const { ctx, page, errors } = await openWithShotKept({ apis: "text" });
  const tweet = { tweet: { text: PERSIAN_TWEET, author: { name: "شینا", screen_name: "ShiinaBR" }, created_timestamp: 1793391600, likes: 2200 } };
  await ctx.route("https://api.fxtwitter.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(tweet) }));
  await typeCaption(page, "Link: https://x.com/ShiinaBR/status/1834567890123456789");
  await page.waitForSelector(".mtweet [data-tshot]");
  await openPicture(page, "orig");
  const r = await worstBlock(page);
  assert.ok(r.worst < 110, "words out of place near " + JSON.stringify(r.at) + " (" + r.worst + " px)");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("what X shows besides the words: square picture for organisations, link card, poll, quoted post, ⋯", async () => {
  const org = { name: "Fortnite Status", screen_name: "FortniteStatus", avatar_url: "https://pbs.twimg.com/profile_images/9/f_normal.png", verification: { verified: true, type: "organization" } };
  const tweets = {
    card: { tweet: { text: "Downtime for v43.00 begins November 1 at 1 AM ET\n\nhttps://fn.gg/treasure-hunters", author: org, created_timestamp: 1793418900, reposts: 156, likes: 768, media: {},
      card: { url: "https://t.co/abc", title: "Fortnite Treasure Hunters: The Greatest Adventure of All Time is finally here for everyone", domain: "fortnite.com", image: { url: "https://pbs.twimg.com/card_img/1/c.jpg" } } } },
    quotepoll: { tweet: { text: "Which One Piece skin are you getting first?", author: { name: "HYPEX", screen_name: "HYPEX", verification: { verified: true, type: "individual" } }, created_timestamp: 1793391600,
      poll: { choices: [{ label: "Luffy", count: 900, percentage: 62.4 }, { label: "Zoro", count: 300, percentage: 20.8 }, { label: "Nami", count: 242, percentage: 16.8 }], total_votes: 1442, ends_at: "", time_left_en: "Final results" },
      quote: { text: "One Piece x Fortnite is OFFICIAL. Luffy, Zoro and Nami arrive November 1! https://t.co/xyz", author: org, created_timestamp: 1793380000, media: { photos: [{ url: "https://pbs.twimg.com/media/Q1.jpg" }] } } } },
  };
  for (const [name, fx] of Object.entries(tweets)) {
    const { ctx, page, errors } = await openWithShotKept({ apis: "text" });
    await ctx.route("https://api.fxtwitter.com/**", (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(fx) }));
    await ctx.route("https://api.vxtwitter.com/**", (r) => r.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "" }));
    await typeCaption(page, "Link: https://x.com/a/status/1834567890123456789");
    await page.waitForSelector(".mtweet [data-tshot]");
    await openPicture(page, "orig");
    const card = await page.evaluate(() => {
      const c = window.__shot, q = (s) => c.querySelector(s);
      return { square: !!q(".shot-av.sq"), more: !!q(".shot-more"), text: q(".shot-text").textContent,
        title: q(".shot-ctitle") && q(".shot-ctitle").textContent, from: q(".shot-from") && q(".shot-from").textContent,
        poll: [...c.querySelectorAll(".shot-pc")].map((x) => x.textContent), winner: q(".shot-pc.win span") && q(".shot-pc.win span").textContent,
        votes: q(".shot-pmeta") && q(".shot-pmeta").textContent, quote: q(".shot-qtext") && q(".shot-qtext").textContent,
        quoteSquare: !!q(".shot-qav.sq"), quotePicture: !!q(".shot-qmedia"), mark: q(".shot-wm,.shot-mark").className };
    });
    assert.ok(card.more, "⋯ in the corner");
    if (name === "card") {
      assert.ok(card.square, "an organisation's picture is a rounded square");
      assert.equal(card.text, "Downtime for v43.00 begins November 1 at 1 AM ET", "the card's link is not in the words");
      assert.match(card.title, /^Fortnite Treasure Hunters: .+…$/, "a long title ends in …");
      assert.equal(card.from, "From fortnite.com");
      assert.equal(card.mark, "shot-wm right", "the watermark keeps off the title");
    } else {
      assert.ok(!card.square, "a person's picture is round");
      assert.deepEqual(card.poll, ["Luffy62.4%", "Zoro20.8%", "Nami16.8%"]);
      assert.equal(card.winner, "Luffy");
      assert.equal(card.votes, "1,442 votes · Final results");
      assert.equal(card.quote, "One Piece x Fortnite is OFFICIAL. Luffy, Zoro and Nami arrive November 1!");
      assert.ok(card.quoteSquare && card.quotePicture);
      for (const part of [".shot-poll", ".shot-qtext"]) {
        const r = await worstBlock(page, part);
        assert.ok(r.worst < 110, part + ": out of place near " + JSON.stringify(r.at) + " (" + r.worst + " px)");
      }
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("a video's picture has X's play button; the light look is white and is remembered", async () => {
  const { ctx, page, errors } = await openWithShotKept();
  await typeCaption(page);   // the mock tweet has one video
  await openPicture(page, "orig");
  // the colour of the finished picture at a point of the hidden card (the picture is twice its size)
  const colourAt = (sel, fx = 0.5, fy = 0.5) => page.evaluate(async ({ sel, fx, fy }) => {
    const c = window.__shot, cr = c.getBoundingClientRect(), r = c.querySelector(sel).getBoundingClientRect();
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = document.getElementById("shotImg").src; });
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
    return [...g.getImageData(Math.round((r.left - cr.left + r.width * fx) * 2), Math.round((r.top - cr.top + r.height * fy) * 2), 1, 1).data].slice(0, 3);
  }, { sel, fx, fy });
  assert.equal(await page.evaluate(() => window.__shot.querySelectorAll(".shot-m .shot-play").length), 1);
  const [r, g, b] = await colourAt(".shot-play", 0.2, 0.5);   // the blue disc, beside the white triangle
  assert.ok(r < 80 && g > 120 && b > 200, "X blue: " + [r, g, b]);
  const dark = await colourAt(".shot-time", 0.98, 0.5);
  assert.ok(dark.every((v) => v < 30), "dark background: " + dark);

  // light: white background, remembered, and named so in the file
  const src = await page.$eval("#shotImg", (i) => i.src);
  await page.click("[data-theme='light']");
  await page.waitForFunction((s) => document.getElementById("shotImg").src !== s, src);
  await page.waitForFunction(() => !document.getElementById("shotBox").classList.contains("wait"));
  assert.ok(await page.evaluate(() => window.__shot.classList.contains("light")));
  const light = await colourAt(".shot-time", 0.98, 0.5);
  assert.ok(light.every((v) => v > 240), "white background: " + light);
  const dl = page.waitForEvent("download");
  await page.click("#bShotDl");
  assert.match((await dl).suggestedFilename(), /-light\.png$/);
  await page.keyboard.press("Escape");
  await page.click(".mtweet [data-tshot]");
  await page.waitForFunction(() => document.querySelector("[data-theme='light']").classList.contains("on"));
  assert.deepEqual(errors, []);
  await ctx.close();
});
