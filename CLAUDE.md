# Caption Studio — rules for AI assistants

Read this whole file before changing anything in this repo.

## Must keep (regression list — none of this may break or disappear)

### Text pipeline
- Markdown → Telegram copy: "کپی برای تلگرام" writes BOTH `text/html` and `text/plain` via `ClipboardItem`, falling back to `writeText`, then `execCommand`.
- Formats, including nested combinations: `**bold**`, `*italic*`, `***bold+italic***`, `__underline__`, `~~strike~~`, `||spoiler||`, `` `code` ``, fenced code blocks, `> quote` blocks, `[text](url)`.
- Spoiler preview uses the animated "dust" effect and opens on click (and stays open while you edit inside it in the preview).
- Direction fixing runs automatically on the preview and on everything copied, but NOT on the editor text:
  - every Latin run inside a Persian line is wrapped in RLM (U+200F) on both sides;
  - a standalone number at the END of a Latin run belongs to the Persian sentence and stays outside: `The Final Reckoning 29 شهریور` → RLM only around `The Final Reckoning`. Numbers glued to letters (`v42.00`, `Ch7S4`) or in the middle (`Mastering 0 Sprites`) stay inside;
  - EXCEPTION (approved): a number right after Season / Chapter / Part / Vol / Volume / Episode / Ep / Act / Week / Day / Level / Tier / Phase / Round / Stage / Wave / Mission / Book is part of the name and stays inside (`Chapter 7 Season 1`, `Part 2`);
  - a URL is isolated as ONE run (never a mark inside it); a markdown link target `](url)` gets no marks at all;
  - `@handle` and inline `#tag` keep their sign inside the run, and inner underscores stay (`@Fortnite_Leaks`), so Telegram still links them;
  - a line starting with the `#️⃣` keycap emoji is a normal line, not a hashtag line;
  - lines with `➥` and no Persian get a leading LRM;
  - blank lines become a single ZWNJ (U+200C);
  - hashtag lines, fully-English lines and code fences are never touched;
  - existing RLM/LRM are stripped first; ZWNJ inside Persian words is NEVER removed.
- Lines labelled `Link:` / `Media:` / `Source:` and bare media-file URLs (pbs.twimg.com, video.twimg.com, image/video extensions) are removed from preview and copy. Plain URLs and markdown links stay.
- Leading/trailing blank lines are trimmed AFTER media lines are removed (otherwise a stray blank appears under the signature). A removed line between two blank lines leaves ONE blank line, not two.
- Formats are parsed with a stack (CommonMark-style delimiter matching, including the "rule of 3"), so nested and back-to-back formats like `***x***`, `**a *b***`, `*a***b**`, `**x ||y|| z**` come out well-formed. Markers inside a bare URL are not formats.
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
- Every quality row has three buttons: دانلود / کپی / ارسال. "کپی" on an image copies the image; on a video it opens the share sheet on phones (so I can Save Video to my gallery) and copies the link on desktop. "ارسال" is always there; dimmed when the browser can't share, and then it says so instead of downloading first.
- "720p" means the short side: a 720x1280 portrait clip is 720p and gets the ★.
- While a tweet resolves, a shimmering loading card shows. A tweet that gives nothing (or an API answer in an unknown shape) shows a friendly card with a «دوباره امتحان کن» button that retries.
- Cards are not rebuilt on every keystroke (no flashing while typing).

