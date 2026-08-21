// Offscreen document for Canvas-based image conversion.
// Service workers cannot use Canvas/OffscreenCanvas.toBlob with all formats,
// so we use an offscreen document with a real DOM canvas.

const MAX_PIXELS = 100_000_000; // 100 megapixels

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

// Rasterization size for SVG. Explicit width/height attributes win; an SVG
// with only a viewBox gets the browser's 300x150 default, so scale the
// viewBox to a 1024px longest side instead of rasterizing at that size.
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
      return {
        width: Math.max(1, Math.round(vb.width * scale)),
        height: Math.max(1, Math.round(vb.height * scale)),
      };
    }
  } catch {
    // Fall through to the intrinsic size
  }
  if (naturalWidth && naturalHeight) {
    return { width: naturalWidth, height: naturalHeight };
  }
  return { width: 1024, height: 1024 };
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'convert-image') return false;

  handleConversion(message)
    .then((result) => {
      chrome.runtime.sendMessage({
        type: 'conversion-result',
        id: message.id,
        data: result,
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

  if (isSvg) {
    // SVG: createImageBitmap doesn't support SVG blobs, use Image element
    const img = await loadImageElement(sourceBlob);
    ({ width, height } = svgRasterSize(arrayBuffer, img));
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

  // Second line of defence: formats whose header we cannot parse, and SVGs
  // whose intrinsic size only becomes known once the document is laid out.
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
  return arrayBufferToBase64(resultBuffer);
}
