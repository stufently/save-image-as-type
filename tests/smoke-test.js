// End-to-end smoke test: loads the extension into Chromium (new headless)
// and exercises the conversion pipeline through the real service worker.
//
// Run locally in Docker (never install Playwright on the host):
//   docker run --rm --entrypoint node -e NODE_PATH=/app/node_modules \
//     -v "$PWD/extension":/ext:ro -v "$PWD/tests":/tests:ro \
//     cf-reader /tests/smoke-test.js
//
// In CI it runs inside mcr.microsoft.com/playwright with EXT_PATH set.
const { chromium } = require('playwright');

const EXT_PATH = process.env.EXT_PATH || '/ext';

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/pw-profile', {
    headless: true,
    channel: 'chromium', // new headless — required for extension support
    args: [
      '--no-sandbox',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  const res = await sw.evaluate(async (pngDataUrl) => {
    const out = {};
    try {
      out.formats = FORMATS.map((f) => f.id).join(',');

      const blob = await fetchImage(pngDataUrl);
      out.fetchOk = blob.size > 0;

      const jpg = await convertImage(blob, 'image/jpeg', 0.9);
      out.jpeg = typeof jpg === 'string' && jpg.startsWith('data:image/jpeg;base64,');

      const webp = await convertImage(blob, 'image/webp', 0.9);
      out.webp = typeof webp === 'string' && webp.startsWith('data:image/webp;base64,');

      const png = await convertImage(blob, 'image/png');
      out.png = typeof png === 'string' && png.startsWith('data:image/png;base64,');

      // SVG without width/height — must keep viewBox aspect ratio (2:1),
      // rasterized at 1024px longest side
      const svgBlob = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="red"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgPng = await convertImage(svgBlob, 'image/png');
      out.svgPng = typeof svgPng === 'string' && svgPng.startsWith('data:image/png;base64,');
      if (out.svgPng) {
        const decoded = await (await fetch(svgPng)).blob();
        const bmp = await createImageBitmap(decoded);
        out.svgSize = `${bmp.width}x${bmp.height}`;
        bmp.close();
      }

      // SVG with explicit width/height — intrinsic size must be honored
      const svgBlob2 = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 100 50"><rect width="100" height="50" fill="blue"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgPng2 = await convertImage(svgBlob2, 'image/png');
      if (svgPng2 && svgPng2.startsWith('data:image/png;base64,')) {
        const decoded2 = await (await fetch(svgPng2)).blob();
        const bmp2 = await createImageBitmap(decoded2);
        out.svgExplicitSize = `${bmp2.width}x${bmp2.height}`;
        bmp2.close();
      }

      // SVG with percentage size — relative, must fall back to viewBox scaling
      const svgBlob3 = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 50"><rect width="100" height="50" fill="green"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgPng3 = await convertImage(svgBlob3, 'image/png');
      if (svgPng3 && svgPng3.startsWith('data:image/png;base64,')) {
        const decoded3 = await (await fetch(svgPng3)).blob();
        const bmp3 = await createImageBitmap(decoded3);
        out.svgPercentSize = `${bmp3.width}x${bmp3.height}`;
        bmp3.close();
      }

      // Decode bomb: a PNG header claiming 60000x60000 (3.6 gigapixels).
      // The file carries an IHDR and nothing else — no IDAT, no pixel data —
      // so a decoder would fail with "could not be decoded". Getting the
      // "too large" error instead proves the guard ran from the header,
      // before any decode allocated memory.
      const bombHeader = new Uint8Array(24);
      bombHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      bombHeader.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
      const bombView = new DataView(bombHeader.buffer);
      bombView.setUint32(16, 60000, false);
      bombView.setUint32(20, 60000, false);
      try {
        await convertImage(new Blob([bombHeader], { type: 'image/png' }), 'image/png');
        out.bombRejected = false;
        out.bombError = 'no error thrown';
      } catch (e) {
        out.bombError = e.message;
        out.bombRejected = /megapixel/i.test(e.message);
      }

      // A 1x1 PNG must still pass the probe untouched (no false positives)
      out.smallPngStillWorks =
        typeof (await convertImage(blob, 'image/png')) === 'string';

      // Two conversions in a row (offscreen reuse / close-mutex path)
      const again = await convertImage(blob, 'image/jpeg', 0.5);
      out.secondRun = typeof again === 'string' && again.startsWith('data:image/jpeg;base64,');

      out.fnLeadingDots = buildFilename('https://x.com/a/..hidden.png', 'jpg');
      out.fnNormal = buildFilename('https://x.com/a/My%20Photo.webp', 'jpg');
      out.fnQuality = getQualityForFormat('jpg', { jpgQuality: 80 });
    } catch (e) {
      out.error = e.message + '\n' + (e.stack || '');
    }
    return out;
  }, PNG_1x1);

  console.log(JSON.stringify(res, null, 2));
  await ctx.close();

  const pass =
    res.formats === 'png,jpg,webp' &&
    res.fetchOk && res.jpeg && res.webp && res.png &&
    res.svgPng && res.svgSize === '1024x512' &&
    res.svgExplicitSize === '64x32' &&
    res.svgPercentSize === '1024x512' &&
    res.bombRejected &&
    res.smallPngStillWorks &&
    res.secondRun &&
    res.fnLeadingDots === 'hidden.jpg' &&
    res.fnNormal === 'My_Photo.jpg' &&
    res.fnQuality === 0.8 &&
    !res.error;
  console.log(pass ? 'SMOKE TEST: PASS' : 'SMOKE TEST: FAIL');
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(2);
});
