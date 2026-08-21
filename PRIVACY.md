# Privacy Policy

**Save Image As Type - PNG JPG WebP**

Last updated: 2026-08-21

## Data Collection

This extension does **not** collect, transmit, or share any user data. There is no server
behind it, no analytics, no tracking, no advertising, and no account. The developer receives
nothing about you or your images.

## How It Works

All image conversion happens entirely within your browser using the Canvas API. The image
you right-click is decoded, drawn to a canvas, re-encoded in the format you chose, and saved
through Chrome's download manager. **No image is ever uploaded anywhere.**

## What Leaves Your Device

For completeness, these are the only two ways any bytes leave your machine, and neither
sends anything to the developer:

- **Downloading the image being converted.** The extension fetches the image from the site
  that hosts it — the same request your browser already made to display it. If that request
  fails or returns non-image content (for example a login page), it retries once including
  your cookies for that same host, so that images behind a login can be converted. The
  request goes only to the image's own origin.
- **Settings sync.** Your preferences are stored with `chrome.storage.sync`, so Chrome
  replicates them to your other signed-in Chrome devices through your own Google account.
  Exactly three values are stored: `defaultFormat` (`png`, `jpg`, or `webp`), `jpgQuality`,
  and `webpQuality` (integers 10–100). Nothing else — no URLs, no filenames, no browsing
  history, no identifiers. If you are not signed in to Chrome sync, these values simply stay
  on the device.

## Permissions

This extension requests the following permissions solely for its core functionality:

- **contextMenus** — to add right-click menu items on images
- **downloads** — to save converted images to your device
- **storage** — to remember your quality settings (synced via Chrome)
- **notifications** — to show error messages when a conversion fails
- **offscreen** — to create an offscreen document for Canvas API conversion
- **scripting** — to read blob: image URLs from the page that created them
- **Host permissions (`<all_urls>`)** — to fetch images from any website you visit

## Third-Party Services

This extension does not use any third-party services, analytics, tracking, or advertising.

## Open Source

The complete source code is publicly available on GitHub for inspection.

## Contact

If you have questions about this privacy policy, please open an issue on the GitHub repository.
