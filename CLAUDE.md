# Caption Studio — rules for AI assistants

Read this whole file before changing anything in this repo.

## Must keep (regression list — none of this may break or disappear)

### Text pipeline
- Markdown → Telegram copy: "کپی برای تلگرام" writes BOTH `text/html` and `text/plain` via `ClipboardItem`, falling back to `writeText`, then `execCommand`.
- The copy is made for each Telegram app (checked against their own source code, 2026):
  - Telegram Desktop reads the HTML (`tg-spoiler` class, makes the line break around a quote itself) — unchanged.
  - Telegram Android reads the HTML but knows a spoiler only as `<spoiler>` and adds no line break around a quote or code block: every spoiler is `<span class="tg-spoiler"><spoiler>…</spoiler></span>`, and on Android the `<br>` before/after quotes and code blocks stay in.
  - Telegram iPhone never takes a quote (or spoiler) from pasted HTML; since mid-2026 it reads the plain text as CommonMark markdown. On iPhone the plain text is that markdown (`toTelegramMarkdown`): `  ` hard break at every line end, a blank line around quotes and code blocks, `<u>…</u>` for underline, markdown characters escaped, spoilers left as text (no markdown for them there). A caption with no format at all stays plain text. The HTML stays beside it for older versions. `tests/phones.test.js` reads it back with markdown-it.
- Formats, including nested combinations: `**bold**`, `*italic*`, `***bold+italic***`, `__underline__`, `~~strike~~`, `||spoiler||`, `` `code` ``, fenced code blocks, `> quote` blocks, `[text](url)`.
- Spoiler preview uses the animated "dust" effect and opens on click (and stays open while you edit inside it in the preview).
- Direction fixing runs automatically on the preview and on everything copied, but NOT on the editor text:
  - every Latin run inside a Persian line is wrapped in RLM (U+200F) on both sides; accented Latin letters are Latin too (`Día de Muertos`, `Pokémon`, `Señor`), so a name is never cut at an accent;
  - a standalone number at the END of a Latin run is part of the name and stays inside (`GTA 6`, `FIFA 25`, `FNCS 2026`), UNLESS a date, time or count word follows it (a Persian month, ساعت / روز / ماه / سال…, تا / نفر / درصد / دلار / تومان / وی‌باکس / اسکین / آیتم…, or a Persian letter glued to it like `3م`): then it belongs to the Persian sentence and stays outside: `The Final Reckoning 29 شهریور` → RLM only around `The Final Reckoning`; `Crew 1,000 وی‌باکس` → only around `Crew`. Numbers glued to letters (`v42.00`, `Ch7S4`) or in the middle (`Mastering 0 Sprites`) stay inside;
  - EXCEPTION (approved): a number right after Season / Chapter / Part / Vol / Volume / Episode / Ep / Act / Week / Day / Level / Tier / Phase / Round / Stage / Wave / Mission / Book is part of the name and stays inside (`Chapter 7 Season 1`, `Part 2`);
  - a URL is isolated as ONE run (never a mark inside it); a markdown link target `](url)` gets no marks at all;
  - `@handle` and inline `#tag` keep their sign inside the run, and inner underscores stay (`@Fortnite_Leaks`), so Telegram still links them;
  - signs glued to a name stay in its run, so the name is never cut in two: `A$AP Rocky`, `Ke$ha`, `P!nk`, `LEGO® Fortnite`, `Marvel™`, `C++`, `Galaxy S24+`. A sign at the very start or end of a run (`@`, `#`, `$`, `+`, `®`, `™`, `©`) gets an LRM (U+200E) inside the RLM pair so it shows beside the name (`@LolSmash`, not `LolSmash@`). A `!` or `.` that ends the Persian sentence is not part of the name. `tests/preview.test.js` checks how these names (and `Día de Muertos`, `GTA 6`) actually look on screen;
  - a number with a sign stuck to it (`$9.99`, `9.99$`, `50%`, `+50`, `€5`, `#1`) or a dash inside it (`2026-10-30`, `10-20`, `3-1`) shows as typed: it gets `RLM LRM … RLM` (and an LRM after a trailing sign), otherwise a Persian line flips it (`9.99$`). Plain numbers, times (`3:30`), `1,200 ➥ 1,000` and Persian digits are untouched; inside an English name nothing changes (`US$20`);
  - a line starting with the `#️⃣` keycap emoji is a normal line, not a hashtag line;
  - lines with `➥` and no Persian get a leading LRM;
  - blank lines become a single ZWNJ (U+200C);
  - hashtag lines, fully-English lines and code fences are never touched — EXCEPT an English-only list item in a post that has Persian (a line starting with a bullet `•` `◦` `◇` `✦` `✧` `⟡` `▸` `-` … , also inside a quote): its Latin run gets its RLM pair like in a Persian line, so the item sits on the right with the rest of the list (`• A$AP Rocky` under Persian items). The signature and other English lines that are not list items stay as they are;
  - existing RLM/LRM are stripped first; ZWNJ inside Persian words is NEVER removed.
