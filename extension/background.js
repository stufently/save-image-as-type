// Save Image As Type — Background Service Worker
// Handles context menus, image fetching, conversion via OffscreenDocument, and downloads.

const FORMATS = [
  { id: 'png', title: 'Save as PNG', mime: 'image/png', ext: 'png' },
  { id: 'jpg', title: 'Save as JPG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', title: 'Save as WebP', mime: 'image/webp', ext: 'webp' },
  { id: 'avif', title: 'Save as AVIF', mime: 'image/avif', ext: 'avif' },
];

const DEFAULT_SETTINGS = {
  defaultFormat: 'png',
  jpgQuality: 92,
  webpQuality: 90,
  avifQuality: 80,
};

// --- Context Menu Setup ---

chrome.runtime.onInstalled.addListener((details) => {
  // Show welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }

  // Parent menu
  chrome.contextMenus.create({
    id: 'save-image-parent',
    title: 'Save Image As',
    contexts: ['image'],
  });

  // Format submenus
  for (const fmt of FORMATS) {
    chrome.contextMenus.create({
      id: `save-as-${fmt.id}`,
      parentId: 'save-image-parent',
      title: fmt.title,
      contexts: ['image'],
    });
  }

  // Separator + "Save as default" option
  chrome.contextMenus.create({
    id: 'save-as-separator',
    parentId: 'save-image-parent',
    type: 'separator',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'save-as-default',
    parentId: 'save-image-parent',
    title: 'Save as default format',
    contexts: ['image'],
  });
});

// --- Context Menu Click Handler ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  let formatId;

  if (menuId === 'save-as-default') {
    const settings = await getSettings();
    formatId = settings.defaultFormat;
  } else if (menuId.startsWith('save-as-')) {
    formatId = menuId.replace('save-as-', '');
  } else {
    return;
  }

  const format = FORMATS.find(f => f.id === formatId);
  if (!format) return;

  const srcUrl = info.srcUrl;
  if (!srcUrl) return;

  try {
    const settings = await getSettings();
    const quality = getQualityForFormat(formatId, settings);
    const imageBlob = await fetchImage(srcUrl, tab?.id);
    const convertedBlob = await convertImage(imageBlob, format.mime, quality);

    if (!convertedBlob) {
      notifyError(tab?.id, `Conversion to ${format.ext.toUpperCase()} failed. Your browser may not support this format.`);
      return;
    }

    const filename = buildFilename(srcUrl, format.ext);
    await downloadBlob(convertedBlob, filename);
  } catch (err) {
    console.error('Save Image As Type error:', err);
    notifyError(tab?.id, `Failed to save image: ${err.message}`);
  }
});

// --- Settings ---

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result);
    });
  });
}

function getQualityForFormat(formatId, settings) {
  switch (formatId) {
    case 'jpg': return settings.jpgQuality / 100;
    case 'webp': return settings.webpQuality / 100;
    case 'avif': return settings.avifQuality / 100;
    default: return undefined; // PNG is lossless
  }
}

// --- Image Fetching ---

async function fetchImage(url, tabId) {
  // Handle data: URLs directly
  if (url.startsWith('data:')) {
    const response = await fetch(url);
    return await response.blob();
  }

  // Handle blob: URLs — need to read from the page context via content script
  if (url.startsWith('blob:')) {
    return await fetchBlobFromTab(url, tabId);
  }

  // Try fetching with extension permissions (service worker fetch bypasses CORS
  // when host_permissions include the target origin)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (response.ok) {
      return await response.blob();
    }
  } catch (e) {
    // Fall through to next method
  }

  // Retry without CORS restriction
  try {
    const response = await fetch(url, {
      mode: 'no-cors',
    });
    // no-cors gives opaque response, blob may be empty
    const blob = await response.blob();
    if (blob.size > 0) {
      return blob;
    }
  } catch (e) {
    // Fall through
  }

  throw new Error('Could not download the image. The server may be blocking access.');
}

// Fetch blob: URLs by injecting a content script that reads the blob
async function fetchBlobFromTab(blobUrl, tabId) {
  if (!tabId) {
    throw new Error('Cannot access blob: images without an active tab.');
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async (url) => {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          throw new Error('Cannot read blob URL: ' + e.message);
        }
      },
      args: [blobUrl],
    });

    if (results && results[0] && results[0].result) {
      const dataUrl = results[0].result;
      const response = await fetch(dataUrl);
      return await response.blob();
    }
  } catch (e) {
    // Fall through
  }

  throw new Error('Could not access this blob: image. Try saving it normally first.');
}

// --- Image Conversion using OffscreenDocument ---

let offscreenDocumentCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  // Check if already exists (requires Chrome 116+)
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) {
      offscreenDocumentCreated = true;
      return;
    }
  } catch (e) {
    // getContexts not available, try creating and handle duplicate error
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CANVAS'],
      justification: 'Convert image format using Canvas API',
    });
    offscreenDocumentCreated = true;
  } catch (e) {
    // Document may already exist
    if (e.message?.includes('already exists')) {
      offscreenDocumentCreated = true;
    } else {
      throw e;
    }
  }
}

async function convertImage(blob, targetMime, quality) {
  await ensureOffscreenDocument();

  // Convert blob to array buffer for transfer
  const arrayBuffer = await blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const messageId = Date.now() + Math.random();

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Image conversion timed out'));
    }, 30000);

    const listener = (message) => {
      if (message.type !== 'conversion-result' || message.id !== messageId) return;
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeout);

      if (message.error) {
        reject(new Error(message.error));
        return;
      }

      if (message.data) {
        const resultBlob = new Blob([message.data], { type: targetMime });
        resolve(resultBlob);
      } else {
        resolve(null);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({
      type: 'convert-image',
      id: messageId,
      imageData: arrayBuffer,
      sourceMime: blob.type,
      targetMime: targetMime,
      quality: quality,
    });
  });
}

// --- Download ---

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true,
    });
  } finally {
    // Clean up after a delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// --- Filename Helpers ---

function buildFilename(srcUrl, ext) {
  let name = 'image';

  try {
    // For data: and blob: URLs, use generic name
    if (srcUrl.startsWith('data:') || srcUrl.startsWith('blob:')) {
      return `image.${ext}`;
    }

    const url = new URL(srcUrl);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);

    if (parts.length > 0) {
      const lastPart = decodeURIComponent(parts[parts.length - 1]);
      // Remove existing extension
      const dotIndex = lastPart.lastIndexOf('.');
      name = dotIndex > 0 ? lastPart.substring(0, dotIndex) : lastPart;
      // Clean the name — allow unicode letters too
      name = name.replace(/[^\w\-\.]/g, '_').replace(/_+/g, '_');
      // Limit length
      if (name.length > 100) name = name.substring(0, 100);
      if (!name) name = 'image';
    }
  } catch (e) {
    // Use default name
  }

  return `${name}.${ext}`;
}

// --- Error Notification ---

function notifyError(tabId, message) {
  if (!tabId) {
    console.warn('Save Image As Type error (no tab):', message);
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      alert(`Save Image As Type: ${msg}`);
    },
    args: [message],
  }).catch(() => {
    console.warn('Could not show error notification to user:', message);
  });
}
