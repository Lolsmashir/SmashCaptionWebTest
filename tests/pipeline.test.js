// Text-pipeline and media-merge tests for index.html.
// Run:  cd tests && node --test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const R = "‏", L = "‎", Z = "‌";
const SIGNATURE_LINES = [
  "**🛒 USE CODE : FNLS ❤️‍🩹**",
  "**📣 TG | @LolSmash**",
  "**🛍️ SP | DeftGame.com**",
  "**#Fortnite | #فورتنایت**",
];

const app = loadApp();
const fix = (t) => app.autoFix(t);
// exactly what "کپی برای تلگرام" puts on the clipboard
function copyOf(text) {
  const blocks = app.parse(app.autoFix(text));
  return { html: app.toHtml(blocks), plain: app.toPlain(blocks) };
}
const count = (s, ch) => s.split(ch).length - 1;
// vm objects carry another realm's prototypes; compare them as plain data
const plainData = (x) => JSON.parse(JSON.stringify(x));

/* ---------- the fixtures from the brief ---------- */

test("trailing number stays outside the isolation: The Final Reckoning 29", () => {
  const out = fix(`پک The Final Reckoning 29 شهریور برمی${Z}گرده`);
  assert.equal(out, `پک ${R}The Final Reckoning${R} 29 شهریور برمی${Z}گرده`);
});

test("number in the middle keeps one run: «Mastering 0 Sprites»", () => {
  const out = fix("برای «Mastering 0 Sprites» 10 تا اسپرایت");
  assert.equal(out, `برای «${R}Mastering 0 Sprites${R}» 10 تا اسپرایت`);
  assert.equal(count(out, R), 2, "exactly one isolated run");
});

test("version numbers stay intact: v42.00", () => {
  assert.equal(fix("آپدیت v42.00 اومد"), `آپدیت ${R}v42.00${R} اومد`);
});

test("bold line with × and a date: Batman × LEGO Fortnite — 12 شهریور", () => {
  const src = "**Batman × LEGO Fortnite — 12 شهریور 🦇**";
  assert.equal(fix(src), `**${R}Batman × LEGO Fortnite${R} — 12 شهریور 🦇**`);
  const c = copyOf(src);
  assert.equal(c.html, `<b>${R}Batman × LEGO Fortnite${R} — 12 شهریور 🦇</b>`);
  assert.equal(c.plain, `${R}Batman × LEGO Fortnite${R} — 12 شهریور 🦇`);
});

test("copied caption ends exactly on the hashtag line (blank + Link: below it)", () => {
  const src = [
    "**🔥 آپدیت جدید فورتنایت**",
    `پک The Final Reckoning 29 شهریور برمی${Z}گرده`,
    "#Fortnite | #فورتنایت",
    "",
    "Link: https://x.com/FortniteGame/status/1834567890123456789",
  ].join("\n");
  const c = copyOf(src);
  assert.ok(c.plain.endsWith("\n#Fortnite | #فورتنایت"), JSON.stringify(c.plain.slice(-40)));
  assert.equal(c.plain.split("\n").pop(), "#Fortnite | #فورتنایت");
  assert.ok(c.html.endsWith("<br>#Fortnite | #فورتنایت"), JSON.stringify(c.html.slice(-40)));
  assert.ok(!c.plain.includes("x.com") && !c.html.includes("x.com"));
});

test("signature + blank + Link/Media lines: output still ends on the hashtag line", () => {
  app.input.value = "خبر مهم امروز";
  app.elements.bSign.onclick();
  const src = app.input.value + "\n\nLink: https://x.com/a/status/1\nMedia: https://pbs.twimg.com/media/A.jpg\n\n  \n";
  const c = copyOf(src);
  assert.equal(c.plain.split("\n").pop(), "#Fortnite | #فورتنایت");
  assert.ok(c.html.endsWith("<b>#Fortnite | #فورتنایت</b>"), JSON.stringify(c.html.slice(-50)));
});

