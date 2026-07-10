# TODO

## Code review 2026-07-10 (self + Codex + agy)

### High priority
- [ ] AVIF: `canvas.toBlob('image/avif')` не поддерживается Chrome — "Save as AVIF" всегда падает с ошибкой (offscreen.js:144-159). Убрать формат из меню (feature-detect при старте) или подключить WASM-энкодер; текст ошибки "update Chrome" вводит в заблуждение
- [ ] Память: тройная base64-перекодировка (SW→offscreen→SW→data URL). Минимум: строить data URL напрямую из `message.data` (background.js:337, 364-374); лучше — возвращать из offscreen готовый `URL.createObjectURL` и скачивать по blob: ссылке
- [ ] README: таблица permissions описывает `activeTab`, которого нет в manifest (удалён в 1.1.1) — рассинхрон с CWS justification

### Medium priority
- [ ] `credentials: 'omit'` в fetchImage (background.js:162) — картинки за авторизацией не сохраняются; добавить fallback-фетч в контексте вкладки или 'include'
- [ ] Race: idle-таймер может закрыть offscreen между ensureOffscreenDocument() и sendMessage → редкий "Failed to send conversion request"; нужен closing-mutex
- [ ] 100MP-лимит проверяется после декода (offscreen.js:122) — decode bomb уже съел память; проверять размеры до полного декода где возможно
- [ ] SVG без width/height рендерится 800x600 с искажением пропорций (offscreen.js:101) — парсить viewBox
- [ ] buildFilename пропускает ведущие точки (`..hidden`) → downloads.download может отклонить имя
- [ ] Закоммитить Playwright-тесты из сессии 2026-04-09 и гонять их в CI

### CI/CD (по образцу typio-chrome-form-recovery-ng)
- [ ] Автопубликация в Chrome Web Store: job publish-chrome с mnao305/chrome-extension-upload@v6.0.0 (vars.CWS_EXTENSION_ID + secrets CWS_CLIENT_ID/SECRET/REFRESH_TOKEN)
- [ ] workflow_dispatch с input tag для ручного перезапуска релиза
- [ ] Версия из манифеста через `jq -r .version` вместо grep/sed; `set -euo pipefail`
- [ ] Opera-шаг: проверять что sed реально заменил строку (иначе имя >50 символов уедет молча)
- [ ] ubuntu-24.04 вместо ubuntu-latest; опционально пин actions по SHA

### Low priority
- [ ] Локализовать popup (строки захардкожены по-английски при 7 языках в _locales)
- [ ] Настройка saveAs (диалог/тихое сохранение)
- [ ] Убрать fallback alert-инъекцию в notifyError (notifications всегда доступны — мёртвый код)

## Before Chrome Web Store Publication

- [x] 5 screenshots 1280x800 (store/screenshots/mockup1-5.png)
- [ ] Small promo tile 440x280 (icon + formats + "Save images in one click")
- [ ] Marquee promo image 1400x560
- [ ] Privacy policy page (hosted URL for CWS listing)
- [ ] Landing page with SEO for long-tail queries (save webp as jpg chrome, etc.)
- [ ] Set homepage URL, support URL, privacy policy URL in CWS dashboard
- [ ] Choose category: Photos or Productivity
- [x] Onboarding welcome page (opens on first install)
- [x] Localization: es, pt-BR, de, fr, ja, ru

## After Publication

- [ ] Get 20-50 organic installs from warm traffic (GitHub, Twitter, dev communities)
- [ ] Respond to all reviews within 24-48 hours
- [ ] Post on Reddit: r/chrome, r/webdev, r/GraphicDesign (useful post, not ads)
- [ ] Product Hunt launch with demo GIF
- [ ] YouTube Shorts — 15 sec demo: right-click → choose format
- [ ] 2-3 updates in the first month (real fixes/improvements)
- [ ] Cross-publish to Edge Add-ons and Opera Addons (free extra traffic)
- [ ] SEO-optimize name and description separately in Edge/Opera dashboards (ZIP is the same, but store metadata can differ)
- [ ] Maintain update cadence: min 1x/month (avoid 6+ month gaps — CWS penalizes)
