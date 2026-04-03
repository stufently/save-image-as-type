# Current Session Tasks — 2026-04-03

## Fix offscreen.createDocument invalid reason
- **Status**: COMPLETED
- **Details**: Chrome Web Store rejected extension because `reasons: ['CANVAS']` is not a valid value for `offscreen.createDocument`. Changed to `reasons: ['BLOBS']` — confirmed by Codex, Gemini, and Cursor as the correct semantic choice.