test("spoiler nested in bold, bold+italic nested in a quote", () => {
  const a = copyOf("**bold with ||spoiler|| inside**");
  assert.equal(a.html, '<b>bold with <span class="tg-spoiler">spoiler</span> inside</b>');
  assert.equal(a.plain, "bold with spoiler inside");
  const q = copyOf("> quote with **bold** and *italic*");
  assert.equal(q.html, "<blockquote>quote with <b>bold</b> and <i>italic</i></blockquote>");
  assert.equal(q.plain, "quote with bold and italic");
});

/* ---------- the rest of the must-keep list ---------- */

test("every format renders", () => {
  const h = (t) => copyOf(t).html;
  assert.equal(h("**b**"), "<b>b</b>");
  assert.equal(h("*i*"), "<i>i</i>");
  assert.equal(h("***bi***"), "<b><i>bi</i></b>");
  assert.equal(h("__u__"), "<u>u</u>");
  assert.equal(h("~~s~~"), "<s>s</s>");
  assert.equal(h("||sp||"), '<span class="tg-spoiler">sp</span>');
  assert.equal(h("`**c**`"), "<code>**c**</code>");
  assert.equal(h("[سایت](https://fortnite.com)"), '<a href="https://fortnite.com">سایت</a>');
  assert.equal(h("[**bold link**](https://fortnite.com)"), '<a href="https://fortnite.com"><b>bold link</b></a>');
  assert.equal(h("```\nlet a = 1 < 2;\n```"), "<pre><code>let a = 1 &lt; 2;</code></pre>");
  assert.equal(h("> a\n> b"), "<blockquote>a<br>b</blockquote>");
  assert.equal(h("__~~*all*~~__"), "<u><s><i>all</i></s></u>");
});

test("letters glued to numbers stay inside the run: Ch7S4", () => {
  assert.equal(fix("فصل Ch7S4 شروع شد"), `فصل ${R}Ch7S4${R} شروع شد`);
});

test("➥ line without Persian gets a leading LRM", () => {
  assert.equal(fix("1,500 ➥ 2,000 V-Bucks"), `${L}1,500 ➥ 2,000 V-Bucks`);
});

test("blank lines become a single ZWNJ", () => {
  assert.equal(fix("سلام\n\nخداحافظ"), `سلام\n${Z}\nخداحافظ`);
  assert.equal(fix("سلام\n   \nخداحافظ"), `سلام\n${Z}\nخداحافظ`);
});

test("hashtag lines, English lines and code fences are never touched", () => {
  assert.equal(fix("#Fortnite #فورتنایت #LolSmash"), "#Fortnite #فورتنایت #LolSmash");
  assert.equal(fix("**#Fortnite | #فورتنایت**"), "**#Fortnite | #فورتنایت**");
  assert.equal(fix("Fortnite Chapter 7 Season 1 is live"), "Fortnite Chapter 7 Season 1 is live");
  assert.equal(fix("```\nسلام Hello World\n```"), "```\nسلام Hello World\n```");
});

test("old RLM/LRM are stripped first, ZWNJ inside Persian words survives", () => {
  assert.equal(fix(`${R}سلام ${L}Hello${R}`), `سلام ${R}Hello${R}`);
  assert.equal(fix(`می${Z}خوام Skin جدید`), `می${Z}خوام ${R}Skin${R} جدید`);
});

test("Link:/Media:/Source: lines and bare media URLs are removed; plain URLs and markdown links stay", () => {
  const src = [
    "متن خبر",
    "Media: https://pbs.twimg.com/media/A.jpg",
    "Source: https://x.com/FortniteGame/status/1",
    "link: https://x.com/FortniteGame/status/2",
    "https://pbs.twimg.com/media/B?format=jpg&name=orig",
    "https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/c.mp4",
    "https://example.com/cat.png",
    "https://fortnite.com/news",
    "[سایت](https://fortnite.com)",
  ].join("\n");
  const c = copyOf(src);
  assert.equal(c.plain, "متن خبر\nhttps://fortnite.com/news\nسایت https://fortnite.com");
  for (const gone of ["pbs.twimg", "video.twimg", "x.com", "cat.png", "Media", "Source"])
    assert.ok(!c.html.includes(gone), gone + " should be gone");
});

