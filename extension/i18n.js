// Applies chrome.i18n messages to static extension pages (popup, welcome).
//
// MV3 forbids inline scripts, so pages opt in declaratively instead:
//   <span data-i18n="popupSubtitle">English fallback</span>
//   <input data-i18n-placeholder="searchHint">
// The English text stays in the HTML and is used verbatim whenever a key is
// missing from a locale, so a partially translated locale degrades to English
// rather than to an empty element.

(function () {
  function apply(el, key, setter) {
    if (!key) return;
    let text = '';
    try {
      text = chrome.i18n.getMessage(key) || '';
    } catch {
      return; // chrome.i18n unavailable — keep the HTML fallback
    }
    if (text) setter(el, text);
  }

  function localize() {
    for (const el of document.querySelectorAll('[data-i18n]')) {
      apply(el, el.dataset.i18n, (node, text) => { node.textContent = text; });
    }
    for (const el of document.querySelectorAll('[data-i18n-title]')) {
      apply(el, el.dataset.i18nTitle, (node, text) => { node.title = text; });
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
      apply(el, el.dataset.i18nPlaceholder, (node, text) => { node.placeholder = text; });
    }

    // Keep <html lang> honest so the browser picks the right fonts and
    // hyphenation, and screen readers use the right voice.
    //
    // localeCode comes from the same catalog that supplied the text above, so
    // it always matches what the user is actually reading. @@ui_locale does
    // not: it reports the browser UI locale, which can resolve to en_US while
    // messages resolve to ru (observed in headless Chromium with --lang=ru).
    try {
      const locale = chrome.i18n.getMessage('localeCode');
      if (locale) document.documentElement.lang = locale;
    } catch {
      // Leave the authored lang attribute alone
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', localize);
  } else {
    localize();
  }
})();
