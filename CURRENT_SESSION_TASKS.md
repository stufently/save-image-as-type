# Current Session Tasks — 2026-07-10

## Full code review (self + Codex + agy)
- **Status**: COMPLETED
- **Result**: находки в TASKS.md (секция "Code review 2026-07-10")

## Implement review fixes + CWS auto-deploy (v1.2.0)
- **Status**: COMPLETED
- **Done**: AVIF убран везде (код, попап, локали, имя, welcome, README, PRIVACY, store-описание,
  скриншоты перегенерированы); data URL без re-encode; credentials+content-type fallback в fetchImage;
  closing-mutex для offscreen; ведущие точки в имени файла; SVG viewBox (включая width="100%");
  null-guards в onMessage; notifyError упрощён; CI: смоук-тест (Playwright) на каждый push,
  release с workflow_dispatch + автопубликация в CWS (mnao305/chrome-extension-upload, gated
  на vars.CWS_EXTENSION_ID); jq вместо grep/sed; единый ZIP для всех сторов; manifest 1.2.0
- **Verification**: смоук-тест в Docker PASS (PNG/JPG/WebP, SVG 3 варианта, filename-кейсы)
- **Reviews**: Codex (3 замечания — все исправлены), agy (2 замечания — все исправлены)
- **Осталось пользователю**: задать vars.CWS_EXTENSION_ID + secrets CWS_CLIENT_ID/SECRET/REFRESH_TOKEN
  в GitHub repo settings, затем `git tag v1.2.0 && git push --tags`