test("signature inserts exactly the four lines", () => {
  assert.equal(app.SIGNATURE, SIGNATURE_LINES.join("\n"));
  app.input.value = "متن  \n\n";
  app.elements.bSign.onclick();
  assert.equal(app.input.value, `متن\n${Z}\n` + SIGNATURE_LINES.join("\n"));
});

/* ---------- media ---------- */

const V = (wh, extra = "") => `https://video.twimg.com/amplify_video/18/vid/avc1/${wh}/clip.mp4?tag=16${extra}`;

test("video renditions: deduped, high→low, .m3u8 excluded", () => {
  const vars = app.videoVariants({
    variants: [
      { content_type: "application/x-mpegURL", url: "https://video.twimg.com/amplify_video/18/pl/clip.m3u8?tag=16" },
      { url: "https://video.twimg.com/amplify_video/18/pl/avc1/720x1280/clip.m3u8" },
      { content_type: "video/mp4", bitrate: 256000, url: V("480x270") },
      { content_type: "video/mp4", bitrate: 2176000, url: V("1280x720") },
      { content_type: "video/mp4", bitrate: 10368000, url: V("1920x1080") },
      { content_type: "video/mp4", bitrate: 832000, url: V("640x360") },
      { content_type: "video/mp4", bitrate: 2176000, url: V("1280x720") },
    ],
  });
  assert.deepEqual(plainData(vars.map((v) => v.label)), ["1080p", "720p", "360p", "270p"]);
  assert.ok(vars.every((v) => !/\.m3u8/i.test(v.url)));
});

test("recommended: images → original, videos → best at or below 720p", () => {
  const img = app.imageVariants("https://pbs.twimg.com/media/ABC.jpg");
  assert.deepEqual(plainData(img.map((v) => v.url.split("name=")[1])), ["orig", "large", "medium", "small"]);
  assert.equal(app.pickRecommended(img, "image"), 0);
  const vids = [{ h: 1080 }, { h: 720 }, { h: 360 }, { h: 270 }];
  assert.equal(app.pickRecommended(vids, "video"), 1);
  assert.equal(app.pickRecommended([{ h: 1080 }, { h: 900 }], "video"), 1);
  assert.equal(app.pickRecommended([{ h: 1080 }, { h: 480 }], "video"), 1);
});

function fakeApis({ fx, vx, log }) {
  return (url) => {
    log && log.push(url);
    const body = /fxtwitter/.test(url) ? fx : /vxtwitter/.test(url) ? vx : null;
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve({ ok: !!body, json: async () => body });
  };
}
const FX_CLIP = {
  tweet: { media: {
    photos: [{ url: "https://pbs.twimg.com/media/PHOTO1.jpg" }],
    videos: [{
      url: V("1920x1080"), thumbnail_url: "https://pbs.twimg.com/amplify_video_thumb/18/img/poster.jpg",
      variants: [
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/amplify_video/18/pl/clip.m3u8?tag=16" },
        { content_type: "video/mp4", bitrate: 256000, url: V("480x270") },
        { content_type: "video/mp4", bitrate: 832000, url: V("640x360") },
        { content_type: "video/mp4", bitrate: 2176000, url: V("1280x720") },
        { content_type: "video/mp4", bitrate: 10368000, url: V("1920x1080") },
      ],
    }],
  } },
};
// vxtwitter describes the same clip with a differently shaped URL
const VX_CLIP = {
  media_extended: [
    { type: "image", url: "https://pbs.twimg.com/media/PHOTO1.jpg" },
    { type: "video", url: "https://video.twimg.com/amplify_video/18/vid/avc1/1920x1080/clip.mp4", thumbnail_url: "" },
  ],
};

