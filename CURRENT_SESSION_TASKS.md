# Current Session Tasks — 2026-07-10

## Full code review (self + Codex + agy)
- **Status**: COMPLETED
- **Scope**: extension/background.js, offscreen.js, popup/*, manifest.json, .github/workflows/*
- **Result**: находки задокументированы в TASKS.md (секция "Code review 2026-07-10").
  Ключевое: AVIF-кодирование canvas.toBlob не поддерживается Chrome (фича всегда падает),
  тройная base64-перекодировка (память), credentials:'omit' ломает приватные картинки,
  README описывает activeTab которого нет в manifest, нет автопубликации в CWS (есть в typio).
