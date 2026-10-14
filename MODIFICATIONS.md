
### Bridge recovery and diagnostics

Connection attempts write private, append-only `.bridge.jsonl` files under
`PLAYWRIGHT_MCP_BRIDGE_LOG_DIR` or `~/.cache/ms-playwright/bridge`. Each random
attempt ID records only timestamps, elapsed milliseconds, process ID and fixed
phase names; URLs, credentials, page contents and exception strings are excluded.
CLI startup stderr also uses a unique private file per launch, preserving earlier
failures instead of truncating the session's previous `.err` file. Raw stderr is
separate from the sanitized phase records.

An automated connection page carries its attempt ID and deadline. An unsuccessful
page can retire only itself, and only while it remains at its original URL. The
profile's background worker retires superseded pages only when extension ID,
attempt ID and relay endpoint all match; attached pages and navigated tabs are
excluded. Recovery never calls `chrome.runtime.reload()`: one stalled request
must not disconnect unrelated clients. A persistently unresponsive worker still
fails explicitly and requires operator intervention.

Tests: `bun test tests/rechrome/bridge-{attempt,recovery}.test.ts`, plus the
concurrent-client and expired-page scenarios in `tests/extension/concurrent-clients.spec.ts`.
