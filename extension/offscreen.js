// Offscreen document for Canvas-based image conversion.
// Service workers cannot use Canvas/OffscreenCanvas.toBlob with all formats,
// so we use an offscreen document with a real DOM canvas.

const MAX_PIXELS = 100_000_000; // 100 megapixels

// SVG has no pixels of its own — the raster size is whatever we ask the
// browser for. `<svg width="200000" height="50000">` asks for 10 gigapixels,
// i.e. 40 GB of RGBA, and no header parser can catch it because a vector has
// no header. So vectors are clamped instead of rejected: the picture still
// converts, just smaller. 25 MP (5000x5000) is far past any screen or print
// use for a converted logo/icon and keeps the canvas at 100 MB.
const MAX_SVG_PIXELS = 25_000_000; // 25 megapixels

// Area alone is not enough: `<svg width="200000" height="1">` is a mere
// 200k pixels, yet Chrome will not back a canvas that wide. It does not throw
// — the attribute is accepted and the canvas is simply left without pixels,
// so every draw is a silent no-op and toBlob() then fails to encode. Each
// side is therefore capped as well.
const MAX_CANVAS_SIDE = 32_767;

// Used when an SVG offers no usable size at all.
const SVG_DEFAULT_SIDE = 1024;

// --- Localized strings ---
// Offscreen documents are extension pages, so chrome.i18n is available here.
// These messages travel back to background.js and end up in a notification.

function msg(key, fallback, substitutions) {
  try {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  } catch {
    return fallback;
  }
}

// --- Dimension Probing (BEFORE decode) ---
// A decode bomb — say a 65535x65535 PNG that is a few KB on disk — allocates
// ~17 GB the moment a decoder touches it. Checking MAX_PIXELS after
// createImageBitmap()/Image therefore checks it too late: the memory is
// already gone. These parsers read only the format header (tens of bytes) and
// never decode pixel data, so an oversized image is rejected for free.
// Unknown/unparseable formats return null and fall back to the post-decode
// check, which still runs as a second line of defence.

function probeJpegSize(bytes, view) {
  let offset = 2; // skip SOI
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset++; continue; } // fill byte
    // Standalone markers: no length payload follows
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan
    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;
    // SOF0..SOF15 carry the frame size; C4/C8/CC are DHT/JPG/DAC, not SOF
    const isSof = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // SOF payload order is: precision, height, width
      return {
        width: view.getUint16(offset + 7, false),
        height: view.getUint16(offset + 5, false),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function probeWebpSize(bytes, view) {
  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (fourcc === 'VP8 ' && bytes.length >= 30) {
    // Lossy: 14-bit width/height after the 0x9D012A sync code
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourcc === 'VP8L' && bytes.length >= 25) {
    // Lossless: 14 bits width-1, then 14 bits height-1
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (fourcc === 'VP8X' && bytes.length >= 30) {
    // Extended: 24-bit canvas width-1 / height-1
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  return null;
}

function probeImageSize(arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 16) return null;
    const view = new DataView(arrayBuffer);

    // PNG: IHDR width/height are uint32 BE at 16/20
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
      if (bytes.length < 24) return null;
      return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }

    // GIF87a / GIF89a: uint16 LE at 6/8
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }

    // BMP: int32 LE at 18/22 (height may be negative for top-down rows)
    if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length >= 26) {
      return {
        width: Math.abs(view.getInt32(18, true)),
        height: Math.abs(view.getInt32(22, true)),
      };
    }

    // WebP: RIFF....WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return probeWebpSize(bytes, view);
    }

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return probeJpegSize(bytes, view);
    }
  } catch {
    // Malformed header — fall back to the post-decode check
  }
  return null;
}

function exceedsPixelBudget(size) {
  return !!size &&
    Number.isFinite(size.width) && Number.isFinite(size.height) &&
    size.width > 0 && size.height > 0 &&
    size.width * size.height > MAX_PIXELS;
}

function tooLargeError() {
  return new Error(msg('errImageTooLarge', 'Image is too large to convert (maximum 100 megapixels).'));
}

