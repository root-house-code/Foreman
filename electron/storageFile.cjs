const fs = require("fs");
const path = require("path");

// Use app.getPath("documents") so the path follows Windows folder redirection
// (e.g. OneDrive Documents) rather than assuming os.homedir()\Documents.
// Computed lazily — IPC handlers only fire after app is ready.
function dataDir() {
  return path.join(require("electron").app.getPath("documents"), "Foreman");
}
function dataFile()   { return path.join(dataDir(), "data.json"); }
function imagesFile() { return path.join(dataDir(), "images.json"); }
function backupsDir() { return path.join(dataDir(), "backups"); }

function ensureDir() {
  const d = dataDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function atomicWrite(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, file);
}

function safeRead(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

function readAllSync() {
  ensureDir();
  return { ...safeRead(dataFile()), ...safeRead(imagesFile()) };
}

// Partition snapshot: images key → images.json, everything else → data.json.
// Atomic write to each (temp + rename) so a crash mid-write never corrupts the file.
function flush(snapshot) {
  ensureDir();
  const data = {};
  const images = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (k === "foreman-images") images[k] = v;
    else data[k] = v;
  }
  atomicWrite(dataFile(), data);
  atomicWrite(imagesFile(), images);
}

// ── Backups ───────────────────────────────────────────────────────────────────
function isoStamp() {
  // "2026-06-21T11-04-56" — colons swapped to hyphens so it's a valid filename
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function parseStamp(filename) {
  // "backup-2026-06-21T11-04-56.json" → Date
  const ts = filename.slice(7, 26); // "2026-06-21T11-04-56"
  const iso = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

// Tiered retention: keep all hourlies for 24h, 1/day for 7 days, 1/week for 4 weeks.
function pruneBackups() {
  const bd = backupsDir();
  if (!fs.existsSync(bd)) return;
  const now = Date.now();
  const files = fs.readdirSync(bd)
    .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
    .map(f => ({ name: f, time: parseStamp(f)?.getTime() }))
    .filter(f => f.time)
    .sort((a, b) => b.time - a.time); // newest first

  const keep = new Set();
  const dailySeen = {};
  const weeklySeen = {};

  for (const f of files) {
    const age = now - f.time;
    if (age < 24 * 3600_000) {
      if (keep.size < 24) keep.add(f.name);
    } else if (age < 7 * 24 * 3600_000) {
      const day = new Date(f.time).toDateString();
      if (!dailySeen[day]) { dailySeen[day] = true; keep.add(f.name); }
    } else if (age < 28 * 24 * 3600_000) {
      const week = Math.floor(f.time / (7 * 24 * 3600_000));
      if (!weeklySeen[week]) { weeklySeen[week] = true; keep.add(f.name); }
    }
  }

  for (const f of files) {
    if (!keep.has(f.name)) {
      try { fs.unlinkSync(path.join(bd, f.name)); } catch {}
    }
  }
}

// Create a timestamped copy of data.json in the backups directory.
function createBackup() {
  const src = dataFile();
  if (!fs.existsSync(src)) return;
  const bd = backupsDir();
  if (!fs.existsSync(bd)) fs.mkdirSync(bd, { recursive: true });
  fs.copyFileSync(src, path.join(bd, `backup-${isoStamp()}.json`));
  pruneBackups();
}

module.exports = { readAllSync, flush, createBackup };
