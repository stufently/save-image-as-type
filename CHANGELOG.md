# Changelog

## [Unreleased]

### Fixed (2026-08-21)

- **Decode bomb no longer allocates memory before it is rejected.** The 100-megapixel guard
  ran *after* `createImageBitmap()`/`Image` had already decoded the file, so a small crafted
  image declaring e.g. 60000x60000 cost gigabytes of RAM before the check could fire.
  `offscreen.js` now parses the image header first (PNG IHDR, JPEG SOF0-SOF15, GIF, BMP,
  WebP VP8/VP8L/VP8X) and rejects oversized images from those few bytes alone. Formats whose
  header cannot be parsed still fall through to the original post-decode check, which is kept
  as a second line of defence. Closes the open "100MP checked after decode" item in TASKS.md

### Added (2026-08-21)

- **Popup and welcome page are now localized** in all 7 locales (en, es, pt_BR, de, fr, ja, ru).
  Both pages previously shipped hardcoded English while `_locales/` carried 7 languages, so a
  Russian or Japanese user saw a half-translated interface. New `extension/i18n.js` applies
  `chrome.i18n` messages to `[data-i18n]` elements at load (MV3 forbids inline scripts); the
  English text stays in the HTML as a per-key fallback
- **Error notifications are localized too** — every user-visible string in `background.js` and
  `offscreen.js` now goes through `chrome.i18n` with an English fallback
- `localeCode` message key per locale drives `<html lang>`. `@@ui_locale` was unreliable for
  this: in headless Chromium with `--lang=ru` it reported `en_US` while messages correctly
  resolved to Russian, which would have mislabelled the page language for screen readers
- 38 new message keys added to all 7 locales, fully translated — no locale falls back to English

### Changed (2026-08-21)

- Smoke test covers the decode bomb: a 24-byte PNG that is nothing but an IHDR claiming
  60000x60000. It has no pixel data at all, so a post-decode guard would report "could not be
  decoded" — getting the "too large" error instead proves the check runs from the header. The
  test also asserts a normal 1x1 PNG is unaffected

### Documentation (2026-08-21)

- README install section rewritten: the commented-out `detail/TODO` placeholder links and the
  stale "Coming soon to Chrome Web Store" line are gone. The extension has been live on the
  Chrome Web Store since v1.1.5 (ID `bbahljpklphbjnapiehkkijjofgceenm`), so the README now
  links the real listing, states plainly that Edge and Opera are not published yet, and gives
  full manual-install steps (download release ZIP → `chrome://extensions` → Developer mode →
  Load unpacked) with a note that manual installs do not auto-update
- README: added "Interface" section embedding the existing `store/screenshots` images of the
  context menu and the settings popup, and a "Why This Extension" section (local Canvas
  conversion, MV3, no fake AVIF option, awkward-source handling, MIT, 7 locales)
- README features list synced with the code: the "Save as default format" menu item, SVG /
  `data:` / `blob:` / cross-origin / cookie-protected image support, forced "Save As" dialog,
  encoder-fallback detection, and the 100-megapixel guard were all implemented but undocumented
- README + PRIVACY.md privacy claims made precise instead of absolute. "Transmits no data"
  now spells out the only two flows that leave the device — fetching the image from its own
  host (with a credentialed retry for login-walled images) and `chrome.storage.sync`
  replicating the three settings values through the user's own Google account. No image is
  uploaded and the developer still receives nothing
- README permissions note: documents that `scripting` is used only to read `blob:` URLs and
  that no declared permission is unused
- README localization claim corrected: only the extension name, store description, and context
  menu items are translated — the settings popup, welcome page, and error notifications are
  hardcoded English, which the README previously implied were localized too
- README release section: CWS auto-publish is described as configured and in use rather than
  conditional on credentials that "might" be set
- PUBLISHING.md: status banner clarifying that Chrome is already published and auto-updates on
  tag, while the Edge and Opera first-publication steps remain outstanding

## [1.2.0] - 2026-07-10 (released 2026-07-11)

> Released via the new auto-publish pipeline: tag v1.2.0 → GitHub Release → Chrome Web Store upload+publish (extension ID bbahljpklphbjnapiehkkijjofgceenm). First successful automated CWS deployment.

### Removed
- AVIF format (menu item, popup slider, locales, extension name, store description): Chrome's canvas.toBlob() cannot encode image/avif, so the option always failed with a misleading "update Chrome" error. AVIF images can still be opened/converted TO other formats

### Fixed
- Authorized images (cookie-protected CDNs, private albums): fetch now retries with credentials:'include' when the cookie-less request fails or returns a non-image response (e.g. an HTML login page with HTTP 200)
- SVG with percentage width/height (width="100%") now scales from viewBox instead of the 300x150 browser default
- Null-guards in all onMessage listeners (a malformed external message could throw TypeError)
- Race condition: idle timer could close the offscreen document between ensureOffscreenDocument() and sendMessage — added closingOffscreen mutex and claim conversion slot before the ensure step
- Filenames with leading dots (e.g. "..hidden.png") no longer rejected by downloads.download()
- SVG without width/height attributes: rasterized at viewBox aspect ratio with 1024px longest side (was 300x150 browser default)

