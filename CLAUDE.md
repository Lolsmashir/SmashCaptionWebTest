# Caption Studio — rules for AI assistants

Read this whole file before changing anything in this repo.

## Must keep (regression list — none of this may break or disappear)

### Text pipeline
- Markdown → Telegram copy: "کپی برای تلگرام" writes BOTH `text/html` and `text/plain` via `ClipboardItem`, falling back to `writeText`, then `execCommand`.
- Formats, including nested combinations: `**bold**`, `*italic*`, `***bold+italic***`, `__underline__`, `~~strike~~`, `||spoiler||`, `` `code` ``, fenced code blocks, `> quote` blocks, `[text](url)`.
- Spoiler preview uses the animated "dust" effect and opens on click.
- Direction fixing runs automatically on the preview and on everything copied, but NOT on the editor text:
  - every Latin run inside a Persian line is wrapped in RLM (U+200F) on both sides;
  - a standalone number at the END of a Latin run belongs to the Persian sentence and stays outside: `The Final Reckoning 29 شهریور` → RLM only around `The Final Reckoning`. Numbers glued to letters (`v42.00`, `Ch7S4`) or in the middle (`Mastering 0 Sprites`) stay inside;
  - lines with `➥` and no Persian get a leading LRM;
  - blank lines become a single ZWNJ (U+200C);
  - hashtag lines, fully-English lines and code fences are never touched;
  - existing RLM/LRM are stripped first; ZWNJ inside Persian words is NEVER removed.
- Lines labelled `Link:` / `Media:` / `Source:` and bare media-file URLs (pbs.twimg.com, video.twimg.com, image/video extensions) are removed from preview and copy. Plain URLs and markdown links stay.
- Leading/trailing blank lines are trimmed AFTER media lines are removed (otherwise a stray blank appears under the signature).
- Signature button inserts exactly these four lines:
  ```
  **🛒 USE CODE : FNLS ❤️‍🩹**
  **📣 TG | @LolSmash**
  **🛍️ SP | DeftGame.com**
  **#Fortnite | #فورتنایت**
  ```

### Media panel
- Tweet links are resolved by calling api.fxtwitter.com AND api.vxtwitter.com in parallel (`Promise.allSettled`), merged by media ORDER (the two APIs return different URL shapes for the same clip — never create two cards for one video).
- Video renditions: deduped, sorted high→low, `.m3u8` excluded. Images get orig/large/medium/small variants.
- Recommended quality: images → original; videos → best at or below 720p. Marked with ★.
- File sizes via HEAD request; rows whose size duplicates another row are hidden.
- Card is horizontal: preview beside the quality list. Preview uses `object-fit: contain` over a blurred copy of itself, so square/portrait/wide media all look right.
- Every quality row has three buttons: دانلود / کپی / ارسال. "کپی" on an image copies the image; on a video it opens the share sheet on phones (so I can Save Video to my gallery) and copies the link on desktop.

### UI
- Toolbar is a single vertical column on the right edge of the editor. When it doesn't fit it pans by mouse drag (like touch scrolling) and mouse wheel, with no visible scrollbar. A click after a drag must not trigger a button.
- Toolbar buttons: undo, redo, B, I, U, S, spoiler, quote, code block, link, `•` `◦` `⟡` `✦` `✧` `▸` `➥`, `⏱️` `⏰` `🗓️` `🌐` `🎁` `🏅` `#️⃣` `🎮`.
- Editor actions: پیست (primary), اصلاح متن ادیتور, امضا, پاک. Preview: کپی برای تلگرام, ساده. Media: حذف لینک‌ها, باز کردن همه.
- Shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+B/I/U, Ctrl+Enter = fix + copy. Undo history of 120 steps.
- Preview looks like a Telegram bubble, each line `dir="auto"`.
- PWA meta for "Add to Home Screen" on iPhone, safe-area insets respected.

## The layout rule I care about most

ONE layout at every size: editor and preview side by side, media panel underneath. The structure must NEVER change between sizes — no stacking into one column, no tabs, no toolbar turning into a horizontal row. Only sizes shrink or grow (fonts, buttons, spacing, using `clamp()` against both width and height).
- No page scrolling at any size. Panels may scroll internally only when their content genuinely doesn't fit.
- Nothing clipped, nothing overflowing its card, no truncated labels like "ا..".
- Editor font is 16px on touch devices (`pointer: coarse`) so iOS doesn't zoom; it scales normally on desktop.

## Never add or remove features on your own

Do NOT add, remove, rename or move any feature or button on your own. I have been burned by this before. If you have an idea for a new feature, list it in Persian at the end and wait for my yes. For example, a caption length counter warning at Telegram's 1024-character limit for media captions — propose it, don't build it.