test("tweet media: fx + vx fetched in parallel and merged by order into ONE card per clip", async () => {
  const log = [];
  const a = loadApp({ fetchImpl: fakeApis({ fx: FX_CLIP, vx: VX_CLIP, log }) });
  const pending = a.resolveTweet("1834567890123456789");
  assert.equal(log.length, 2, "both APIs requested before either answered");
  assert.ok(log.some((u) => u.includes("api.fxtwitter.com")) && log.some((u) => u.includes("api.vxtwitter.com")));
  const got = await pending;
  const photos = got.filter((m) => m.kind === "image"), videos = got.filter((m) => m.kind === "video");
  assert.equal(photos.length, 1);
  assert.equal(videos.length, 1, "one card for one clip");
  assert.deepEqual(plainData(videos[0].variants.map((v) => v.label)), ["1080p", "720p", "360p", "270p"]);
  assert.equal(videos[0].variants[a.pickRecommended(videos[0].variants, "video")].label, "720p");
  assert.ok(videos[0].poster.includes("poster.jpg"));
});

test("tweet media: one API down still works, both down gives nothing", async () => {
  const onlyVx = loadApp({ fetchImpl: fakeApis({ fx: new Error("blocked"), vx: VX_CLIP }) });
  const got = await onlyVx.resolveTweet("1");
  assert.equal(got.filter((m) => m.kind === "video").length, 1);
  const none = loadApp({ fetchImpl: fakeApis({ fx: new Error("x"), vx: new Error("y") }) });
  assert.equal((await none.resolveTweet("2")).length, 0);
});

/* ---------- regressions found while testing ---------- */

test("URLs on a Persian line stay whole; a markdown link target gets no marks", () => {
  assert.equal(fix("لینک: https://www.epicgames.com/fortnite/en-US/news?lang=en_US&x=1"),
    `لینک: ${R}https://www.epicgames.com/fortnite/en-US/news?lang=en_US&x=1${R}`);
  assert.equal(fix("پیج https://x.com/Fortnite_Leaks/status/123 رو ببین"),
    `پیج ${R}https://x.com/Fortnite_Leaks/status/123${R} رو ببین`);
  assert.equal(fix("سایت https://fortnite.com."), `سایت ${R}https://fortnite.com${R}.`);
  const c = copyOf("برای دیدن [Item Shop](https://fortnite.com/item-shop?x=1_2) کلیک کن");
  assert.equal(c.html, `برای دیدن <a href="https://fortnite.com/item-shop?x=1_2">${R}Item Shop${R}</a> کلیک کن`);
});

test("@handles and #tags inside a Persian line keep their sign and underscores", () => {
  // the LRM holds the sign beside the name (without it the line shows "Fortnite_Leaks@")
  assert.equal(fix("منبع: @Fortnite_Leaks"), `منبع: ${R}${L}@Fortnite_Leaks${R}`);
  assert.equal(fix("متن #Fortnite جدید"), `متن ${R}${L}#Fortnite${R} جدید`);
  assert.equal(fix("__Fortnite Chapter 7__ شروع شد"), `__${R}Fortnite Chapter 7${R}__ شروع شد`);
});

test("signs glued to a name stay in it: A$AP Rocky, P!nk, LEGO® Fortnite, C++", () => {
  assert.equal(fix("اسکین A$AP Rocky که قراره بیاد!"), `اسکین ${R}A$AP Rocky${R} که قراره بیاد!`);
  assert.equal(fix("اسکین P!nk و Ke$ha"), `اسکین ${R}P!nk${R} و ${R}Ke$ha${R}`);
  assert.equal(fix("پک LEGO® Fortnite جدید"), `پک ${R}LEGO® Fortnite${R} جدید`);
  assert.equal(fix("اسکین Marvel™ اومد"), `اسکین ${R}Marvel™${L}${R} اومد`);
  assert.equal(fix("زبان C++ و Galaxy S24+"), `زبان ${R}C++${L}${R} و ${R}Galaxy S24+${L}${R}`);
  assert.equal(fix("اسکین $uicideboy$ اومد"), `اسکین ${R}${L}$uicideboy$${L}${R} اومد`);
  // the end of a Persian sentence is not part of the name
  assert.equal(fix("این Fortnite! خیلی خوبه"), `این ${R}Fortnite${R}! خیلی خوبه`);
  assert.equal(fix("بازی Fortnite."), `بازی ${R}Fortnite${R}.`);
  assert.equal(fix("قیمت $9.99 برای Crew"), `قیمت $9.99 برای ${R}Crew${R}`);
});

