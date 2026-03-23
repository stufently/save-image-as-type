// Offscreen document for Canvas-based image conversion.
// Service workers cannot use Canvas/OffscreenCanvas.toBlob with all formats,
// so we use an offscreen document with a real DOM canvas.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'convert-image') return;

  handleConversion(message)
    .then((result) => {
      chrome.runtime.sendMessage({
        type: 'conversion-result',
        id: message.id,
        data: result,
      });
    })
    .catch((err) => {
      chrome.runtime.sendMessage({
        type: 'conversion-result',
        id: message.id,
        error: err.message,
      });
    });
});

async function handleConversion(message) {
  const { imageData, sourceMime, targetMime, quality } = message;

  // Create image from blob
  const blob = new Blob([imageData], { type: sourceMime || 'image/png' });
  const imageBitmap = await createImageBitmap(blob);

  const canvas = document.getElementById('canvas');
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

  // Verify we got the expected format (browsers may silently fall back to PNG)
  if (targetMime === 'image/avif' && resultBlob.type !== 'image/avif') {
    throw new Error('AVIF encoding is not supported by your browser. Please update Chrome to the latest version.');
  }

  // Return as ArrayBuffer for message passing
  return await resultBlob.arrayBuffer();
}
