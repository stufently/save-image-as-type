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

// --- Base64 Helpers for Message Passing ---
// chrome.runtime.sendMessage uses JSON serialization on Chrome < 118,
// which destroys ArrayBuffer data. Base64 survives all serialization modes.

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Context Menu Setup ---

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

// R2 Fix #5: add lastError check in background getSettings()
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to load settings:', chrome.runtime.lastError.message);
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      resolve(result);
    });
  });
}

// R2 Fix #4: clamp quality values to valid range (10-100, matching popup)
function getQualityForFormat(formatId, settings) {
  let raw, fallback;
  switch (formatId) {
    case 'jpg': raw = settings.jpgQuality; fallback = DEFAULT_SETTINGS.jpgQuality; break;
    case 'webp': raw = settings.webpQuality; fallback = DEFAULT_SETTINGS.webpQuality; break;
    case 'avif': raw = settings.avifQuality; fallback = DEFAULT_SETTINGS.avifQuality; break;
    default: return undefined; // PNG is lossless
  }
  const val = Number(raw);
  if (!Number.isFinite(val) || val < 10 || val > 100) return fallback / 100;
  return val / 100;
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

let creatingOffscreen = null;
let activeConversions = 0; // R2 Fix #2: track active conversions to prevent idle close during work

async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existingContexts.length > 0) return;
  } catch (e) {
    // getContexts not available (Chrome < 116)
  }

  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = (async () => {
    // Set up listener for the ready signal BEFORE creating the document
    const readyPromise = new Promise((resolve) => {
      const onReady = (message) => {
        if (message.type === 'offscreen-ready') {
          chrome.runtime.onMessage.removeListener(onReady);
          resolve();
        }
      };
      chrome.runtime.onMessage.addListener(onReady);
      // Safety timeout: proceed after 2s even if ready signal is lost
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onReady);
        resolve();
      }, 2000);
    });

    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Convert images using Canvas.toBlob() and createImageBitmap which are not available in Service Workers',
      });
    } catch (e) {
      if (!e.message?.includes('already exists')) throw e;
    }

    // Wait for offscreen.js to load and register its onMessage listener
    await readyPromise;
  })().finally(() => {
    creatingOffscreen = null;
  });

  return creatingOffscreen;
}

// R2 Fix #2: only close offscreen when no active conversions
let offscreenIdleTimer = null;

function resetOffscreenIdleTimer() {
  if (offscreenIdleTimer) clearTimeout(offscreenIdleTimer);
  // Don't schedule close if conversions are still in progress
  if (activeConversions > 0) return;
  offscreenIdleTimer = setTimeout(async () => {
    offscreenIdleTimer = null;
    // Double-check no conversions started while timer was pending
    if (activeConversions > 0) return;
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
  }, 30000);
}

async function convertImage(blob, targetMime, quality) {
  await ensureOffscreenDocument();
  // Cancel idle timer while conversion is active
  if (offscreenIdleTimer) {
    clearTimeout(offscreenIdleTimer);
    offscreenIdleTimer = null;
  }
  activeConversions++;

  // R3 Fix #1: wrap arrayBuffer in try/catch so activeConversions is always decremented
  let arrayBuffer;
  try {
    arrayBuffer = await blob.arrayBuffer();
  } catch (err) {
    activeConversions--;
    resetOffscreenIdleTimer();
    throw err;
  }

  return new Promise((resolve, reject) => {
    const messageId = crypto.randomUUID();

    // R3 Fix #3: settled flag prevents double-decrement on race between timeout/listener/catch
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeout);
      activeConversions--;
      resetOffscreenIdleTimer();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Image conversion timed out'));
    }, 30000);

    const listener = (message) => {
      if (message.type !== 'conversion-result' || message.id !== messageId) return;
      cleanup();

      if (message.error) {
        reject(new Error(message.error));
        return;
      }

      if (message.data) {
        const resultBuffer = base64ToArrayBuffer(message.data);
        const resultBlob = new Blob([resultBuffer], { type: targetMime });
        resolve(resultBlob);
      } else {
        resolve(null);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({
      type: 'convert-image',
      id: messageId,
      imageData: arrayBufferToBase64(arrayBuffer),
      sourceMime: blob.type,
      targetMime: targetMime,
      quality: quality,
    }).catch((err) => {
      cleanup();
      reject(new Error('Failed to send conversion request: ' + err.message));
    });
  });
}

// --- Download ---

// Download converted blob using data URL (URL.createObjectURL is not available in service workers)
async function downloadBlob(blob, filename) {
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  const dataUrl = `data:${blob.type};base64,${base64}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true,
  });
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
      // R2 Fix #9: clean up redundant \w, use explicit _ for underscore
      name = name.replace(/[^\p{L}\p{N}_\-\.]/gu, '_').replace(/_+/g, '_');
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
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Save Image As Type',
      message: message,
    });
    return;
  }

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
