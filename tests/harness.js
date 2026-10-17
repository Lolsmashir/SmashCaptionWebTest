// Shared browser harness: serves ../index.html on localhost and mocks every
// outside request (tweet APIs, twimg media), so tests never touch the network.
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const TWEET_ID = "1834567890123456789";

const CAPTION = [
  "**🔥 کلاب ماه بعد: Batman × LEGO Fortnite — 12 شهریور 🦇**",
  "",
  "✦ آیتم‌های پک جدید:",
  "• اسکین The Dark Knight با استایل جدید",
  "◦ بک‌بلینگ Bat-Signal و پیک‌اکس Batarang",
  "• گلایدر Batwing",
  "",
  "⟡ قیمت: 1,200 ➥ 1,000 وی‌باکس",
  "⏰ ساعت 3:30 صبح به وقت ایران",
  "🗓️ پک The Final Reckoning 29 شهریور برمی‌گرده",
  "> آپدیت v42.00 فردا میاد و ||سرورها حدود ۲ ساعت آفلاینن||",
  "",
  "**🛒 USE CODE : FNLS ❤️‍🩹**",
  "**📣 TG | @LolSmash**",
  "**🛍️ SP | DeftGame.com**",
  "**#Fortnite | #فورتنایت**",
  "",
  `Link: https://x.com/FortniteGame/status/${TWEET_ID}`,
].join("\n");

const vid = (wh, q = "?tag=16") => `https://video.twimg.com/amplify_video/18/vid/avc1/${wh}/clip.mp4${q}`;
const POSTER = "https://pbs.twimg.com/amplify_video_thumb/18/img/poster.jpg";
const SIZES = { "1920x1080": 25804800, "1280x720": 10276044, "640x360": 3250585, "480x270": 1258291 };

// fxtwitter and vxtwitter describe the same single clip with different URL shapes
const FX = {
  tweet: { media: { videos: [{
    url: vid("1920x1080"), thumbnail_url: POSTER,
    variants: [
      { content_type: "application/x-mpegURL", url: "https://video.twimg.com/amplify_video/18/pl/clip.m3u8?tag=16" },
      { content_type: "video/mp4", bitrate: 256000, url: vid("480x270") },
      { content_type: "video/mp4", bitrate: 832000, url: vid("640x360") },
      { content_type: "video/mp4", bitrate: 2176000, url: vid("1280x720") },
      { content_type: "video/mp4", bitrate: 10368000, url: vid("1920x1080") },
    ],
  }] } },
};
const VX = { media_extended: [{ type: "video", url: vid("1920x1080", ""), thumbnail_url: POSTER }] };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(ROOT, p === "/" ? "index.html" : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://localhost:${srv.address().port}/` }));
  });
}

let posterPng = null;
async function makePoster(browser) {
  if (posterPng) return posterPng;
  const p = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await p.setContent(`<body style="margin:0;width:640px;height:360px;display:grid;place-items:center;
    background:linear-gradient(135deg,#1e3a8a,#7c3aed 55%,#f59e0b);font:700 64px sans-serif;color:#fff">
    <div style="text-shadow:0 4px 20px #0008">BATMAN × LEGO</div></body>`);
  posterPng = await p.screenshot();
  await p.close();
  return posterPng;
}

// opts.apis: "ok" | "fail" | "slow" ; opts.share: stub navigator.share like iPhone Safari
async function openApp(browser, base, { viewport, mobile = false, apis = "ok", share = mobile, fxDelay = 0 } = {}) {
  const poster = await makePoster(browser);
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile,
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  if (share) {
    await ctx.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (d) => { window.__shared.push(d); };
      navigator.canShare = () => true;
    });
  }
  // anything outside localhost is blocked so nothing leaks to the network;
  // registered first because later routes take priority over earlier ones
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-length" };
  const log = [];
  let release;
  const gate = new Promise((r) => (release = r));
  await ctx.route("https://api.fxtwitter.com/**", async (route) => {
    log.push(route.request().url());
    if (apis === "slow") await gate;
    if (fxDelay) await new Promise((r) => setTimeout(r, fxDelay));
    if (apis === "fail") return route.fulfill({ status: 503, headers: cors, body: "" });
    route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(FX) });
  });
  await ctx.route("https://api.vxtwitter.com/**", async (route) => {
    log.push(route.request().url());
    if (apis === "slow") await gate;
    if (apis === "fail") return route.abort("connectionrefused");
    route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(VX) });
  });
  await ctx.route("https://video.twimg.com/**", (route) => {
    const u = route.request().url();
    const wh = (u.match(/\/(\d+x\d+)\//) || [])[1];
    const size = SIZES[wh] || 999999;
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "video/mp4", "content-length": String(size) }, body: "" });
    route.fulfill({ status: 200, headers: { ...cors, "content-type": "video/mp4" }, body: Buffer.alloc(64) });
  });
  await ctx.route("https://pbs.twimg.com/**", (route) =>
    route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/png" }, body: poster }));

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, log, errors, releaseApis: () => release() };
}

async function typeCaption(page, text = CAPTION) {
  await page.fill("#input", text);
}

async function waitForMedia(page, rows = 4) {
  await page.waitForFunction((n) => {
    const r = document.querySelectorAll(".mcard .qitem");
    const sized = [...document.querySelectorAll(".mcard [data-size]")].filter((s) => s.textContent.trim());
    return r.length === n && sized.length >= n;
  }, rows, { timeout: 15000 });
  // let the entrance animation settle
  await page.waitForTimeout(500);
}

function launch() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

module.exports = { startServer, openApp, typeCaption, waitForMedia, launch, CAPTION, TWEET_ID, SIZES };
