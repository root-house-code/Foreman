const fs = require("fs");
const path = require("path");
const os = require("os");

const DATA_DIR = path.join(os.homedir(), "Documents", "Foreman");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const IMAGES_FILE = path.join(DATA_DIR, "images.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
  return { ...safeRead(DATA_FILE), ...safeRead(IMAGES_FILE) };
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
  atomicWrite(DATA_FILE, data);
  atomicWrite(IMAGES_FILE, images);
}

// ── Backups ───────────────────────────────────────────────────────────────────
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

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
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const now = Date.now();
  const files = fs.readdirSync(BACKUPS_DIR)
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
      // Last 24 h: keep all (up to 24)
      if (keep.size < 24) keep.add(f.name);
    } else if (age < 7 * 24 * 3600_000) {
      // 1–7 days: keep one per calendar day
      const day = new Date(f.time).toDateString();
      if (!dailySeen[day]) { dailySeen[day] = true; keep.add(f.name); }
    } else if (age < 28 * 24 * 3600_000) {
      // 7–28 days: keep one per ISO week
      const week = Math.floor(f.time / (7 * 24 * 3600_000));
      if (!weeklySeen[week]) { weeklySeen[week] = true; keep.add(f.name); }
    }
    // > 28 days: drop
  }

  for (const f of files) {
    if (!keep.has(f.name)) {
      try { fs.unlinkSync(path.join(BACKUPS_DIR, f.name)); } catch {}
    }
  }
}

// Create a timestamped copy of data.json in the backups directory.
function createBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const dest = path.join(BACKUPS_DIR, `backup-${isoStamp()}.json`);
  fs.copyFileSync(DATA_FILE, dest);
  pruneBackups();
}

module.exports = { readAllSync, flush, createBackup };
