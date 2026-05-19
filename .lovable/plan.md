## Plan: make DataScout connect automatically for the running local bridge

The bridge is running on your laptop and prints the correct URL/token, but the web app is still showing **Offline** because the browser requests to `http://localhost:7777/ping` are failing before the app receives a response. I’ll update both sides so the local panel can connect reliably and stop showing the full setup block repeatedly.

### 1. Update the bridge agent for browser compatibility
- Add a simple `GET /ping` health endpoint so the app can test the bridge with a simpler request.
- Respond cleanly to Private Network Access/CORS preflight requests before requiring authorization.
- Bind to localhost in a way that works better on Windows browsers, while still printing the same `http://localhost:7777` URL.
- Keep token `123456789` and auto-approve behavior unchanged.
- Rebuild `public/bridge-agent.zip` so downloads include the fixed bridge.

### 2. Update the web panel auto-connect logic
- Use the default bridge config automatically: `http://localhost:7777` + `123456789`.
- Try the lighter `GET /ping` check first, then mark the bridge **Online** as soon as it responds.
- Keep retrying silently if the bridge is temporarily unavailable.
- Do not show the large setup instructions automatically just because status is offline.

### 3. Simplify the visible UI
- Hide the repeated setup text by default.
- Keep only a small offline hint and a settings button if the user needs to re-download or change the bridge config.
- Make the header look cleaner and more professional without changing the app’s core behavior.

### 4. Validate
- Confirm the app now sends the improved health check request.
- Confirm the bridge package is updated.
- Confirm the panel still supports manual settings only as an advanced fallback.