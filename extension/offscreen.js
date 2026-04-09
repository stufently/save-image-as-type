// Offscreen document for Canvas-based image conversion.
// Service workers cannot use Canvas/OffscreenCanvas.toBlob with all formats,
// so we use an offscreen document with a real DOM canvas.

const MAX_PIXELS = 100_000_000; // 100 megapixels

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
      reject(new Error('The source image could not be decoded.'));
    };
    img.src = url;
  });
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'convert-image') return false;

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

async function handleConversion(message) {
  const { imageData, sourceMime, targetMime, quality } = message;

  const arrayBuffer = base64ToArrayBuffer(imageData);
  const mimeType = sourceMime || 'image/png';
  const sourceBlob = new Blob([arrayBuffer], { type: mimeType });

  const isSvg = mimeType === 'image/svg+xml' || isSvgContent(arrayBuffer);

  let drawSource, width, height;

  if (isSvg) {
    // SVG: createImageBitmap doesn't support SVG blobs, use Image element
    const img = await loadImageElement(sourceBlob);
    width = img.naturalWidth || img.width || 800;
    height = img.naturalHeight || img.height || 600;
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
        throw new Error('The source image could not be decoded.');
      }
      drawSource = img;
    }
  }

  if (width * height > MAX_PIXELS) {
    if (drawSource.close) drawSource.close();
    throw new Error('Image is too large to convert (maximum 100 megapixels).');
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

  ctx.drawImage(drawSource, 0, 0);
  if (drawSource.close) drawSource.close();

  // Convert to target format
  const resultBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`Browser cannot encode to ${targetMime}`));
      },
      targetMime,
      quality
    );
  });

  // Verify format — browsers may silently fall back to PNG
  if (resultBlob.type !== targetMime) {
    const formatName = targetMime.split('/')[1].toUpperCase();
    throw new Error(`${formatName} encoding is not supported by your browser. Please update Chrome to the latest version.`);
  }

  const resultBuffer = await resultBlob.arrayBuffer();
  return arrayBufferToBase64(resultBuffer);
}
