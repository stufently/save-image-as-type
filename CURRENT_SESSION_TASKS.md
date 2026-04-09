# Current Session Tasks — 2026-04-09

## Fix CWS rejection — "source image could not be decoded"
- **Status**: COMPLETED
- **Issue**: CWS rejected extension — images fail to download with "The source image could not be decoded"
- **Root cause**: ArrayBuffer data lost during chrome.runtime.sendMessage (JSON serialization on Chrome < 118), plus no SVG support
- **Fix**: Base64 encoding for message passing, SVG support, Image element fallback
