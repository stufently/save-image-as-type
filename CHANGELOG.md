# Changelog

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