test("a line starting with the #️⃣ button is fixed like any other line", () => {
  assert.equal(fix("#️⃣ تعداد: 4 Squad"), `#️⃣ تعداد: 4 ${R}Squad${R}`);
});

test("removing a Link: line between two blank lines leaves one blank, not two", () => {
  const c = copyOf("متن خبر\n\nLink: https://x.com/a/status/1\n\n" + SIGNATURE_LINES.join("\n"));
  assert.equal(c.plain, `متن خبر\n${Z}\n` + SIGNATURE_LINES.map((l) => l.replace(/\*\*/g, "")).join("\n"));
  const kept = copyOf("الف\n\n\nب");
  assert.equal(kept.plain, `الف\n${Z}\n${Z}\nب`, "blank lines the user typed are left alone");
});

test("portrait clips: 720x1280 is 720p and gets the star", () => {
  const vars = app.videoVariants({ variants: [
    { content_type: "video/mp4", url: "https://video.twimg.com/x/vid/avc1/320x568/a.mp4" },
    { content_type: "video/mp4", url: "https://video.twimg.com/x/vid/avc1/720x1280/a.mp4" },
    { content_type: "video/mp4", url: "https://video.twimg.com/x/vid/avc1/480x852/a.mp4" },
    { content_type: "video/mp4", url: "https://video.twimg.com/x/vid/avc1/1080x1920/a.mp4" },
  ] });
  assert.deepEqual(plainData(vars.map((v) => v.label)), ["1080p", "720p", "480p", "320p"]);
  assert.equal(vars[app.pickRecommended(vars, "video")].label, "720p");
});

/* ---------- approved: a number after Season / Chapter / Part ... is part of the name ---------- */

test("Season 1, Chapter 7, Part 2 keep their number inside the run", () => {
  assert.equal(fix("**Chapter 7 Season 1** شروع شد"), `**${R}Chapter 7 Season 1${R}** شروع شد`);
  assert.equal(fix("آیتم‌های Part 2 اومد"), `آیتم‌های ${R}Part 2${R} اومد`);
  assert.equal(fix("چالش‌های Week 5 آزاد شد"), `چالش‌های ${R}Week 5${R} آزاد شد`);
  // a date after an ordinary name still belongs to the Persian sentence
  assert.equal(fix("پک The Final Reckoning 29 شهریور"), `پک ${R}The Final Reckoning${R} 29 شهریور`);
  assert.equal(fix("آپدیت Fortnite 12 شهریور"), `آپدیت ${R}Fortnite${R} 12 شهریور`);
});

/* ---------- the inline parser: nested and back-to-back formats ---------- */

test("back-to-back and nested formats come out well-formed", () => {
  const h = (t) => app.inline(t);
  assert.equal(h("**a *b***"), "<b>a <i>b</i></b>");
  assert.equal(h("**a*b***"), "<b>a<i>b</i></b>");
  assert.equal(h("*a***b**"), "<i>a</i><b>b</b>");
  assert.equal(h("***a****b*"), "<b><i>a</i></b><i>b</i>");
  assert.equal(h("***a* b**"), "<b><i>a</i> b</b>");
  assert.equal(h("*a **b** c*"), "<i>a <b>b</b> c</i>");
  assert.equal(h("**x ||y|| z**"), '<b>x <span class="tg-spoiler">y</span> z</b>');
  assert.equal(h("**🔥 Batman 🦇**"), "<b>🔥 Batman 🦇</b>");
  // the old forgiving forms still work
  assert.equal(h("** x**"), "<b> x</b>");
  assert.equal(h("**x **"), "<b>x </b>");
  assert.equal(h("2*3*4"), "2<i>3</i>4");
  // and things that are not formats stay text
  for (const t of ["5 * 3 * 2", "**hello", "____", "**", "a_b_c", "TG | @LolSmash"]) assert.equal(h(t), t);
  // markers inside a bare URL are part of the URL
  assert.equal(h("https://x.com/a__b__c"), "https://x.com/a__b__c");
  assert.equal(h("**https://fortnite.com**"), "<b>https://fortnite.com</b>");
  assert.equal(app.inline("**a *b***", true), "a b");
});