### Improved
- Download data URL is built directly from the offscreen base64 payload — removed a full decode + re-encode pass (lower memory on large images)
- notifyError simplified to chrome.notifications only (removed dead alert-injection fallback)
- README permissions table synced with manifest (stale activeTab entry removed)

### Store assets
- PRIVACY.md synced with manifest (name without AVIF, notifications instead of removed activeTab)
- Store screenshots and promo images regenerated without AVIF (mockup/promo HTMLs + PNGs)

### CI/CD
- Chrome Web Store auto-publish on tag release (mnao305/chrome-extension-upload; gated on CWS_EXTENSION_ID repo variable + CWS_* secrets)
- workflow_dispatch input to re-run a release for an existing tag
- End-to-end smoke test (tests/smoke-test.js, Playwright + Chromium new headless) runs on every push to master
- Version parsing via jq instead of grep/sed; pinned ubuntu-24.04 runners
- Single ZIP for all stores — dropped the Opera-specific build (its sed had been silently no-oping since the 1.1.1 rename; new name fits all store limits)

### Changed
- 2026-07-10: Full code review (self + Codex + Antigravity) — findings documented in TASKS.md

## [1.1.5] - 2026-04-09

### Fixed
- Fix "URL.createObjectURL is not a function" crash in service worker — replaced blob URL with data URL for chrome.downloads.download (URL.createObjectURL is a DOM API, not available in MV3 service workers)
- Fix race condition: offscreen document's onMessage listener not registered when conversion message arrives — added ping/pong ready signal between offscreen.js and background.js
- Fix "source image could not be decoded" error (CWS rejection fix): use base64 encoding for ArrayBuffer data in chrome.runtime.sendMessage — JSON serialization on Chrome < 118 was destroying ArrayBuffer data
- Add SVG image support: createImageBitmap cannot decode SVG blobs, now falls back to Image element rendering
- Add Image element fallback for any image format that createImageBitmap fails to decode

## [1.1.2] - 2026-04-03

### Fixed
- Fix activeConversions leak if blob.arrayBuffer() throws (try/catch with decrement)
- Fix potential double-decrement of activeConversions on race condition (settled flag)
- Align quality clamp range 10-100 and per-format fallback defaults between popup and background
- Suppress console warning in offscreen.js by returning false from unused onMessage

## [1.1.1] - 2026-04-03

### Fixed
- Fix extName exceeding 45-char CWS limit in 6/7 locales (shortened all names)
- Fix race condition: idle timer could close offscreen during active conversion (added activeConversions counter)
- Fix blob URL leak when downloads.download() throws (added try/catch with revokeObjectURL)
- Fix quality values not validated/clamped in popup and background (added clampQuality)
- Fix missing lastError check in background getSettings()
- Clean up redundant \w in Unicode filename regex
- Remove unnecessary activeTab permission (already have host_permissions + scripting)

## [1.1.0] - 2026-04-03

### Fixed
- Fix offscreen.createDocument invalid reason: CANVAS → BLOBS (Chrome Web Store rejection fix)
- Fix offscreen document stale flag: always check getContexts() instead of boolean
- Fix race condition in offscreen document creation with promise lock
- Remove dead no-cors fallback (opaque responses always return size 0)
- Fix message ID collision: use crypto.randomUUID() instead of Date.now()+Math.random()
- Fix context menus not cleaned on extension update (add removeAll before create)
- Fix Unicode characters stripped from filenames (use Unicode-aware regex)
- Fix URL.revokeObjectURL timing: use downloads.onChanged instead of blind 60s timeout
- Fix sendMessage errors when service worker restarts during conversion
- Verify output format for all types (not just AVIF) to catch silent PNG fallback
- Add max image size check (100MP) to prevent memory exhaustion
- Add chrome.runtime.lastError checks in popup storage callbacks
- Clean up stale CSS class in popup status indicator

### Improved
- Use chrome.notifications instead of alert() for error messages
- Close offscreen document after 30s idle to free memory
- Create canvas dynamically instead of sharing static element
- Localize context menu titles in all 7 languages (en, ru, es, pt-BR, de, fr, ja)
- Validate defaultFormat in popup settings

## [1.0.0] - 2026-03-23

### Added
- Right-click context menu to save images as PNG, JPG, WebP, or AVIF
- Client-side image conversion via Canvas API (no server uploads)
- Quality sliders for JPG (default 92%), WebP (90%), AVIF (80%)
- Default format selection in popup settings
- Smart transparency handling (white background for JPG conversion)
- AVIF browser support detection with fallback warning
- Blob URL and data URL support via content script injection
- Original filename preservation with format extension swap
- Welcome/onboarding page on first install
- Localization: English, Spanish, Portuguese (Brazil), German, French, Japanese, Russian
- GitHub Actions workflow for automated releases
