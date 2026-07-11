# Current Session Tasks — 2026-07-11

## CWS auto-deploy: финальная настройка + релиз v1.2.0
- **Status**: COMPLETED
- Секреты CWS_* заданы пользователем (OAuth-клиент «Save Image As CWS C»)
- Extension ID найден без дашборда (обход consent-стены chromewebstore + related-ссылки):
  bbahljpklphbjnapiehkkijjofgceenm — расширение оказалось уже опубликованным (v1.1.5, рейтинг 5.0)
- Variable CWS_EXTENSION_ID задана, тег v1.2.0 запушен
- Release workflow: build ✅, Publish to Chrome Web Store ✅ — v1.2.0 загружена и отправлена
  на публикацию в CWS автоматически (первая сработка автодеплоя)
- Осталось руками: заменить скриншоты листинга в дашборде CWS (store/screenshots/, без AVIF)