### UI
- Toolbar is a single vertical column on the right edge of the editor. When it doesn't fit it pans by mouse drag (like touch scrolling) and mouse wheel, with no visible scrollbar. A click after a drag must not trigger a button.
- Toolbar buttons: undo, redo, B, I, U, S, spoiler, quote, code block, link, `•` `◦` `⟡` `✦` `✧` `▸` `➥`, `⏱️` `⏰` `🗓️` `🌐` `🎁` `🏅` `#️⃣` `🎮`.
- Editor actions: پیست (primary), اصلاح متن ادیتور, امضا, پاک. Preview: کپی برای تلگرام, ساده. Media: حذف لینک‌ها, باز کردن همه.
- Shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+B/I/U, Ctrl+Enter = fix + copy, Esc closes the help sheet. Undo history of 120 steps; undo never skips typing that wasn't committed yet.
- Preview looks like a Telegram bubble, each line `dir="auto"`.
- PWA meta for "Add to Home Screen" on iPhone, safe-area insets respected (all four sides).
- No zoom on phones: viewport has `maximum-scale=1.0`, `html` has `touch-action: manipulation`.
- «پیست»: reads the clipboard; if the browser blocks it, the editor gets focus and a toast says exactly what to do (Ctrl+V / long-press / allow clipboard for the site).
- Caption counter (approved): `N / 1024` in the preview's bottom row, counting the COPIED plain text; yellow above 900, red above 1024 with a toast. The row is sticky so a long caption never hides it.
- Draft (approved): the editor text is saved to `localStorage` and restored after a refresh or iOS closing the home-screen app. «پاک» clears it.

### Editing in the preview (approved)
- The preview is `contenteditable`. Typing inside bold stays bold; Enter, Backspace, Ctrl+B/I/U work there and every edit writes back into the editor as markdown.
- The toolbar works on whichever side has the focus; while it works on the preview it shows a volt edge. Inline formats use the browser's commands, spoiler wraps via `<sup>` → `span.spoiler`, link asks for the URL, bullets/quote/code are applied to the editor lines and the preview redraws.
- Blocks the user did not edit give back their EXACT editor lines. `Link:` / `Media:` lines (and blank edges) the preview hides are put back where they were, so media cards never disappear.
- Pasted or dropped text arrives as plain text only. Emptying the whole preview starts a clean unformatted line.
- Leaving the preview redraws it (direction marks); undo/redo while in the preview keep the caret.
- Don't redraw the preview while the user types in it (it breaks the iPhone keyboard); it redraws on the next animation frame when the editor changes.

### Look
- Near-black surfaces without outlines, volt accent (`--volt: #d5f53f`), light film grain. Editor + preview are one split card; the preview uses Telegram's dark-theme colours. One bright button per panel; the media bar's main button is tinted.
- Logo: volt rounded square with a dark speech bubble and a volt lightning bolt (inline SVG in the header; the same design is the 180×180 PNG home-screen/tab icon).
- The five IRANSans `@font-face` blocks are byte-for-byte the originals — never re-encode them (a test checks their hashes). No CDNs, no web fonts, everything inline, one file.

## The layout rule I care about most

ONE layout at every size: editor and preview side by side, media panel underneath. The structure must NEVER change between sizes — no stacking into one column, no tabs, no toolbar turning into a horizontal row. Only sizes shrink or grow (fonts, buttons, spacing, using `clamp()` against both width and height).
- No page scrolling at any size. Panels may scroll internally only when their content genuinely doesn't fit.
- Nothing clipped, nothing overflowing its card, no truncated labels like "ا..".
- Editor font is 16px on touch devices (`pointer: coarse`) so iOS doesn't zoom; it scales normally on desktop.

## Never add or remove features on your own

Do NOT add, remove, rename or move any feature or button on your own. I have been burned by this before. If you have an idea for a new feature, list it in Persian at the end and wait for my yes. (The caption counter, the Season/Chapter rule, the retry button, Esc, editing in the preview and draft saving were proposed this way and approved.)

## Before you commit

- `cd tests && npm install && npm test` — all tests must pass (Node text-pipeline tests + Playwright browser tests; the tweet APIs are mocked).
- `node screens.js <out-dir>` — screenshots + layout audit at 390×844, 507×449, 800×600, 1440×900, 1920×1080 and more. Look at every screenshot yourself.
- GitHub Pages deploys `main` (root) through Jekyll: keep test tooling inside `tests/`, never commit `node_modules`, and don't add root files that Jekyll would choke on.
