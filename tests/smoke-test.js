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

      // convertImage resolves { dataUrl, notice } — notice is non-null only
      // when the conversion silently changed something (see the SVG clamp).
      const convert = async (b, mime, q) => (await convertImage(b, mime, q)).dataUrl;

      const jpg = await convert(blob, 'image/jpeg', 0.9);
      out.jpeg = typeof jpg === 'string' && jpg.startsWith('data:image/jpeg;base64,');

      const webp = await convert(blob, 'image/webp', 0.9);
      out.webp = typeof webp === 'string' && webp.startsWith('data:image/webp;base64,');

      const png = await convert(blob, 'image/png');
      out.png = typeof png === 'string' && png.startsWith('data:image/png;base64,');

      // SVG without width/height — must keep viewBox aspect ratio (2:1),
      // rasterized at 1024px longest side
      const svgBlob = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="red"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgPng = await convert(svgBlob, 'image/png');
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
      const svgResult2 = await convertImage(svgBlob2, 'image/png');
      const svgPng2 = svgResult2.dataUrl;
      // A vector inside the budget must come back untouched and unannounced
      out.svgNormalUnclamped = svgResult2.notice === null;
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
      const svgPng3 = await convert(svgBlob3, 'image/png');
      if (svgPng3 && svgPng3.startsWith('data:image/png;base64,')) {
        const decoded3 = await (await fetch(svgPng3)).blob();
        const bmp3 = await createImageBitmap(decoded3);
        out.svgPercentSize = `${bmp3.width}x${bmp3.height}`;
        bmp3.close();
      }

      // SVG raster bomb: a vector asking to be rendered at 200000x50000 —
      // 10 gigapixels, 40 GB of RGBA. A vector has no header to probe, so the
      // only defence is capping the rasterization target itself.
      //
      // Why this proves the cap is applied BEFORE any memory is allocated:
      // 200000x50000 is far past what Chrome will back with real pixels (max
      // 65535 per side, ~268 MP of area). Setting those dimensions on a canvas
      // does not throw — it yields a canvas with no usable backing store, on
      // which every draw is a silent no-op and every pixel reads back as
      // transparent black (verified against this Chromium build). So a
      // "rasterize at full size, then downscale" implementation could only
      // ever return an empty image here. Getting back a PNG that is exactly
      // the 25 MP budget, keeps the 4:1 ratio, AND is actually orange means
      // 10000x2500 was the only size the rasterizer was ever asked for.
      const svgBombBlob = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" width="200000" height="50000">' +
         '<rect width="200000" height="50000" fill="orange"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgBomb = await convertImage(svgBombBlob, 'image/png');
      // The user must be told the file is not the size the vector asked for.
      // Compared in full, separator included: offscreen.js is decoded as the
      // offscreen document's charset, so a missing <meta charset> turns the
      // "×" into mojibake in a string the user actually reads.
      out.svgBombNotice = svgBomb.notice || null;
      out.svgBombNotified =
        svgBomb.notice === 'This SVG was too large to render at 200000×50000, ' +
        'so it was saved at 10000×2500.';
      if (svgBomb.dataUrl && svgBomb.dataUrl.startsWith('data:image/png;base64,')) {
        const decodedBomb = await (await fetch(svgBomb.dataUrl)).blob();
        const bmpBomb = await createImageBitmap(decodedBomb);
        out.svgBombSize = `${bmpBomb.width}x${bmpBomb.height}`;
        // Sample the result: solid orange (#FFA500) means the vector really
        // was painted, not lost to an unbacked oversized canvas
        const probe = new OffscreenCanvas(1, 1);
        const probeCtx = probe.getContext('2d');
        probeCtx.drawImage(bmpBomb, 0, 0, 1, 1);
        out.svgBombPixel = Array.from(probeCtx.getImageData(0, 0, 1, 1).data).join(',');
        bmpBomb.close();
      }

      // Degenerate vector: 200000x1 is only 200k pixels, well inside the area
      // budget, yet no canvas can be that wide — an area-only clamp leaves it
      // untouched and the conversion dies with "Browser cannot encode".
      // Each side must be capped too, and a side may never round down to 0.
      const svgThinBlob = new Blob(
        ['<svg xmlns="http://www.w3.org/2000/svg" width="200000" height="1">' +
         '<rect width="200000" height="1" fill="orange"/></svg>'],
        { type: 'image/svg+xml' }
      );
      const svgThin = await convertImage(svgThinBlob, 'image/png');
      out.svgThinNotified = typeof svgThin.notice === 'string';
      if (svgThin.dataUrl && svgThin.dataUrl.startsWith('data:image/png;base64,')) {
        const decodedThin = await (await fetch(svgThin.dataUrl)).blob();
        const bmpThin = await createImageBitmap(decodedThin);
        out.svgThinSize = `${bmpThin.width}x${bmpThin.height}`;
        bmpThin.close();
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
        await convert(new Blob([bombHeader], { type: 'image/png' }), 'image/png');
        out.bombRejected = false;
        out.bombError = 'no error thrown';
      } catch (e) {
        out.bombError = e.message;
        out.bombRejected = /megapixel/i.test(e.message);
      }

      // A 1x1 PNG must still pass the probe untouched (no false positives)
      out.smallPngStillWorks =
        typeof (await convert(blob, 'image/png')) === 'string';

      // Two conversions in a row (offscreen reuse / close-mutex path)
      const again = await convert(blob, 'image/jpeg', 0.5);
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
    res.svgNormalUnclamped &&
    res.svgPercentSize === '1024x512' &&
    res.svgBombSize === '10000x2500' &&
    res.svgBombPixel === '255,165,0,255' &&
    res.svgBombNotified &&
    res.svgThinSize === '32767x1' &&
    res.svgThinNotified &&
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
