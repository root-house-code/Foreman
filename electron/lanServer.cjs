const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// LAN sharing server — serves the built app plus a small storage API to other
// devices on the same wifi network. The Electron main process is the single
// authoritative host; browsers on the LAN load the SPA from here and read/write
// the live store through /api. Everything is LAN-only: the server binds to the
// local interfaces and requires the pairing token on every data endpoint.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const MAX_BODY = 64 * 1024 * 1024; // 64 MB — images.json payloads can be large

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

// LAN IPv4 addresses of this machine (for the pairing URL shown in Preferences).
function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

/**
 * Start the LAN server.
 *  opts.distDir           directory of the built SPA to serve
 *  opts.getToken          () => current pairing token
 *  opts.getStore          () => the authoritative store object
 *  opts.applyRemoteDelta  (delta, clientId) => void  — merge + persist + notify host renderer
 * Returns { server, port, addresses, broadcast, close }.
 */
function createLanServer(opts, port = 8417) {
  const sseClients = new Map(); // clientId -> res

  function broadcast(delta, excludeClientId) {
    const payload = `data: ${JSON.stringify(delta)}\n\n`;
    for (const [id, res] of sseClients) {
      if (id === excludeClientId) continue;
      try { res.write(payload); } catch { sseClients.delete(id); }
    }
  }

  function authed(req, url) {
    const token = url.searchParams.get("token") || req.headers["x-foreman-token"];
    return !!token && token === opts.getToken();
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    try {
      // ── API ────────────────────────────────────────────────────────────────
      if (p === "/api/ping") {
        return json(res, 200, { foreman: true });
      }
      if (p.startsWith("/api/")) {
        if (!authed(req, url)) return json(res, 401, { error: "pairing token required" });

        if (p === "/api/all" && req.method === "GET") {
          return json(res, 200, opts.getStore());
        }
        if (p === "/api/set" && req.method === "POST") {
          const body = JSON.parse(await readBody(req));
          const delta = { updates: body.updates || {}, deletes: body.deletes || [] };
          opts.applyRemoteDelta(delta, body.client || null);
          broadcast(delta, body.client || null);
          return json(res, 200, { ok: true });
        }
        if (p === "/api/events" && req.method === "GET") {
          const clientId = url.searchParams.get("client") || `anon-${Date.now()}`;
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
          });
          res.write(": connected\n\n");
          sseClients.set(clientId, res);
          const heartbeat = setInterval(() => {
            try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
          }, 30_000);
          req.on("close", () => { clearInterval(heartbeat); sseClients.delete(clientId); });
          return;
        }
        return json(res, 404, { error: "unknown endpoint" });
      }

      // ── Static SPA ─────────────────────────────────────────────────────────
      let rel = p === "/" ? "index.html" : p.slice(1);
      let file = path.normalize(path.join(opts.distDir, rel));
      if (!file.startsWith(path.normalize(opts.distDir))) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file)) file = path.join(opts.distDir, "index.html"); // SPA fallback
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    } catch (err) {
      json(res, 500, { error: String(err?.message || err) });
    }
  });

  // Try the requested port, incrementing on conflict (up to +10).
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryListen(pt) {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && attempt < 10) { attempt += 1; tryListen(pt + 1); }
        else reject(err);
      });
      server.listen(pt, "0.0.0.0", () => {
        resolve({
          server,
          port: pt,
          addresses: lanAddresses(),
          broadcast,
          close: () => new Promise(r => { for (const res of sseClients.values()) { try { res.end(); } catch {} } sseClients.clear(); server.close(r); }),
        });
      });
    }
    tryListen(port);
  });
}

module.exports = { createLanServer, lanAddresses };
