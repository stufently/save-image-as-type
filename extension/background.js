// Save Image As Type — Background Service Worker
// Handles context menus, image fetching, conversion via OffscreenDocument, and downloads.

const FORMATS = [
  { id: 'png', title: chrome.i18n.getMessage('menuSaveAsPng') || 'Save as PNG', mime: 'image/png', ext: 'png' },
  { id: 'jpg', title: chrome.i18n.getMessage('menuSaveAsJpg') || 'Save as JPG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', title: chrome.i18n.getMessage('menuSaveAsWebp') || 'Save as WebP', mime: 'image/webp', ext: 'webp' },
  { id: 'avif', title: chrome.i18n.getMessage('menuSaveAsAvif') || 'Save as AVIF', mime: 'image/avif', ext: 'avif' },
];

const DEFAULT_SETTINGS = {
  defaultFormat: 'png',
  jpgQuality: 92,
  webpQuality: 90,
  avifQuality: 80,
};

// --- Context Menu Setup ---

// Fix #5: removeAll before creating to avoid stale menus on update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }

  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: 'save-image-parent',
    title: chrome.i18n.getMessage('menuSaveImageAs') || 'Save Image As',
    contexts: ['image'],
  });

  for (const fmt of FORMATS) {
    chrome.contextMenus.create({
      id: `save-as-${fmt.id}`,
      parentId: 'save-image-parent',
      title: fmt.title,
      contexts: ['image'],
    });
  }

  chrome.contextMenus.create({
    id: 'save-as-separator',
    parentId: 'save-image-parent',
    type: 'separator',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'save-as-default',
    parentId: 'save-image-parent',
    title: chrome.i18n.getMessage('menuSaveAsDefault') || 'Save as default format',
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
    notifyError(tab?.id, `Failed to save image: ${err.message || 'Unknown error'}`);
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
  if (url.startsWith('data:')) {
    const response = await fetch(url);
    return await response.blob();
  }

  if (url.startsWith('blob:')) {
    return await fetchBlobFromTab(url, tabId);
  }

  // Fix #3: removed dead no-cors fallback — with <all_urls> host_permissions,
  // the cors fetch should work. Opaque responses from no-cors always have size 0.
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching image`);
  }

  return await response.blob();
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

// Fix #1 & #2: removed stale boolean flag, added promise lock for concurrent calls
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  // Always check actual state instead of relying on a boolean flag
  // Fix #1: Chrome may close offscreen docs under memory pressure
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existingContexts.length > 0) return;
  } catch (e) {
    // getContexts not available (Chrome < 116)
  }

  // Fix #2: prevent race condition with concurrent createDocument calls
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Convert images using Canvas.toBlob() and createImageBitmap which are not available in Service Workers',
  }).catch((e) => {
    if (!e.message?.includes('already exists')) throw e;
  }).finally(() => {
    creatingOffscreen = null;
  });

  return creatingOffscreen;
}

// Fix #8: close offscreen document after idle period to free memory
let offscreenIdleTimer = null;

function resetOffscreenIdleTimer() {
  if (offscreenIdleTimer) clearTimeout(offscreenIdleTimer);
  offscreenIdleTimer = setTimeout(async () => {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (contexts.length > 0) {
        await chrome.offscreen.closeDocument();
      }
    } catch (e) {
      // Already closed or not available
    }
    offscreenIdleTimer = null;
  }, 30000); // Close after 30s idle
}

async function convertImage(blob, targetMime, quality) {
  await ensureOffscreenDocument();

  const arrayBuffer = await blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    // Fix #4: use crypto.randomUUID() instead of Date.now() + Math.random()
    const messageId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Image conversion timed out'));
    }, 30000);

    const listener = (message) => {
      if (message.type !== 'conversion-result' || message.id !== messageId) return;
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeout);
      resetOffscreenIdleTimer();

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
    }).catch((err) => {
      // Fix: clean up listener and timeout if sendMessage fails
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeout);
      reject(new Error('Failed to send conversion request: ' + err.message));
    });
  });
}

// --- Download ---

// Fix #11: use downloads.onChanged to revoke URL instead of blind 60s timeout
async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  const downloadId = await chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true,
  });

  const onChanged = (delta) => {
    if (delta.id !== downloadId) return;
    // Revoke when download completes, is interrupted, or cancelled
    if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
      chrome.downloads.onChanged.removeListener(onChanged);
      URL.revokeObjectURL(url);
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);

  // Safety fallback: revoke after 5 minutes max
  setTimeout(() => {
    chrome.downloads.onChanged.removeListener(onChanged);
    URL.revokeObjectURL(url);
  }, 300000);
}

// --- Filename Helpers ---

function buildFilename(srcUrl, ext) {
  let name = 'image';

  try {
    if (srcUrl.startsWith('data:') || srcUrl.startsWith('blob:')) {
      return `image.${ext}`;
    }

    const url = new URL(srcUrl);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);

    if (parts.length > 0) {
      const lastPart = decodeURIComponent(parts[parts.length - 1]);
      const dotIndex = lastPart.lastIndexOf('.');
      name = dotIndex > 0 ? lastPart.substring(0, dotIndex) : lastPart;
      // Fix #6: Unicode-aware regex to preserve non-ASCII characters in filenames
      name = name.replace(/[^\p{L}\p{N}\w\-\.]/gu, '_').replace(/_+/g, '_');
      if (name.length > 100) name = name.substring(0, 100);
      if (!name) name = 'image';
    }
  } catch (e) {
    // Use default name
  }

  return `${name}.${ext}`;
}

// --- Error Notification ---

// Fix #13: use chrome.notifications instead of alert() for less intrusive UX
function notifyError(tabId, message) {
  // Try notifications API first (less intrusive)
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Save Image As Type',
      message: message,
    });
    return;
  }

  // Fallback to alert via content script
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
