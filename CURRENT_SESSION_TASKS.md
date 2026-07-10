# Current Session Tasks — 2026-07-10

## Full code review (self + Codex + agy)
- **Status**: COMPLETED

## Implement review fixes + CWS auto-deploy (v1.2.0)
- **Status**: COMPLETED (коммит fbe7b73, CI зелёный)

## Store dashboards: скриншоты + страница CWS API ключей
- **Status**: COMPLETED (в пределах технически возможного)
- Открыты вкладки: docs по CWS API, Google Cloud Console → Credentials, CWS Developer Dashboard
- Выяснено: OAuth-клиент «Typio CWS CI» (проект graphic-ripsaw-271510) уже существует —
  те же 3 значения секретов подходят и для этого репо, новые ключи создавать НЕ нужно
- Расширение ещё НЕ опубликовано ни в одном сторе (проверено поиском) — «обновить скриншоты»
  = использовать новые PNG (уже без AVIF) при первой публикации
- CWS дашборд не автоматизируется: Chrome блокирует расширениям домен webstore
  («The extensions gallery cannot be scripted») — загрузка в дашборд только руками
