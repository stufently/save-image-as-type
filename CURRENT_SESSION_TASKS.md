# Current Session Tasks — 2026-04-09

## Fix CWS rejection — "source image could not be decoded"
- **Status**: COMPLETED
- **Issue**: CWS rejected extension — images fail to download with "The source image could not be decoded"
- **Root cause**: ArrayBuffer data lost during chrome.runtime.sendMessage (JSON serialization on Chrome < 118), plus no SVG support
- **Fix**: Base64 encoding for message passing, SVG support, Image element fallback

## Add auto-build on push to master
- **Status**: COMPLETED
- **Issue**: Release workflow only triggers on tag pushes, no CI on regular pushes
- **Fix**: Added build.yml workflow + pushed v1.1.3 tag