- Tidy text (approved), in the preview and everything copied, not in the editor: Arabic `ي` `ى` `ك` become Persian `ی` `ک`; a run of spaces inside a line becomes one; no spaces at a line's end. Code (spans and fences), URLs and link addresses are untouched, and the spaces a line starts with stay (rich lists nest by them).
- Lines labelled `Link:` / `Media:` / `Source:` and bare media-file URLs (pbs.twimg.com, video.twimg.com, image/video extensions) are removed from preview and copy. Plain URLs and markdown links stay.
- Leading/trailing blank lines are trimmed AFTER media lines are removed (otherwise a stray blank appears under the signature). A removed line between two blank lines leaves ONE blank line, not two.
- Formats are parsed with a stack (CommonMark-style delimiter matching, including the "rule of 3"), so nested and back-to-back formats like `***x***`, `**a *b***`, `*a***b**`, `**x ||y|| z**` come out well-formed. Markers inside a bare URL are not formats.
- Literal brackets around a link stay text and the link still works: `***[ [آیتم شاپ | ITEM SHOP](url) ]***`; a link's own text may have brackets too: `[**💢 [ پابلیک چت ]**](url)`.
- Signature button inserts exactly these four lines:
  ```
  **🛒 USE CODE : FNLS ❤️‍🩹**
  **📣 TG | @LolSmash**
  **🛍️ SP | DeftGame.com**
  **#Fortnite | #فورتنایت**
  ```

