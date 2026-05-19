#!/usr/bin/env node
// Local Bridge Agent — exposes filesystem + shell over http://localhost:PORT
// Run with: node bridge.mjs
// All requests must include header: Authorization: Bearer <TOKEN>
// The TOKEN is printed on startup. Paste it into the web UI.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const PORT = Number(process.env.BRIDGE_PORT || 7777);
const TOKEN = process.env.BRIDGE_TOKEN || "123456789";
const ROOT = process.cwd();
const execAsync = promisify(exec);

const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
  });
  res.end(JSON.stringify(data));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

const resolvePath = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));

const handlers = {
  async ping() {
    return { ok: true, root: ROOT, platform: process.platform };
  },
  async list_dir({ path: p }) {
    const abs = resolvePath(p);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return {
      path: abs,
      entries: entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
      })),
    };
  },
  async read_file({ path: p }) {
    const abs = resolvePath(p);
    const stat = await fs.stat(abs);
    if (stat.size > 2_000_000) throw new Error("File too large (>2MB)");
    const content = await fs.readFile(abs, "utf8");
    return { path: abs, content };
  },
  async write_file({ path: p, content }) {
    const abs = resolvePath(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return { path: abs, bytes: Buffer.byteLength(content, "utf8") };
  },
  async search_files({ path: p, query }) {
    const abs = resolvePath(p);
    const results = [];
    const re = new RegExp(query, "i");
    async function walk(dir, depth = 0) {
      if (depth > 6 || results.length >= 50) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, depth + 1);
        else if (e.isFile()) {
          try {
            const stat = await fs.stat(full);
            if (stat.size > 500_000) continue;
            const text = await fs.readFile(full, "utf8");
            const lines = text.split("\n");
            lines.forEach((line, i) => {
              if (re.test(line) && results.length < 50) {
                results.push({ file: full, line: i + 1, text: line.slice(0, 200) });
              }
            });
          } catch {}
        }
      }
    }
    await walk(abs);
    return { results };
  },
  async run_command({ command, cwd }) {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd ? resolvePath(cwd) : ROOT,
      maxBuffer: 5_000_000,
      timeout: 60_000,
      shell: true,
    });
    return { stdout, stderr };
  },
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});

  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${TOKEN}`) {
    return json(res, 401, { error: "Unauthorized. Paste the token from the bridge console." });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const action = url.pathname.replace(/^\//, "") || "ping";
  const handler = handlers[action];
  if (!handler) return json(res, 404, { error: `Unknown action: ${action}` });

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const result = await handler(body);
    return json(res, 200, result);
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  DataScout by AAGNEY — Local Bridge running                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`  URL:   http://localhost:${PORT}`);
  console.log(`  Root:  ${ROOT}`);
  console.log(`  Token: ${TOKEN}`);
  console.log("\n  Web panel will auto-connect — keep this terminal open.\n");
});
