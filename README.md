# Save Image As PNG, JPG, WebP — Image Converter

Chrome extension to save any image from the web as PNG, JPG, or WebP. Fast client-side conversion via Canvas API — no uploads, no servers, 100% private.

> AVIF was removed in v1.2.0: Chrome's `canvas.toBlob()` cannot encode `image/avif`, so the option could never work client-side.

## Install

### From Stores

<!-- TODO: uncomment when published
- [Chrome Web Store](https://chrome.google.com/webstore/detail/TODO)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/TODO)
- [Opera Add-ons](https://addons.opera.com/extensions/details/TODO)
-->

Coming soon to Chrome Web Store, Edge Add-ons, and Opera Add-ons.

### Developer Mode

1. Clone this repo or download a [release ZIP](https://github.com/stufently/save-image-as-type/releases)
2. Open `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `extension/` folder

## Features

- Right-click context menu on any image: Save as PNG, JPG, WebP
- Client-side conversion via Canvas API (no server, no uploads)
- Quality sliders for lossy formats (JPG, WebP)
- Smart transparency handling (white background for JPG)
- Welcome page on first install
- Manifest V3, minimal permissions
- Open source

## How to Use

1. Right-click any image on a webpage
2. Select **Save Image As** from the context menu
3. Choose your format: PNG, JPG, or WebP
4. Pick where to save — done!

**Tip:** Click the extension icon to adjust default format and quality settings.

## Supported Formats

| Format | Type | Best For |
|---|---|---|
| PNG | Lossless | Screenshots, graphics, transparency |
| JPG | Lossy (adjustable) | Photos, smaller file size |
| WebP | Lossy (adjustable) | Modern web, 25-35% smaller than JPG |

## Architecture

```
extension/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker: context menus, fetch, download orchestration
├── offscreen.html/.js     # Offscreen document for Canvas API image conversion
├── welcome.html           # Onboarding page shown on first install
├── popup/                 # Settings popup (format, quality sliders)
├── icons/                 # Extension icons (16/32/48/128)
└── _locales/              # Localization (en, es, pt_BR, de, fr, ja, ru)
```

**Why offscreen document?** Service workers cannot use DOM Canvas with `toBlob()` for all formats. The offscreen document provides a real DOM context for image conversion.

**Flow:** Right-click image → background.js fetches image blob → sends to offscreen.js for Canvas conversion → downloads converted blob via `chrome.downloads`.

## Permissions

| Permission | Why |
|---|---|
| `contextMenus` | Right-click menu items |
| `downloads` | Save converted images |
| `storage` | Remember quality settings |
| `notifications` | Show conversion error messages |
| `offscreen` | Create offscreen document for Canvas API conversion |
| `scripting` | Read blob: image URLs from the page that created them |
| `<all_urls>` (host) | Fetch images from any domain (required for cross-origin image download) |

Note: `<all_urls>` host permission is broad but necessary. The extension needs to download images from any website the user visits. No data is collected or sent anywhere.

## Release & Publishing

### Creating a Release

1. Update version in `extension/manifest.json`
2. Commit the change
3. Create and push a git tag:

```bash
git tag v1.0.1
git push && git push --tags
```

GitHub Actions will automatically build a ZIP, create a GitHub Release, and — if Chrome Web Store credentials are configured — upload and publish the new version to CWS.

### Chrome Web Store auto-publish

The `publish-chrome` job in `.github/workflows/release.yml` runs when the repository variable `CWS_EXTENSION_ID` is set. Required configuration (Settings → Secrets and variables → Actions):

| Kind | Name | Value |
|---|---|---|
| Variable | `CWS_EXTENSION_ID` | Extension ID from the CWS dashboard URL |
| Secret | `CWS_CLIENT_ID` | OAuth client ID (Google Cloud Console) |
| Secret | `CWS_CLIENT_SECRET` | OAuth client secret |
| Secret | `CWS_REFRESH_TOKEN` | OAuth refresh token with `chromewebstore` scope |

See [Chrome Web Store API docs](https://developer.chrome.com/docs/webstore/using-api) for obtaining the OAuth credentials. The first submission must still go through the CWS dashboard UI; auto-publish handles updates.

### Publishing to Other Stores

Download the ZIP from GitHub Releases and upload manually:

| Store | Dashboard | Cost |
|---|---|---|
| Chrome Web Store | [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole) | $5 one-time |
| Edge Add-ons | [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) | Free |
| Opera Add-ons | [Opera Developer](https://addons.opera.com/developer/) | Free |

The same ZIP works for all three stores (Manifest V3 compatible).

### Versioning

- Version lives in `extension/manifest.json` (`"version"` field)
- Git tags must match: tag `v1.0.1` requires manifest version `1.0.1`
- CI verifies the match and fails if they differ

## Localization

Store listing (name + description) is localized in `extension/_locales/`:

| Language | Code |
|---|---|
| English | `en` |
| Spanish | `es` |
| Portuguese (Brazil) | `pt_BR` |
| German | `de` |
| French | `fr` |
| Japanese | `ja` |
| Russian | `ru` |

## Privacy

This extension does not collect, store, or transmit any data. All image conversion happens locally in your browser. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT
