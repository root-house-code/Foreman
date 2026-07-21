const { shell, safeStorage } = require("electron");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { readGmailAuth, writeGmailAuth, clearGmailAuth } = require("./gmailAuthStore.cjs");

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly openid email";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

let _connecting = null;        // in-flight connect() promise — dedupes double-clicks
let _accessTokenCache = null;  // { token, expiresAt } — memory only, never persisted

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Foreman is a publicly-distributed open-source app, so there is no shared Gmail
// OAuth client baked into the codebase — Google's "Testing" publish status caps an
// app at 100 test users and getting a restricted scope like gmail.readonly verified
// for production is a real security assessment, impractical for a hobby project to
// carry on every user's behalf. Instead, each user creates their own tiny Google
// Cloud OAuth client (see Preferences → Integrations → Gmail Bill Import) and
// pastes the Client ID/Secret in; both are stored locally, the secret safeStorage-encrypted.
function clientCreds() {
  const a = readGmailAuth();
  if (!a.clientId || !a.encryptedClientSecret) return { id: null, secret: null };
  try {
    const secret = safeStorage.decryptString(Buffer.from(a.encryptedClientSecret, "base64"));
    return { id: a.clientId, secret };
  } catch {
    return { id: null, secret: null };
  }
}

function setClientConfig({ clientId, clientSecret }) {
  const id = (clientId || "").trim();
  const secret = (clientSecret || "").trim();
  if (!id || !secret) return { ok: false, error: "Client ID and Client Secret are both required." };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "Secure storage is unavailable on this system, so credentials can't be saved safely." };
  }

  const prev = readGmailAuth();
  const changed = prev.clientId && prev.clientId !== id;
  const encryptedClientSecret = safeStorage.encryptString(secret).toString("base64");

  // A different client invalidates any existing refresh token (it was issued to
  // the old client and Google will reject a refresh against a different client_id).
  writeGmailAuth({
    ...(changed ? {} : prev),
    clientId: id,
    encryptedClientSecret,
  });
  if (changed) _accessTokenCache = null;
  return { ok: true };
}

function getClientConfigStatus() {
  const a = readGmailAuth();
  return { configured: !!(a.clientId && a.encryptedClientSecret), clientId: a.clientId || null };
}

// Removing the app-level credentials also invalidates any active connection —
// without a client_id/secret there is nothing to refresh a token against.
function clearClientConfig() {
  clearGmailAuth();
  _accessTokenCache = null;
}

// POST application/x-www-form-urlencoded to the token endpoint, resolve parsed JSON.
// Resolves (not rejects) on non-2xx so callers can inspect body.error (e.g. invalid_grant).
function postToken(params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json = {};
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Decode the middle segment of a JWT without verifying — we obtained it ourselves
// over TLS from Google's token endpoint, so no signature check is needed here.
function decodeIdTokenEmail(idToken) {
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return json.email || null;
  } catch { return null; }
}

async function connect() {
  if (_connecting) return _connecting;
  _connecting = _doConnect().finally(() => { _connecting = null; });
  return _connecting;
}

async function _doConnect() {
  const { id, secret } = clientCreds();
  if (!id || !secret) {
    return { ok: false, error: "Add your Google API credentials first (Preferences → Integrations → Gmail Bill Import)." };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "Secure storage is unavailable on this system, so the Gmail connection can't be saved safely." };
  }

  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { server.close(); } catch {}
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/") { res.writeHead(404); res.end(); return; }

      const respond = (msg) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0f1117;color:#c9a96e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>${msg}</p></body>`);
      };

      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");

      if (err) { respond("Sign-in was cancelled. You can close this tab."); finish({ ok: false, error: "Sign-in was cancelled." }); return; }
      if (returnedState !== state) { respond("Sign-in failed (state mismatch). You can close this tab."); finish({ ok: false, error: "Sign-in failed (state mismatch)." }); return; }
      if (!code) { respond("Sign-in failed (no code). You can close this tab."); finish({ ok: false, error: "Sign-in failed." }); return; }

      const redirectUri = `http://127.0.0.1:${server.address().port}`;
      const { status, body } = await postToken({
        grant_type: "authorization_code",
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).catch((e) => ({ status: 0, body: { error: String(e?.message || e) } }));

      if (status !== 200 || !body.refresh_token) {
        respond("Sign-in failed. You can close this tab and try again.");
        finish({ ok: false, error: body.error_description || body.error || "Token exchange failed. Make sure you granted access." });
        return;
      }

      const email = decodeIdTokenEmail(body.id_token);
      const encryptedRefreshToken = safeStorage.encryptString(body.refresh_token).toString("base64");
      writeGmailAuth({
        ...readGmailAuth(), // preserve clientId/encryptedClientSecret
        connected: true,
        email,
        connectedAt: new Date().toISOString(),
        encryptedRefreshToken,
      });
      _accessTokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
      respond("Connected to Foreman. You can close this tab.");
      finish({ ok: true, email });
    });

    const timer = setTimeout(() => finish({ ok: false, error: "Sign-in timed out." }), CONNECT_TIMEOUT_MS);

    server.listen(0, "127.0.0.1", () => {
      const redirectUri = `http://127.0.0.1:${server.address().port}`;
      const authUrl = `${AUTH_ENDPOINT}?` + new URLSearchParams({
        client_id: id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      }).toString();
      shell.openExternal(authUrl);
    });

    server.on("error", (e) => finish({ ok: false, error: `Could not start sign-in listener: ${String(e?.message || e)}` }));
  });
}

// Revokes the Gmail *account* connection only — the saved Client ID/Secret (the
// user's own Google Cloud app) stay put so reconnecting doesn't require re-entry.
function disconnect() {
  const { clientId, encryptedClientSecret } = readGmailAuth();
  if (clientId && encryptedClientSecret) writeGmailAuth({ clientId, encryptedClientSecret });
  else clearGmailAuth();
  _accessTokenCache = null;
}

function getStatus() {
  const a = readGmailAuth();
  return { connected: !!a.connected, email: a.email || null, connectedAt: a.connectedAt || null };
}

async function getAccessToken() {
  if (_accessTokenCache && Date.now() < _accessTokenCache.expiresAt - 60_000) {
    return { accessToken: _accessTokenCache.token };
  }

  const a = readGmailAuth();
  if (!a.connected || !a.encryptedRefreshToken) return { error: "not_connected" };

  const { id, secret } = clientCreds();
  if (!id || !secret) return { error: "not_configured" };

  let refreshToken;
  try {
    refreshToken = safeStorage.decryptString(Buffer.from(a.encryptedRefreshToken, "base64"));
  } catch {
    return { error: "reauth_required" };
  }

  const { status, body } = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
  }).catch((e) => ({ status: 0, body: { error: String(e?.message || e) } }));

  if (status === 200 && body.access_token) {
    _accessTokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
    return { accessToken: body.access_token };
  }
  if (body.error === "invalid_grant") {
    disconnect(); // clears the connection only, keeps clientId/secret
    return { error: "reauth_required" };
  }
  return { error: "network" };
}

module.exports = {
  connect, disconnect, getStatus, getAccessToken,
  setClientConfig, getClientConfigStatus, clearClientConfig,
};