// Shrink a requested raster size until it fits both the pixel budget and the
// canvas side limit, keeping the aspect ratio. Used for vectors, where the
// size is a request rather than a fact.
//
// One deliberate exception to "keep the ratio": a side never goes below 1px,
// so a degenerate request like 200000x1 comes back as 32767x1 rather than
// 32767x0.16. Squashing the ratio is the only alternative to producing
// nothing at all, and 0px would be nothing at all.
function clampSvgRasterSize(width, height) {
  const w = Math.floor(width);
  const h = Math.floor(height);

  // NaN, Infinity, zero and negatives cannot be scaled into anything useful
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    return { width: SVG_DEFAULT_SIDE, height: SVG_DEFAULT_SIDE, clamped: false };
  }

  const scale = Math.min(
    1,
    Math.sqrt(MAX_SVG_PIXELS / (w * h)),
    MAX_CANVAS_SIDE / w,
    MAX_CANVAS_SIDE / h
  );
  if (scale >= 1) return { width: w, height: h, clamped: false };

  let outWidth = Math.max(1, Math.floor(w * scale));
  let outHeight = Math.max(1, Math.floor(h * scale));

  // Belt and braces: raising a side that floored to 0 back up to 1px is the
  // one step that can add pixels back. It cannot currently overshoot the
  // budget (the other side is capped at MAX_CANVAS_SIDE, far below it), but
  // that only holds while the two constants stay in their present relation.
  if (outWidth * outHeight > MAX_SVG_PIXELS) {
    if (outWidth >= outHeight) {
      outWidth = Math.max(1, Math.floor(MAX_SVG_PIXELS / outHeight));
    } else {
      outHeight = Math.max(1, Math.floor(MAX_SVG_PIXELS / outWidth));
    }
  }

  return { width: outWidth, height: outHeight, clamped: true };
}

// --- Base64 Helpers ---
// Data is transferred as base64 strings to avoid ArrayBuffer corruption
// during chrome.runtime.sendMessage JSON serialization (Chrome < 118).

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// --- SVG Detection ---

function isSvgContent(arrayBuffer) {
  try {
    const header = new TextDecoder().decode(arrayBuffer.slice(0, 512));
    const trimmed = header.trimStart();
    return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');
  } catch {
    return false;
  }
}

// --- Image Loading via DOM Image element ---
// Used for SVGs (createImageBitmap can't decode SVG blobs) and as a
// fallback when createImageBitmap fails for other formats.

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(msg('errImageDecodeFailed', 'The source image could not be decoded.')));
    };
    img.src = url;
  });
}

// Applies the vector pixel budget to a requested raster size and, when it
// had to shrink, produces the message that tells the user why the file they
// get is smaller than the vector asked for.
function svgSizeWithBudget(width, height) {
  const fit = clampSvgRasterSize(width, height);
  if (!fit.clamped) return { width: fit.width, height: fit.height, notice: null };

  const requested = `${width}×${height}`;
  const actual = `${fit.width}×${fit.height}`;
  return {
    width: fit.width,
    height: fit.height,
    notice: msg(
      'noticeSvgScaledDown',
      `This SVG was too large to render at ${requested}, so it was saved at ${actual}.`,
      [requested, actual]
    ),
  };
}

