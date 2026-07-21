const fs = require("fs");
const path = require("path");

// The Gmail refresh token lives in its own file, deliberately outside the shared
// data.json / LAN-broadcast pipeline: it's main-process-only and must never ride
// along in /api/all snapshots to paired devices or in the backup rotation.
// Mirrors storageFile.cjs's dataDir() so it follows OneDrive folder redirection.
function dataDir() {
  return path.join(require("electron").app.getPath("documents"), "Foreman");
}
function authFile() { return path.join(dataDir(), "gmail-auth.json"); }

function readGmailAuth() {
  try { return JSON.parse(fs.readFileSync(authFile(), "utf8")); }
  catch { return {}; }
}

function writeGmailAuth(obj) {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = authFile();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, file);
}

function clearGmailAuth() {
  try { fs.unlinkSync(authFile()); } catch {}
}

module.exports = { readGmailAuth, writeGmailAuth, clearGmailAuth };
