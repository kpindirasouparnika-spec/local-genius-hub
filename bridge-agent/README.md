# Local Bridge Agent

Gives the web AI agent access to your laptop's filesystem and shell.

## Run

Requires Node.js 18+.

```bash
cd /any/folder/you/want/as/root
node bridge.mjs
```

It prints a URL (`http://localhost:7777`) and a random `Token`. Paste both into the web UI's "Connect bridge" panel.

## Configuration

- `BRIDGE_PORT` — change the port (default `7777`)
- `BRIDGE_TOKEN` — use a fixed token instead of a random one

```bash
BRIDGE_PORT=8000 BRIDGE_TOKEN=mysecret node bridge.mjs
```

## Security

- Listens only on `127.0.0.1` (not your network)
- Every request must include the bearer token
- The agent can read, write, and run shell commands inside the directory you started it in (and absolute paths anywhere your user can access)
- **Stop it with Ctrl+C when you're done.**
