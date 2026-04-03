// Offscreen document for Canvas-based image conversion.
// Service workers cannot use Canvas/OffscreenCanvas.toBlob with all formats,
// so we use an offscreen document with a real DOM canvas.

// Fix #7: maximum pixel count to prevent memory exhaustion
const MAX_PIXELS = 100_000_000; // 100 megapixels

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'convert-image') return false;

  handleConversion(message)
    .then((result) => {
      // Fix #10: catch sendMessage errors if service worker restarted
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

  const blob = new Blob([imageData], { type: sourceMime || 'image/png' });
  const imageBitmap = await createImageBitmap(blob);

  // Fix #7: reject images that are too large
  if (imageBitmap.width * imageBitmap.height > MAX_PIXELS) {
    imageBitmap.close();
    throw new Error('Image is too large to convert (maximum 100 megapixels).');
  }

  // Fix #14: create canvas dynamically instead of sharing a static one
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  // For JPG: fill white background (no alpha channel support)
  if (targetMime === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

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

  // Fix #9: verify format for all types, not just AVIF — browsers may silently fall back to PNG
  if (resultBlob.type !== targetMime) {
    const formatName = targetMime.split('/')[1].toUpperCase();
    throw new Error(`${formatName} encoding is not supported by your browser. Please update Chrome to the latest version.`);
  }

  return await resultBlob.arrayBuffer();
}
