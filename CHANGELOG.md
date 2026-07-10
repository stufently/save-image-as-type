# Changelog

## [1.2.0] - 2026-07-10

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