// tiny reader for the HTML the parser makes, back into per-character formats
function htmlChars(html) {
  const chars = [], stack = [];
  const re = /<(\/?)(span|code|b|i|u|s|a)(\s[^>]*)?>|&(amp|lt|gt|quot);|([\s\S])/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2]) {
      const k = m[2] === "span" ? "sp" : m[2] === "a" ? "a:" + (/href="([^"]*)"/.exec(m[3] || "") || [])[1] : m[2];
      if (m[1]) stack.splice(stack.map((x) => x.split(":")[0]).lastIndexOf(k.split(":")[0]), 1);
      else stack.push(k);
      continue;
    }
    const ch = m[4] ? { amp: "&", lt: "<", gt: ">", quot: '"' }[m[4]] : m[5];
    chars.push({ ch, f: [...stack].sort().join(",") });
  }
  return chars;
}
function runChars(runs) {
  const chars = [];
  for (const r of runs) {
    const f = ["b", "i", "u", "s", "sp", "code"].filter((k) => r.f[k]);
    if (r.f.a) f.push("a:" + r.f.a);
    for (const ch of r.t) chars.push({ ch, f: f.sort().join(",") });
  }
  return chars;
}

test("round trip: preview formatting → editor text → the same formatting (2000 random lines)", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const words = ["سلام", "Fortnite", "LEGO", "شهریور", "۱۲", "v42.00", "🦇", "a", "b", "Batman", "اسکین", "x"];
  const keys = ["b", "i", "u", "s", "sp"];
  for (let n = 0; n < 2000; n++) {
    const runs = [];
    const count = 1 + rnd(5);
    for (let k = 0; k < count; k++) {
      const f = {};
      for (const key of keys) if (rnd(3) === 0) f[key] = 1;
      if (rnd(14) === 0) f.code = 1;
      if (rnd(16) === 0) f.a = "https://fortnite.com/p" + rnd(3);
      let t = words[rnd(words.length)];
      if (rnd(4) === 0) t = " " + t;
      if (rnd(4) === 0) t += " ";
      runs.push({ t, f });
    }
    const md = app.runsToMarkdown(runs);
    const got = htmlChars(app.inline(md)), want = runChars(runs);
    // spaces at the edge of bold/italic may move outside it, which looks identical
    const norm = (c) => c.ch === " " ? c.f.split(",").filter((x) => x !== "b" && x !== "i").join(",") : c.f;
    assert.equal(got.map((c) => c.ch).join(""), want.map((c) => c.ch).join(""), "text: " + md);
    got.forEach((c, i) => assert.equal(norm(c), norm(want[i]), `format of "${c.ch}" (#${i}) in ${JSON.stringify(md)}`));
  }
});

test("links next to [brackets] and with [brackets] in their text", () => {
  const h = (s) => app.inline(s);
  assert.equal(h("***[ [آیتم شاپ | ITEM SHOP](https://fortnite.com/shop) ]***"),
    '<b><i>[ <a href="https://fortnite.com/shop">آیتم شاپ | ITEM SHOP</a> ]</i></b>');
  assert.equal(h("[**💢 [ پابلیک چت ]** ](https://t.me/LolSmashCity/942)"),
    '<a href="https://t.me/LolSmashCity/942"><b>💢 [ پابلیک چت ]</b> </a>');
  assert.equal(h("[a] [b](https://x.com/1) [c]"), '[a] <a href="https://x.com/1">b</a> [c]');
  assert.equal(h("[ [a](https://x.com/1) | [b](https://x.com/2) ]"),
    '[ <a href="https://x.com/1">a</a> | <a href="https://x.com/2">b</a> ]');
  // and the editor gets the tidy form back from formatted runs
  const bi = { b: 1, i: 1 }, link = { b: 1, i: 1, a: "https://fortnite.com/shop" };
  assert.equal(app.runsToMarkdown([{ t: "[ ", f: bi }, { t: "آیتم شاپ", f: link }, { t: " ]", f: bi }]),
    "***[ [آیتم شاپ](https://fortnite.com/shop) ]***");
});