// Rasterization size for SVG. Explicit width/height attributes win; an SVG
// with only a viewBox gets the browser's 300x150 default, so scale the
// viewBox to a 1024px longest side instead of rasterizing at that size.
//
// Whatever the source of the numbers, they leave here already clamped to
// MAX_SVG_PIXELS: this is the only place the SVG raster size is decided, and
// it runs before the canvas exists, so an oversized vector never gets a
// full-size bitmap allocated for it. Drawing at full size and scaling down
// afterwards would be no defence at all — the memory would already be spent.
function svgRasterSize(arrayBuffer, img) {
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  try {
    const text = new TextDecoder().decode(arrayBuffer);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    // Percentage sizes (width="100%") are relative, not explicit — they get
    // the browser's 300x150 default just like a missing attribute would.
    const wAttr = root.getAttribute('width') || '';
    const hAttr = root.getAttribute('height') || '';
    const hasExplicitSize = wAttr !== '' && hAttr !== '' &&
      !wAttr.includes('%') && !hAttr.includes('%');
    const vb = root.viewBox?.baseVal;
    if (!hasExplicitSize && vb && vb.width > 0 && vb.height > 0) {
      const scale = 1024 / Math.max(vb.width, vb.height);
      return svgSizeWithBudget(
        Math.max(1, Math.round(vb.width * scale)),
        Math.max(1, Math.round(vb.height * scale))
      );
    }
  } catch {
    // Fall through to the intrinsic size
  }
  if (naturalWidth && naturalHeight) {
    return svgSizeWithBudget(naturalWidth, naturalHeight);
  }
  return svgSizeWithBudget(SVG_DEFAULT_SIDE, SVG_DEFAULT_SIDE);
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'convert-image') return false;

  handleConversion(message)
    .then((result) => {
      chrome.runtime.sendMessage({
        type: 'conversion-result',
        id: message.id,
        data: result.data,
        notice: result.notice || undefined,
      }).catch(() => {});
    })
    .catch((err) => {
      chrome.runtime.sendMessage({
        type: 'conversion-result',
        id: message.id,
        error: err.message,
      }).catch(() => {});
    });
});

// Signal to background that listener is registered and ready
chrome.runtime.sendMessage({ type: 'offscreen-ready' }).catch(() => {});

async function handleConversion(message) {
  const { imageData, sourceMime, targetMime, quality } = message;

  const arrayBuffer = base64ToArrayBuffer(imageData);
  const mimeType = sourceMime || 'image/png';
  const sourceBlob = new Blob([arrayBuffer], { type: mimeType });

  const isSvg = mimeType === 'image/svg+xml' || isSvgContent(arrayBuffer);

  // Reject decode bombs from the header, before any decoder allocates memory.
  if (!isSvg && exceedsPixelBudget(probeImageSize(arrayBuffer))) {
    throw tooLargeError();
  }

  let drawSource, width, height;
  let notice = null;

  if (isSvg) {
    // SVG: createImageBitmap doesn't support SVG blobs, use Image element.
    // Loading the element only parses the vector document — Blink rasterizes
    // an SVG <img> at the size it is drawn to, not at load — so the raster
    // budget applied here, before the canvas is created, is applied before
    // any bitmap memory exists.
    const img = await loadImageElement(sourceBlob);
    ({ width, height, notice } = svgRasterSize(arrayBuffer, img));
    drawSource = img;
  } else {
    // Raster: try createImageBitmap, fall back to Image element
    try {
      const imageBitmap = await createImageBitmap(sourceBlob);
      width = imageBitmap.width;
      height = imageBitmap.height;
      drawSource = imageBitmap;
    } catch {
      const img = await loadImageElement(sourceBlob);
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      if (!width || !height) {
        throw new Error(msg('errImageDecodeFailed', 'The source image could not be decoded.'));
      }
      drawSource = img;
    }
  }

  // Second line of defence for formats whose header we cannot parse. Vectors
  // never reach it: their size left svgRasterSize already inside the (lower)
  // SVG budget.
  if (width * height > MAX_PIXELS) {
    if (drawSource.close) drawSource.close();
    throw tooLargeError();
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // For JPG: fill white background (no alpha channel support)
  if (targetMime === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Explicit destination size: identity for rasters, scales SVGs that
  // have no intrinsic size to the canvas dimensions.
  ctx.drawImage(drawSource, 0, 0, width, height);
  if (drawSource.close) drawSource.close();

  // Convert to target format
  const resultBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(msg('errEncodeFailed', `Browser cannot encode to ${targetMime}`, [targetMime])));
      },
      targetMime,
      quality
    );
  });

  // Verify format — browsers may silently fall back to PNG
  if (resultBlob.type !== targetMime) {
    const formatName = targetMime.split('/')[1].toUpperCase();
    throw new Error(msg(
      'errFormatUnsupported',
      `${formatName} encoding is not supported by your browser. Please update Chrome to the latest version.`,
      [formatName]
    ));
  }

  const resultBuffer = await resultBlob.arrayBuffer();
  return { data: arrayBufferToBase64(resultBuffer), notice };
}
