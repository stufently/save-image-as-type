// Popup script: settings management

const DEFAULT_SETTINGS = {
  defaultFormat: 'png',
  jpgQuality: 92,
  webpQuality: 90,
  avifQuality: 80,
};

const VALID_FORMATS = ['png', 'jpg', 'webp', 'avif'];

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

// Fix #15: check chrome.runtime.lastError in storage callbacks
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (chrome.runtime.lastError) {
      console.warn('Failed to load settings:', chrome.runtime.lastError.message);
      return;
    }
    // Validate format
    if (!VALID_FORMATS.includes(settings.defaultFormat)) {
      settings.defaultFormat = 'png';
    }
    elements.defaultFormat.value = settings.defaultFormat;
    elements.jpgQuality.value = settings.jpgQuality;
    elements.jpgQualityValue.textContent = settings.jpgQuality;
    elements.webpQuality.value = settings.webpQuality;
    elements.webpQualityValue.textContent = settings.webpQuality;
    elements.avifQuality.value = settings.avifQuality;
    elements.avifQualityValue.textContent = settings.avifQuality;
  });
}

function bindEvents() {
  elements.defaultFormat.addEventListener('change', saveSettings);

  for (const key of ['jpgQuality', 'webpQuality', 'avifQuality']) {
    elements[key].addEventListener('input', () => {
      elements[`${key}Value`].textContent = elements[key].value;
    });
    elements[key].addEventListener('change', saveSettings);
  }
}

function saveSettings() {
  const settings = {
    defaultFormat: elements.defaultFormat.value,
    jpgQuality: parseInt(elements.jpgQuality.value, 10),
    webpQuality: parseInt(elements.webpQuality.value, 10),
    avifQuality: parseInt(elements.avifQuality.value, 10),
  };

  // Validate format
  if (!VALID_FORMATS.includes(settings.defaultFormat)) {
    settings.defaultFormat = 'png';
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
    // Fix #14b: clean up success class to avoid stale state
    elements.status.classList.remove('success');
  }, 1500);
}