test("round trip with [brackets] around and inside links (2000 random lines)", () => {
  let seed = 3;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const words = ["[", "]", "[ آیتم ]", "سلام", "Fortnite", "TG | @LolSmash", "✦", "ITEM SHOP", "x", "۲۶ مهر", "@LolSmash"];
  const keys = ["b", "i", "u", "s", "sp"];
  for (let n = 0; n < 2000; n++) {
    const runs = [];
    for (let k = 0, count = 1 + rnd(6); k < count; k++) {
      const f = {};
      for (const key of keys) if (rnd(3) === 0) f[key] = 1;
      if (rnd(5) === 0) f.a = "https://fortnite.com/p" + rnd(3);
      // a link's own text never has a lone bracket in it
      const pool = f.a ? words.filter((w) => w !== "[" && w !== "]") : words;
      let t = pool[rnd(pool.length)];
      if (rnd(4) === 0) t = " " + t;
      if (rnd(4) === 0) t += " ";
      runs.push({ t, f });
    }
    const md = app.runsToMarkdown(runs);
    const got = htmlChars(app.inline(md)), want = runChars(runs);
    const norm = (c) => c.ch === " " ? c.f.split(",").filter((x) => x !== "b" && x !== "i").join(",") : c.f;
    assert.equal(got.map((c) => c.ch).join(""), want.map((c) => c.ch).join(""), "text: " + md);
    got.forEach((c, i) => assert.equal(norm(c), norm(want[i]), `format of "${c.ch}" (#${i}) in ${JSON.stringify(md)}`));
  }
});

test("caption length is counted the way Telegram counts it", () => {
  const len = (text) => { app.input.value = text; return app.captionLength(); };
  // format markers don't count
  assert.equal(len("**سلام** __دنیا__ ||راز||"), "سلام دنیا راز".length);
  // a link counts its text only — the address behind it is not part of the post
  assert.equal(len("سلام [لینک](https://www.fortnite.com/item-shop?creator-code=FNLS)"), "سلام لینک".length);
  // direction marks around English words and the ZWNJ of a blank line are real characters of the post
  assert.equal(len("سلام Fortnite"), ("سلام " + R + "Fortnite" + R).length);
  assert.equal(len("a\n\nb"), ("a\n" + Z + "\nb").length);
  // UTF-16 units, like Telegram's own lengths: an emoji is 2
  assert.equal(len("🔥"), 2);
  // Link: lines (and the blank line above them) are not copied, so they don't count either
  assert.equal(len("سلام\n\nLink: https://x.com/a/status/1"), 4);
  // «ساده» still copies a readable "text url"
  app.input.value = "سلام [لینک](https://x.com/1)";
  assert.equal(app.output().plain, "سلام لینک https://x.com/1");
  // a real post: 133 characters of link addresses used to be counted
  app.input.value = [
    "***[ [آیتم شاپ | ITEM SHOP](https://www.fortnite.com/item-shop?creator-code=FNLS) ]***",
    "***[ [آیدی های گیفتینگ](https://deftgame.com/gifting-id/) | [خرید گیفت](https://deftgame.com/product-category/gifting/) ]***",
  ].join("\n");
  assert.equal(app.captionLength(), ("[ آیتم شاپ | " + R + "ITEM SHOP" + R + " ]\n[ آیدی های گیفتینگ | خرید گیفت ]").length);
  app.input.value = "";
});

/* ---------- embedded assets ---------- */