### Paste with formats (approved)
- Copying from Telegram or from this site and pasting again keeps the formats: in the editor they come back as markdown, in the preview as formats. This works for Ctrl+V / long-press Paste in the editor, paste in the preview, and the «پیست» button.
- Sources: Telegram Desktop's clipboard HTML (`<b> <i> <u> <s> <tg-spoiler> <code> <pre> <blockquote> <a>`, line breaks as `<br>`, also right before/after a quote), «کپی برای تلگرام», text selected in the preview, Telegram Web (`strong/em/del`, `.spoiler`, `data-entity-type`, monospace fonts, emoji pictures → the emoji), and web pages / Google Docs (bold/italic styles, paragraphs, blank lines).
- «کپی برای تلگرام» then paste gives back exactly the same caption (a 400-caption random round-trip test checks this).
- Formats turned back into markdown nest the tidy way (a link inside a bold line stays inside one bold pair); every line is read back to check it, and the plain fixed order is used whenever the tidy one would read differently.
- Direction marks are stripped (the editor never has them); a line of only ZWNJ becomes an empty line.
- A link stays `[text](url)` only when its text is not the address itself; bare URLs, `@handles` and `#tags` stay plain text (Telegram links them itself).
- In a normal caption, headings become bold lines, lists get `•` / `◦` / `1.`, tables become `a | b` lines, `<hr>` becomes `———`, pictures are dropped.
- Clipboard HTML with no format at all is pasted as plain text, exactly as the browser does it. Inside a code block, paste is always plain text.
- Pasting into the preview inside bold/spoiler/link closes the format before the paste and opens it again after it; the pasted text keeps only its own formats. Pasted lines inside a quote stay in the quote; a pasted quote or code block gets its own lines. The caret ends up right after the paste, and one undo step takes the paste back.

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
- Tweet text (approved): after a tweet's media comes one glass card with its words (from fxtwitter, or vxtwitter when only it answers; twitter's trailing `t.co` link removed): 𝕏, name and @handle, the text (3 lines, a tap opens all of it) and a «کپی متن» button. A tweet with only words shows that card instead of the «پیدا نشد» card. The media badge counts files only.
- Tweet picture (approved): the tweet card's «عکس توییت» opens a sheet with a PNG of the tweet the way X shows it (dark "Lights out"): avatar (first letter when there is none), name, verified badge (blue / gold for business / grey for government), @handle, the words (@, # and links in X blue), up to 4 pictures (video posters too) in X's grid, `time · date · N Views`, and the reply / repost / like / bookmark / share row with counts. Two versions: «اصلی» (the tweet's own words) and «با متن ما» (the caption's words — no signature, no `Link:` lines — right-to-left in IRANSans with its bold/italic/links/quotes, spoilers drawn as Telegram dust), disabled while the caption is empty. Watermark: a small `[Telegram mark] @LolSmash` pill on the pictures' bottom-left corner, or in the header's corner when there are no pictures. «دانلود» / «کپی» (image/png) / «ارسال» (share sheet; dimmed when the browser can't share files); Esc / بستن closes. How it is made: the card is laid out by the browser in a hidden `.shot` element, then painted onto a canvas at 2× (1120 px wide) piece by piece — backgrounds, pictures (fetched as blobs, so the canvas stays readable), icons (Path2D), borders, and every word at the place the browser gave it (a Persian word with a ZWNJ is drawn whole) — so wrapping, direction, fonts and emoji are right and it works on iPhone Safari (no SVG foreignObject).

### UI
- Toolbar is a single vertical column on the right edge of the editor. When it doesn't fit it pans by mouse drag (like touch scrolling) and mouse wheel, with no visible scrollbar. A click after a drag must not trigger a button.
- Toolbar buttons: undo, redo, B, I, U, S, spoiler, quote, code block, link, `•` `◦` `⟡` `✦` `✧` `▸` `➥`, `⏱️` `⏰` `🗓️` `🌐` `🎁` `🏅` `#️⃣` `🎮`.
- Editor actions: پیست (primary), اصلاح متن ادیتور, امضا, پاک. Preview: کپی برای تلگرام, ساده. Media: حذف لینک‌ها, باز کردن همه.
- Shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+B/I/U, Ctrl+Enter = fix + copy, Esc closes the help, ✂, history and tweet-picture sheets. Undo history of 120 steps; undo never skips typing that wasn't committed yet.
- Preview looks like a Telegram bubble, each line `dir="auto"`.
- PWA meta for "Add to Home Screen" on iPhone, safe-area insets respected (all four sides).
- No zoom on phones: viewport has `maximum-scale=1.0`, `html` has `touch-action: manipulation`.
- On a touch screen no button pulls the keyboard up (پاک, پیست, اصلاح, امضا, toolbar): the caret only moves into the editor if the keyboard is already open. Toolbar and action buttons don't take the focus (`mousedown` is prevented), so an open keyboard stays open.
- Messages (toast) drop in at the top, centred in the header band, with a coloured dot (green = done, yellow = warning). They never sit on a button and the phone keyboard can't hide them.
- «پیست»: reads the clipboard (with its formats via `clipboard.read()`, else `readText`); if the browser blocks it, the editor gets focus and a toast says exactly what to do (Ctrl+V / long-press / allow clipboard for the site).
- Caption counter (approved): `N / 1024` in the preview's bottom row; yellow above 900. The row is sticky so a long caption never hides it. Writing is never limited; the counter only shows the limit.
  - Above 1024 (approved): the caption needs Premium — the counter turns violet, shows `N / 4096` (with ✦ where there is room), the ✂ chip lights up, and a toast says it needs Premium (up to 4096) or can be split with ✂. Above 4096 it turns red with a toast (not even Premium).
  - It counts what Telegram counts: the text of the post once its formats are applied. Format markers and the ADDRESS behind a link don't count (a link counts its text only); the direction marks and the ZWNJ of blank lines are real characters of the post and do; units are UTF-16 (an emoji is 2). «ساده» still copies links as "text url".
  - Telegram's caption limit is 1024 for normal accounts and (per 2024 reports) 4096 with Premium.
- Draft (approved): the editor text is saved to `localStorage` and restored after a refresh or iOS closing the home-screen app. «پاک» clears it.
- History (approved): a clock button in the header, beside ؟, opens a sheet with the last 10 captions copied («کپی برای تلگرام», Ctrl+Enter, «ساده») or cleared («پاک»), newest first, saved in `localStorage` as `caption-studio-history` (the same text is kept once). Each shows its date and time, its count, its first lines as the post shows them, «کپی» (copies that caption) and «بیار تو ادیتور» (puts it in the editor, keeping what was there in the history; one ↶ brings that back). Its button doesn't take the focus.
- Copy warnings (approved): «کپی برای تلگرام» and «ساده» always copy, but the message turns yellow and adds «— ولی …» when the caption has no signature («USE CODE»), a link without a proper address (`[text](` / `[text]()`), or (classic mode) a `**` `__` `~~` `||` the parser could not pair, which would show in the post as it is. Handles, URLs and code don't count.

### Split post (approved)
- A small ✂ chip sits beside the counter (classic mode only; hidden in rich mode). It opens a sheet that splits the post into parts that each fit, without touching the editor text.
- The sheet: the caption's count and the limits; a limit switch «سقف عادی 1024» / «پریمیوم 4096» (Latin digits, saved in `localStorage` as `caption-studio-cut-limit`; switching starts again from the fewest parts); part-count buttons (2, 3, 4…; counts with a part over the limit are disabled); each part as a small Telegram preview with its own `N / limit` and a «کپی قسمت N» button.
- Smart cuts: a cut never goes through a quote or a code block; it prefers blank lines, then sentence ends, and avoids a line ending in ":" (it opens what follows), the inside of a list and the line right after the title; parts come out about the same size. `Link:` / `Media:` lines are in no part.
- Between two parts, ▲ / ▼ move that cut one line up / down (blank lines are stepped over, no part can become empty).
- Part 1 keeps the post's own full signature (found from its «USE CODE» line near the end); every other part ends, after a blank line, with the short signature — the first two lines of the signature:
  ```
  **🛒 USE CODE : FNLS ❤️‍🩹**
  **📣 TG | @LolSmash**
  ```
- «کپی قسمت N» copies that part exactly like «کپی برای تلگرام» (direction fixing, per-app HTML / iPhone markdown); the toast says which part was copied. Esc or ✕ closes the sheet; on a phone the keyboard stays down.

### Editing in the preview (approved)
- The preview is `contenteditable`. Typing inside bold stays bold; Enter, Backspace, Ctrl+B/I/U work there and every edit writes back into the editor as markdown.
- The toolbar works on whichever side has the focus; while it works on the preview it shows a volt edge. Inline formats use the browser's commands, spoiler wraps via `<sup>` → `span.spoiler`, link asks for the URL, bullets/quote/code are applied to the editor lines and the preview redraws.
- Blocks the user did not edit give back their EXACT editor lines. `Link:` / `Media:` lines (and blank edges) the preview hides are put back where they were, so media cards never disappear.
- Pasted text keeps its Telegram formats and nothing else: dropped text is ignored, and colours, fonts and sizes of the source never come in. Emptying the whole preview starts a clean unformatted line.
- Leaving the preview redraws it (direction marks); undo/redo while in the preview keep the caret.
- Don't redraw the preview while the user types in it (it breaks the iPhone keyboard); it redraws on the next animation frame when the editor changes.

### Rich mode (approved)
- A glass «معمولی / ریچ ✦» switch at the top of the preview chooses between a normal Telegram caption (classic) and a rich-text post for Telegram's rich text editor (Premium). The choice is saved. Classic behaviour must stay exactly as described above.
- Rich mode understands, on top of every classic format: `#`/`##`/`###` headings, `- ` / `* ` lists (nested by 2 spaces), `1. ` numbered lists, `- [ ]` / `- [x]` checklists (shown as ☐/☑), GFM tables (`| a | b |` + `|---|---|`), `---` dividers and `![alt](url)` pictures between paragraphs. In classic mode the same text stays literal.
- Rich-only toolbar buttons (heading, list, numbered, checklist, table, divider) appear only in rich mode; they work in the editor and in the preview. In classic mode the toolbar is exactly the 25 buttons above.
- The media panel's pictures open the post (gallery at the top of the bubble); video posters show with ▶ but videos are not copied ("send the video separately"). A picture already placed with `![](url)` is not repeated.
- «کپی برای تلگرام» in rich mode copies the post the way a browser copies a selected page (`execCommand("copy")` on a hidden rendered copy), falling back to `ClipboardItem`; the clipboard HTML has headings, lists, tables and `<img>` for the pictures, pictures first. «ساده» copies a readable plain version.
- The counter in rich mode counts against Telegram's 32,768-character rich-post limit.
- Editing tables, lists and headings inside the rich preview writes clean markdown back (table rows with their separator, `- ` / `1. ` prefixes, `#` levels).
- A hashtag needs its word right after `#`; `# title` is a heading, not a hashtag line.

### Motion (approved)
- Short and light: only `transform` / `opacity` animate (nothing re-lays out the page), nothing loops while you work except the logo's slow glow, and `prefers-reduced-motion: reduce` turns all of it off (no opening at all).
- Opening, under a second and never blocking: the logo pops in the middle, its bolt draws itself, a ring flashes, the curtain fades while the header and the three glass panes rise into place (`.app.boot` delays). JS removes the curtain and `boot` when the animations end (fallback 4 s).
- A press sends a soft glow out from the finger (`.rip`). Done buttons (copy, download, پیست…) turn green, a light sweeps over them and a check draws itself; their width is held and a second click never loses the label.
- Downloads, ارسال and image copies show a REAL progress bar on the quality row: bytes counted from the response stream, percent when the size is known, megabytes when not; green when done, then the check.
- Typing: the editor's glass glows a little and the bubble's second tick waits for a pause. «کپی برای تلگرام» = sent: the bubble's time is now, the ticks turn blue, a light passes over the bubble.
- The caption counter fills as the caption grows. Toasts show a thin line that runs out while they stay. The معمولی / ریچ switch is one pill that glides. Media thumbnails settle in once loaded; the media panel rises in when it appears.

### Look
- Liquid glass: soft colour fields behind (volt, blue, violet), three floating glass panes (tint + `backdrop-filter: blur saturate` + a light rim brightest at the top corner), a glass toolbar capsule, glass chips for secondary buttons, a glossy volt drop for the main button, glass toast / sheet / mode switch, springy presses. No flat outlines. The preview is a Telegram dark-theme screen set into its glass pane. One bright button per panel; the media bar's main button is tinted.
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

- `cd tests && npm install && npm test` — all tests must pass (Node text-pipeline tests + Playwright browser tests; the tweet APIs are mocked). Browser tests run with "reduce motion" so nothing is mid-animation; `motion.test.js` and `screens.js` run with every animation on.
- `node screens.js <out-dir>` — screenshots + layout audit at 390×844, 507×449, 800×600, 1440×900, 1920×1080 and more, each in classic AND rich mode. Look at every screenshot yourself.
- Writing `\u200F`-style escapes through some tools turns them into the invisible characters themselves; keep RLM/LRM/ZWNJ/FE0F as `\u` escapes in code.
- GitHub Pages deploys `main` (root) through Jekyll: keep test tooling inside `tests/`, never commit `node_modules`, and don't add root files that Jekyll would choke on.
