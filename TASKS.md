# TODO

## Code review 2026-07-10 (self + Codex + agy)

### High priority
- [x] AVIF убран полностью (v1.2.0): меню, попап, локали, имя расширения, welcome, README, store description — canvas.toBlob('image/avif') не поддерживается Chrome
- [x] Память: data URL строится напрямую из base64 `message.data`, убраны decode+re-encode и downloadBlob (v1.2.0)
- [x] README: таблица permissions синхронизирована с manifest (activeTab убран, notifications добавлен)

### Medium priority
- [x] fetchImage: fallback-повтор с `credentials: 'include'` при неуспешном первом запросе (v1.2.0)
- [x] Race: closing-mutex (`closingOffscreen`) + activeConversions++ до ensureOffscreenDocument (v1.2.0)
- [ ] 100MP-лимит проверяется после декода (offscreen.js) — decode bomb уже съел память; проверять размеры до полного декода где возможно
- [x] SVG: размер из viewBox (длинная сторона 1024) при отсутствии явных width/height, явный масштаб в drawImage (v1.2.0)
- [x] buildFilename: ведущие точки срезаются (v1.2.0)
- [x] Смоук-тест tests/smoke-test.js (Playwright + Chromium new headless) + job test в build.yml (v1.2.0)

### CI/CD (по образцу typio-chrome-form-recovery-ng)
- [x] Автопубликация в Chrome Web Store: job publish-chrome с mnao305/chrome-extension-upload@v6.0.0 — требует настроить vars.CWS_EXTENSION_ID + secrets CWS_CLIENT_ID/SECRET/REFRESH_TOKEN в репо
- [x] workflow_dispatch с input tag для ручного перезапуска релиза
- [x] Версия через `jq -r .version`; `set -euo pipefail`
- [x] Opera-шаг удалён: после укорачивания имени (≤45) один ZIP подходит всем сторам (sed давно молча не срабатывал — имя в манифесте изменилось ещё в 1.1.1)
- [x] ubuntu-24.04 вместо ubuntu-latest
- [ ] Опционально: пин actions по SHA

### Low priority
- [ ] Локализовать popup (строки захардкожены по-английски при 7 языках в _locales)
- [ ] Настройка saveAs (диалог/тихое сохранение)
- [x] Убран fallback alert-инъекция в notifyError (v1.2.0)
- [ ] Blob URL из offscreen вместо data URL для скачивания (ещё меньше памяти; требует аккуратного lifecycle)

### После v1.2.0
- [x] Секреты CWS_* + variable CWS_EXTENSION_ID (bbahljpklphbjnapiehkkijjofgceenm) заданы (2026-07-11)
- [x] Тег v1.2.0 → Release + автопубликация в CWS: оба job'а success — автодеплой работает (2026-07-11)
- [ ] Заменить скриншоты листинга в дашборде CWS руками (store/screenshots перегенерированы без AVIF; дашборд не автоматизируется)
- [ ] Edge/Opera: расширение там не опубликовано — при желании первая публикация руками из того же ZIP

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
