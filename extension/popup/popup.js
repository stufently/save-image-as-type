// Popup script: settings management

const DEFAULT_SETTINGS = {
  defaultFormat: 'png',
  jpgQuality: 92,
  webpQuality: 90,
  avifQuality: 80,
};

const VALID_FORMATS = ['png', 'jpg', 'webp', 'avif'];
const QUALITY_KEYS = ['jpgQuality', 'webpQuality', 'avifQuality'];

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  elements.defaultFormat = document.getElementById('defaultFormat');
  elements.jpgQuality = document.getElementById('jpgQuality');
  elements.jpgQualityValue = document.getElementById('jpgQualityValue');
  elements.webpQuality = document.getElementById('webpQuality');
  elements.webpQualityValue = document.getElementById('webpQualityValue');
  elements.avifQuality = document.getElementById('avifQuality');
  elements.avifQualityValue = document.getElementById('avifQualityValue');
  elements.status = document.getElementById('status');

  loadSettings();
  bindEvents();
});

// R2 Fix #4: clamp quality values on load; use defaults on lastError
function clampQuality(val, fallback) {
  const n = Number(val);
  return (Number.isFinite(n) && n >= 10 && n <= 100) ? n : fallback;
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (chrome.runtime.lastError) {
      console.warn('Failed to load settings:', chrome.runtime.lastError.message);
      settings = { ...DEFAULT_SETTINGS };
    }
    if (!VALID_FORMATS.includes(settings.defaultFormat)) {
      settings.defaultFormat = DEFAULT_SETTINGS.defaultFormat;
    }
    for (const key of QUALITY_KEYS) {
      settings[key] = clampQuality(settings[key], DEFAULT_SETTINGS[key]);
    }
    elements.defaultFormat.value = settings.defaultFormat;
    for (const key of QUALITY_KEYS) {
      elements[key].value = settings[key];
      elements[`${key}Value`].textContent = settings[key];
    }
  });
}

function bindEvents() {
  elements.defaultFormat.addEventListener('change', saveSettings);

  for (const key of QUALITY_KEYS) {
    elements[key].addEventListener('input', () => {
      elements[`${key}Value`].textContent = elements[key].value;
    });
    elements[key].addEventListener('change', saveSettings);
  }
}

function saveSettings() {
  const settings = {
    defaultFormat: elements.defaultFormat.value,
    jpgQuality: parseInt(elements.jpgQuality.value, 10) || DEFAULT_SETTINGS.jpgQuality,
    webpQuality: parseInt(elements.webpQuality.value, 10) || DEFAULT_SETTINGS.webpQuality,
    avifQuality: parseInt(elements.avifQuality.value, 10) || DEFAULT_SETTINGS.avifQuality,
  };

  if (!VALID_FORMATS.includes(settings.defaultFormat)) {
    settings.defaultFormat = DEFAULT_SETTINGS.defaultFormat;
  }
  for (const key of QUALITY_KEYS) {
    settings[key] = clampQuality(settings[key], DEFAULT_SETTINGS[key]);
  }

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      console.warn('Failed to save settings:', chrome.runtime.lastError.message);
      return;
    }
    showStatus('Settings saved');
  });
}

function showStatus(message) {
  elements.status.textContent = message;
  elements.status.classList.remove('hidden');
  elements.status.classList.add('success');

  setTimeout(() => {
    elements.status.classList.add('hidden');
    elements.status.classList.remove('success');
  }, 1500);
}