test("the five IRANSans fonts are byte-for-byte the originals; the icon is a 180×180 PNG", () => {
  const fs = require("fs"), crypto = require("crypto");
  const html = fs.readFileSync(require("./load-app").INDEX, "utf8");
  const fonts = html.split("\n").filter((l) => l.startsWith("@font-face"))
    .map((l) => crypto.createHash("sha256").update(l).digest("hex"));
  assert.deepEqual(fonts, [
    "c3ea798ec4ccdf215910499473792bbb1d0f742c56da7f34fab85cf5c5cb3c8d",
    "1182043c7d19c4ca5873e7d26d5f0c3bd507cb7a5e5f74eeca1d211ab90f1f7c",
    "c3b3a5738b6a1a120ad63e54e7ba2bc0a6842a985cc4f5a6a3e68dcf989c2f85",
    "477f435ba3a98bb078e3ed725b4b5025935a186a0683b19edc038209c75a6c52",
    "eb8783973da156410d806c99d5e19e65ada9d2a4e978f92fda2488dcef180581",
  ]);
  for (const rel of ["apple-touch-icon", "icon"]) {
    const m = new RegExp(`<link rel="${rel}" href="data:image/png;base64,([^"]+)">`).exec(html);
    assert.ok(m, rel + " link missing");
    const png = Buffer.from(m[1], "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180], rel + " size");
  }
});

/* ---------- rich mode (Telegram's rich-text posts) ---------- */

const RICH_SAMPLE = [
  "# آپدیت v42.00",
  "متن **پررنگ** با Fortnite",
  "## آیتم‌ها",
  "- اسکین Batman",
  "  - بک‌بلینگ",
  "1. اول",
  "2. دوم",
  "- [x] سرورها Online",
  "- [ ] رفع باگ",
  "",
  "| آیتم | قیمت |",
  "|---|---|",
  "| Batman | 1,500 |",
  "---",
  "![عکس](https://pbs.twimg.com/media/A.jpg)",
  "> نقل‌قول",
].join("\n");

test("rich parse: headings, lists (nested, numbered, tasks), table, divider, picture", () => {
  const b = plainData(app.parse(app.autoFix(RICH_SAMPLE), true));
  assert.deepEqual(b.map((x) => x.t), ["h", "line", "h", "list", "blank", "table", "hr", "img", "quote"]);
  assert.equal(b[0].level, 1);
  assert.equal(b[2].level, 2);
  assert.deepEqual(b[3].items.map((i) => [i.level, i.ordered, i.task]),
    [[0, false, null], [1, false, null], [0, true, null], [0, true, null], [0, false, true], [0, false, false]]);
  assert.equal(b[3].items[4].text, `سرورها ${R}Online${R}`, "the item keeps its direction marks; [x] is read through them");
  assert.deepEqual(b[5].rows.map((r) => r.length), [2, 2]);
  assert.equal(b[7].url, "https://pbs.twimg.com/media/A.jpg");
});

test("rich HTML: real headings, nested lists, ☑/☐, table, divider, picture; classic stays literal", () => {
  const html = app.toRichHtml(app.parse(app.autoFix(RICH_SAMPLE), true), ["https://pbs.twimg.com/media/TOP.jpg"]);
  assert.ok(html.startsWith('<div dir="rtl"><p><img src="https://pbs.twimg.com/media/TOP.jpg"'), "media-panel pictures open the post");
  for (const part of ['<h1 dir="auto">آپدیت', '<h2 dir="auto">', '<ul><li dir="auto">اسکین', "<ul><li", "</li></ul></li></ul><ol>",
    "☑ سرورها", "☐ رفع باگ", "<table><thead><tr><th", "<td dir=\"auto\">1,500</td>", "<hr>",
    '<img src="https://pbs.twimg.com/media/A.jpg" alt="عکس"', "<blockquote", "<b>پررنگ</b>"])
    assert.ok(html.includes(part), part);
  const plain = app.toRichPlain(app.parse(app.autoFix(RICH_SAMPLE), true));
  assert.ok(plain.includes("• اسکین") && plain.includes("1. اول") && plain.includes("☑ سرورها") && plain.includes("———"));
  // the same text in classic mode is an ordinary caption: nothing becomes a heading or a table
  const classic = copyOf(RICH_SAMPLE).html;
  assert.ok(!/<h1|<table|<ul|<hr|<img/.test(classic));
  assert.ok(classic.includes("| آیتم | قیمت |"));
});

test("'# title' is not a hashtag line (it gets direction marks); '#Fortnite' still is", () => {
  assert.equal(fix("# خبر Fortnite"), `# خبر ${R}Fortnite${R}`);
  assert.equal(fix("#Fortnite #فورتنایت"), "#Fortnite #فورتنایت");
});
