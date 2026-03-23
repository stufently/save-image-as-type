# Save Image As Type

Chrome extension to save any image from the web as PNG, JPG, WebP, or AVIF.

Replacement for the original "Save Image As Type" extension (1M+ users) that was removed from Chrome Web Store.

## Features

- Right-click context menu on any image: Save as PNG, JPG, WebP, AVIF
- Client-side conversion via Canvas API (no server, no uploads)
- Quality sliders for lossy formats (JPG, WebP, AVIF)
- Smart transparency handling (white background for JPG)
- AVIF support detection with fallback warning
- Manifest V3, minimal permissions

## Install (Developer Mode)

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

## Architecture

```
extension/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker: context menus, fetch, download orchestration
├── offscreen.html/.js     # Offscreen document for Canvas API image conversion
├── popup/                 # Settings popup (format, quality sliders)
└── icons/                 # Extension icons (16/32/48/128)
```

**Why offscreen document?** Service workers cannot use DOM Canvas with `toBlob()` for all formats. The offscreen document provides a real DOM context for image conversion.

**Flow:** Right-click image → background.js fetches image blob → sends to offscreen.js for Canvas conversion → downloads converted blob via `chrome.downloads`.

## Permissions

| Permission | Why |
|---|---|
| `contextMenus` | Right-click menu items |
| `downloads` | Save converted images |
| `storage` | Remember quality settings |
| `activeTab` | Access current tab for error notifications and blob: URLs |
| `offscreen` | Create offscreen document for Canvas API conversion |
| `scripting` | Inject error messages and read blob: URLs from pages |
| `<all_urls>` (host) | Fetch images from any domain (required for cross-origin image download) |

Note: `<all_urls>` host permission is broad but necessary. The extension needs to download images from any website the user visits. No data is collected or sent anywhere.

## Store Listing

See `store/` directory for Chrome Web Store description and asset requirements.
