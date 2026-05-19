# Auto-connect to the local bridge

Goal: remove the manual "Connect" step. The web UI should automatically reach the local bridge at `http://localhost:7777` using the default token `123456789` as soon as the panel loads, and silently retry if it's offline.

## Changes

**1. `src/routes/index.tsx` — Panel component**
- On mount, if no saved bridge config exists, immediately seed one with:
  - `url: "http://localhost:7777"`
  - `token: "123456789"`
  and save it via `saveBridge()`.
- Start a background health-check loop: call `callBridge(cfg, "ping")` every 3s.
  - On success → `bridgeStatus = "ok"` (badge shows Online).
  - On failure → `bridgeStatus = "fail"` and keep retrying silently.
- Stop polling when the tab is hidden; resume on focus.

**2. `Header` component**
- Hide the big "Connect bridge" setup panel by default. It only opens if the user clicks the "Bridge" button (for advanced cases: custom URL, different token, re-download zip).
- When status is `fail`, show a small inline hint next to the badge: "Bridge offline — run `node bridge.mjs`" with a one-click "Show setup" link that opens the panel.
- Remove the always-visible Connect/Disconnect buttons from the top bar — replace with a single subtle "Bridge ⚙" gear that opens advanced setup only when needed.

**3. Bridge agent (`bridge-agent/bridge.mjs`)**
- No code changes required — it already listens on `7777` with token `123456789` and has CORS enabled.
- Update the printed startup banner to remind the user: "Web panel will auto-connect — keep this terminal open."

## Result

User flow becomes:
1. Run `node bridge.mjs` once in a terminal.
2. Open the web panel → badge flips to **Online** within ~3 seconds automatically.
3. Start chatting. No Connect button, no token paste.

If the bridge isn't running, the panel shows a small "Offline — start the bridge" hint with a link to the setup instructions (still accessible via the gear icon).
