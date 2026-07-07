import { useState, useRef, useEffect } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { PAGE_INFO, pageTitle } from "./lib/pageInfo.js";

const sectionLabel = {
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "0.35rem",
};

const sectionHeading = {
  font: "500 1.15rem var(--fm-serif)",
  color: "var(--fm-ink)",
  margin: "0 0 0.75rem 0",
  letterSpacing: "-0.01em",
};

const bodyText = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.85rem",
  lineHeight: 1.75,
  margin: 0,
};

const divider = {
  borderTop: "var(--fm-border)",
  paddingTop: "1.75rem",
  marginTop: "1.75rem",
};

// ─── Shared TOC logic ──────────────────────────────────────────────────────────

function useToc(sections) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id);
  const sectionRefs = useRef({});
  const visibleSections = useRef(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) visibleSections.current.add(e.target.id);
        else visibleSections.current.delete(e.target.id);
      });
      const topmost = sections.map(s => s.id).find(id => visibleSections.current.has(id));
      if (topmost) setActiveSection(topmost);
    }, { threshold: 0, rootMargin: "0px 0px -60% 0px" });

    sections.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []); // eslint-disable-line

  function scrollTo(id) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return { activeSection, sectionRefs, scrollTo };
}

function TocButton({ id, label, activeSection, onSelect }) {
  const isActive = activeSection === id;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: isActive ? "1px solid var(--fm-brass)" : "1px solid transparent",
        color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)",
        cursor: "pointer",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.65rem",
        letterSpacing: "0.08em",
        padding: "0.15rem 0",
        textTransform: "uppercase",
        transition: "color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
    >
      {label}
    </button>
  );
}

function TocNav({ sections, activeSection, onSelect }) {
  const tocLabel = { color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase" };

  // Grouped TOC: one row per group, each prefixed by its name (used by the roadmap).
  if (sections.some(s => s.group)) {
    const groups = [];
    for (const s of sections) {
      let g = groups.find(g => g.name === s.group);
      if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
      g.items.push(s);
    }
    return (
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginBottom: "2.25rem" }}>
        {groups.map(g => (
          <div key={g.name} style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            <span style={{ ...tocLabel, minWidth: "8.5rem" }}>{g.name}</span>
            {g.items.map(s => <TocButton key={s.id} {...s} activeSection={activeSection} onSelect={onSelect} />)}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "2.25rem" }}>
      <span style={{ ...tocLabel, marginRight: "0.25rem" }}>Contents</span>
      {sections.map(s => <TocButton key={s.id} {...s} activeSection={activeSection} onSelect={onSelect} />)}
    </nav>
  );
}

// ─── Instructions tab ──────────────────────────────────────────────────────────

const INSTRUCTIONS_SECTIONS = [
  { id: "sec-overview", label: "Foreman: Get More Shit Done" },
  { id: "sec-pages",    label: "Pages" },
];

const TENETS = [
  ["Foreman is a utility.", "It does the job. No ceremony, no bloat. You come with a problem and leave with it handled."],
  ["Foreman is architecture.", "It reflects how a home is actually structured: systems, categories, items, tasks. Not a flat list of reminders."],
  ["Foreman is infrastructure.", "It runs in the background of homeownership. Reliable, load-bearing, unglamorous in the best way."],
  ["Foreman is input and output agnostic.", "The data goes where it needs to go and comes from where it needs to come. No lock-in to a single format or flow."],
  ["Foreman is extendable.", "New systems, new pages, new data types. The foundation holds when the scope expands."],
  ["Foreman is flexible.", "It bends to how you actually work, not how the tool assumes you work."],
  ["Foreman is integrated and seamless.", "Inventory, maintenance, tasks, projects. One system, not four apps duct-taped together."],
  ["Foreman is fun.", "It feels good to get shit done in Foreman, and you get more shit done with Foreman. The tool makes the work feel worth doing."],
  ["Foreman is honest.", "It shows you what's real: what's overdue, what's untracked, what's been neglected. No hiding the score."],
  ["Foreman is yours.", "The structure bends to your home, not a generic template."],
  ["Foreman is durable.", "Built for decades of ownership, not a sprint. The registry outlasts the renovation."],
  ["Foreman is calm.", "Dense information without noise. You open it and feel in control, not overwhelmed."],
  ["Foreman earns trust.", "Every interaction that works as expected makes the next one easier to trust."],
];

// Per-page descriptions now live in lib/pageInfo.js (PAGE_INFO) — the single source
// shared by the Instructions tab below and the global page-info button.

function InstructionsTab() {
  const { activeSection, sectionRefs, scrollTo } = useToc(INSTRUCTIONS_SECTIONS);

  return (
    <div>
      <TocNav sections={INSTRUCTIONS_SECTIONS} activeSection={activeSection} onSelect={scrollTo} />

      <div ref={el => { sectionRefs.current["sec-overview"] = el; }} id="sec-overview">
        <div style={sectionLabel}>Overview</div>
        <h2 style={sectionHeading}>Foreman: Get More Shit Done</h2>
        <p style={bodyText}>
          Foreman is a home management system built around the way homes actually work. It tracks the structure of your home (systems, categories, items, and tasks) and ties them together into a single, honest picture of where things stand. Whether you're logging a completed HVAC filter change, cataloging the specs of your appliances, or tracking a multi-week renovation project, Foreman keeps the record. It doesn't tell you how to run your home. It helps you see it clearly and act on what you find.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          From anywhere in the app, press <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>⌘K</span> / <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>Ctrl-K</span> — or click the Search box in the header — to open the command palette: a single search across every page, inventory item, maintenance task, chore, service, utility, and project, with quick actions to jump straight into common tasks.
        </p>
      </div>

      <div ref={el => { sectionRefs.current["sec-pages"] = el; }} id="sec-pages" style={divider}>
        <div style={sectionLabel}>Navigation</div>
        <h2 style={sectionHeading}>Pages</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
          {PAGE_INFO.filter(p => p.key !== "readme").map((p) => (
            <div key={p.key}>
              <div style={{ font: "500 0.9rem var(--fm-serif)", color: "var(--fm-ink)", marginBottom: "0.2rem" }}>{p.title}</div>
              <p style={bodyText}>{p.valueProp}</p>
              {p.howTo?.length > 0 && (
                <ul style={{ ...bodyText, margin: "0.45rem 0 0", paddingLeft: "1.1rem" }}>
                  {p.howTo.map((step, i) => (
                    <li key={i} style={{ marginBottom: "0.15rem" }}>{step}</li>
                  ))}
                </ul>
              )}
              {p.sharedWith?.length > 0 && (
                <p style={{ ...bodyText, marginTop: "0.45rem" }}>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Shares data with: </span>
                  {p.sharedWith.map(r => pageTitle(r.key)).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Design Tenets tab ─────────────────────────────────────────────────────────

function TenetsTab() {
  return (
    <div>
      <div style={sectionLabel}>Principles</div>
      <h2 style={sectionHeading}>Our Design Tenets</h2>
      <p style={{ ...bodyText, marginBottom: "1.75rem" }}>
        These tenets govern every design, UX, and architecture decision in Foreman. When two options conflict, they break the tie. When scope creep whispers, they push back.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {TENETS.map(([title, desc], i) => (
          <div key={i} style={{ display: "flex", gap: "0.75rem" }}>
            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", minWidth: "1.25rem", paddingTop: "0.25rem" }}>{i + 1}.</span>
            <p style={bodyText}>
              <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{title}</span>{" "}
              {desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Technical Architecture tab ────────────────────────────────────────────────

const ARCH_SECTIONS = [
  { id: "arch-storage",      label: "Data Storage" },
  { id: "arch-multidevice",  label: "Multi-Device" },
  { id: "arch-pwa",          label: "PWA & Offline" },
  { id: "arch-stack",        label: "Built With" },
  { id: "arch-structure",    label: "App Structure" },
  { id: "arch-state",        label: "State" },
  { id: "arch-datamodel",    label: "Data Model" },
  { id: "arch-design",       label: "Design System" },
  { id: "arch-integrations", label: "Integrations" },
];

// Inline code reference (file paths, storage keys, function names).
const monoStyle = { fontFamily: "var(--fm-mono)", fontSize: "0.8rem" };
function Mono({ children }) { return <span style={monoStyle}>{children}</span>; }

// Bulleted row with a bold lead-in, used throughout the architecture tab.
function ArchRow({ name, children }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem" }}>
      <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
      <p style={bodyText}>
        <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
        {children}
      </p>
    </div>
  );
}

// Titled block within the data model section.
function ArchBlock({ title, children }) {
  return (
    <div>
      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>{title}</div>
      {children}
    </div>
  );
}

function ArchSection({ id, label, heading, sectionRefs, first, children }) {
  return (
    <div
      ref={el => { sectionRefs.current[id] = el; }}
      id={id}
      style={first ? {} : divider}
    >
      <div style={sectionLabel}>{label}</div>
      <h2 style={sectionHeading}>{heading}</h2>
      {children}
    </div>
  );
}

// Priority tier header dividing the roadmap into Top / Medium / Low sections.
function RoadGroupHeader({ label, first }) {
  return (
    <div style={{
      borderTop: first ? "none" : "2px solid var(--fm-brass-dim)",
      color: "var(--fm-brass)",
      fontFamily: "var(--fm-mono)",
      fontSize: "0.72rem",
      fontWeight: 600,
      letterSpacing: "0.2em",
      marginTop: first ? 0 : "2.75rem",
      paddingTop: first ? 0 : "1.1rem",
      textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}

function ArchTab() {
  const { activeSection, sectionRefs, scrollTo } = useToc(ARCH_SECTIONS);
  const stack = { display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" };

  return (
    <div>
      <TocNav sections={ARCH_SECTIONS} activeSection={activeSection} onSelect={scrollTo} />

      {/* ── Storage ─────────────────────────────────────────────────────────── */}
      <ArchSection id="arch-storage" label="Storage" heading="Storage Engine" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          Foreman is local-first: no server, no account, no network dependency for core function. All persistence flows through one module, <Mono>lib/storage.js</Mono>, which exposes <Mono>storageGet</Mono> / <Mono>storageSet</Mono> / <Mono>storageDel</Mono> (plus <Mono>storageSetMany</Mono>, <Mono>storageDelMany</Mono>, and <Mono>storageGetAll</Mono> for bulk operations like profile switching and export). No other file touches IndexedDB, the Electron IPC bridge, or the network directly — the rest of the codebase is backend-agnostic by construction.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The module keeps an in-memory cache (<Mono>_cache</Mono>) hydrated exactly once by <Mono>storageInit()</Mono>, which <Mono>src/main.jsx</Mono> awaits before calling <Mono>createRoot()</Mono>. After that, every <Mono>load*()</Mono> in <Mono>lib/</Mono> is a synchronous cache read — safe inside React state initializers — and every <Mono>save*()</Mono> mutates the cache immediately and schedules persistence in the background. The UI never waits on I/O.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}><Mono>storageInit()</Mono> selects one of three backends:</p>
        <div style={stack}>
          <ArchRow name="Electron (file mode)"><Mono>electron/preload.cjs</Mono> exposes <Mono>window.foreman</Mono> via <Mono>contextBridge</Mono> with <Mono>isElectron: true</Mono>; <Mono>lib/storage.js</Mono> detects it at module load and hydrates synchronously through <Mono>readAllSync()</Mono>, a blocking <Mono>ipcRenderer.sendSync("storage:readAll")</Mono> against the main process's authoritative store.</ArchRow>
          <ArchRow name="LAN client (remote mode)">Failing that, the app probes <Mono>GET /api/ping</Mono> — only a Foreman host answers <Mono>{"{ foreman: true }"}</Mono>. If found, <Mono>_initRemote()</Mono> pulls the full store from <Mono>/api/all</Mono> and subscribes to <Mono>/api/events</Mono> over server-sent events. On the Vite dev server or any static host the probe 404s and falls through.</ArchRow>
          <ArchRow name="Browser (IndexedDB)">The default: hydrate from <Mono>idb-keyval</Mono>'s <Mono>entries()</Mono>, then run a one-time localStorage → IndexedDB migration guarded by the <Mono>foreman-idb-migrated</Mono> sentinel key.</ArchRow>
        </div>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Delta transport.</span> In file and remote modes, writes accumulate in <Mono>_dirty</Mono> / <Mono>_deleted</Mono> sets and flush on a 100&nbsp;ms debounce (<Mono>_scheduleSend()</Mono>) as a per-key delta <Mono>{"{ updates, deletes }"}</Mono> — never a whole-store snapshot. That is the invariant that makes concurrent multi-device edits safe: a writer can only overwrite keys it actually changed. <Mono>storageFlushNow()</Mono> flushes synchronously (<Mono>sendSync</Mono> in Electron, a <Mono>keepalive</Mono> fetch on LAN clients) and is called before <Mono>window.location.reload()</Mono> so the debounce timer can't race the next boot's read.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Desktop persistence.</span> The Electron main process owns the single authoritative store (<Mono>ensureStore()</Mono> / <Mono>applyDelta()</Mono> in <Mono>electron/main.cjs</Mono>). Renderer deltas arrive over the <Mono>storage:setKeys</Mono> IPC channel and flush to disk on a 500&nbsp;ms debounce; memory is authoritative after first load so a renderer reload can never resurrect stale disk state. <Mono>electron/storageFile.cjs</Mono> partitions each snapshot into <Mono>Documents\Foreman\data.json</Mono> and <Mono>images.json</Mono> (the <Mono>foreman-images</Mono> key alone, since base64 images dominate file size), writing both via <Mono>atomicWrite()</Mono> — temp file, then <Mono>renameSync</Mono> — so a crash mid-write can't corrupt data. The directory comes from <Mono>app.getPath("documents")</Mono>, which follows Windows folder redirection (OneDrive included). <Mono>createBackup()</Mono> copies <Mono>data.json</Mono> into <Mono>backups\</Mono> at most hourly and on every renderer boot; <Mono>pruneBackups()</Mono> applies tiered retention — 24 hourlies, one per day for 7 days, one per week for 4 weeks.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Storage keys follow the convention <Mono>foreman-{"{domain}"}</Mono> (e.g. <Mono>foreman-chores</Mono>, <Mono>foreman-services</Mono>); a handful of older keys keep shorter historical names (<Mono>maintenance-dates</Mono>, <Mono>fp-data</Mono>). The Export function in Preferences produces a portable JSON snapshot regardless of backend — it's also how data moves from a browser install into the desktop app the first time.
        </p>
      </ArchSection>

      {/* ── Multi-device ────────────────────────────────────────────────────── */}
      <ArchSection id="arch-multidevice" label="Sharing" heading="Multi-Device Sharing" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The desktop app can share its live data with any browser on the same wifi — no cloud, no account. The topology is hub-and-spoke: the Electron main process is the single authoritative host, and every other device is a live window into it rather than a replica. There is deliberately no sync engine, no merge, and no conflict resolution, because there is never a second copy to diverge.
        </p>
        <div style={stack}>
          <ArchRow name="The server"><Mono>electron/lanServer.cjs</Mono> is a dependency-free <Mono>node:http</Mono> server started via the <Mono>lan:start</Mono> IPC handler (Preferences → Integrations). It binds <Mono>0.0.0.0</Mono> on port 8417 — incrementing up to +10 on <Mono>EADDRINUSE</Mono> — and serves the built SPA from <Mono>dist/</Mono> with an <Mono>index.html</Mono> fallback and a path-traversal guard on every static read.</ArchRow>
          <ArchRow name="The API"><Mono>/api/ping</Mono> is the unauthenticated host-detection marker. Everything else requires the pairing token (query <Mono>?token=</Mono> or <Mono>x-foreman-token</Mono> header): <Mono>/api/all</Mono> returns the full store, <Mono>/api/set</Mono> accepts a per-key delta <Mono>{"{ updates, deletes, client }"}</Mono> with a 64&nbsp;MB body cap (image payloads), and <Mono>/api/events</Mono> is an SSE stream with a 30-second comment heartbeat and a per-client connection registry.</ArchRow>
          <ArchRow name="The token">Generated as <Mono>crypto.randomUUID()</Mono> on first use and persisted under <Mono>foreman-lan-share</Mono> in the store itself. The <Mono>lan:regenerate</Mono> IPC handler mints a new one, instantly invalidating every paired device.</ArchRow>
          <ArchRow name="Pairing">Preferences renders a QR code (the <Mono>qrcode</Mono> package) encoding <Mono>{"http://<lan-ip>:<port>/#pair=<token>"}</Mono>. On the client, <Mono>_pairingToken()</Mono> in <Mono>lib/storage.js</Mono> reads the <Mono>#pair=</Mono> hash, persists it to that browser's localStorage under <Mono>foreman-lan-token</Mono>, and strips the hash via <Mono>history.replaceState()</Mono>. A 401 clears the stored token and renders the pairing-required screen.</ArchRow>
          <ArchRow name="Write fan-out">A client POST to <Mono>/api/set</Mono> invokes <Mono>applyRemoteDelta()</Mono> in <Mono>main.cjs</Mono> — merge into the store, schedule the disk flush, notify the host renderer over the <Mono>remote-storage-change</Mono> channel — while the server broadcasts the same delta to every other SSE client, excluding the originator. Host-side edits take the mirror path: <Mono>storage:setKeys</Mono> merges, then <Mono>_lan.broadcast()</Mono>. On each receiving device the delta lands in the storage cache and <Mono>onStorageRemoteChange</Mono> fires <Mono>reloadAll()</Mono> (wired in <Mono>src/App.jsx</Mono>), so every subscribed page re-renders.</ArchRow>
        </div>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The honest constraint: devices reach the data by reaching the host, so the desktop app must be running (it lives in the system tray, so this is normally true) and every device must be on the same network. Away from home, a paired device has no data to show — the tradeoff this design makes to stay local and account-free.
        </p>
      </ArchSection>

      {/* ── PWA ─────────────────────────────────────────────────────────────── */}
      <ArchSection id="arch-pwa" label="PWA" heading="PWA & Offline Behavior" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The web build is installable: <Mono>public/manifest.webmanifest</Mono> supplies the icons and standalone display mode, and <Mono>public/sw.js</Mono> is the service worker. Registration (bottom of <Mono>src/main.jsx</Mono>) is deliberately narrow — production builds only (the dev server would fight Vite HMR), never inside Electron, and only where <Mono>navigator.serviceWorker</Mono> exists, i.e. secure contexts. Over plain LAN HTTP the registration is a silent no-op and the app behaves exactly as before; phones still get Add-to-Home-Screen via the manifest.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The worker's fetch strategy is three-tier. <Mono>/api/*</Mono> is never intercepted: data reads, writes, and the SSE stream must always reach the host — freshness beats offline support. Hashed build assets (<Mono>/assets/*</Mono>, fonts, images) are cache-first in a single <Mono>foreman-v1</Mono> cache, which is safe because Vite content-hashes every filename. Navigations are network-first with the cached shell as fallback, so a fresh deploy is picked up on the next load but the app still opens when the host is briefly unreachable. <Mono>install</Mono> calls <Mono>skipWaiting()</Mono>; <Mono>activate</Mono> deletes stale caches and claims open clients.
        </p>
      </ArchSection>

      {/* ── Stack ───────────────────────────────────────────────────────────── */}
      <ArchSection id="arch-stack" label="Stack" heading="Built With" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            ["React 18", <>UI layer, rendered under <Mono>StrictMode</Mono> from <Mono>src/main.jsx</Mono>. No router — navigation is a state variable (see App Structure).</>],
            ["Zustand 5", <>Global state. One store (<Mono>lib/store.js</Mono>) with named slices and write-through persistence; detailed under State Management.</>],
            ["Vite 6", <>Build tool and dev server. <Mono>base: "./"</Mono> lets the same bundle run from Electron's <Mono>file://</Mono>, the LAN server, or any subpath; <Mono>strictPort: 5173</Mono> so <Mono>electron:dev</Mono> can wait on it; a <Mono>define</Mono> shim pins <Mono>process.env.DRAGGABLE_DEBUG</Mono> because react-draggable reads it at drag-start and would throw in the browser (<Mono>vite.config.js</Mono>).</>],
            ["Electron 42", <>Native Windows shell: <Mono>electron/main.cjs</Mono> (window, tray, IPC, LAN server lifecycle, <Mono>foreman://</Mono> protocol), <Mono>preload.cjs</Mono> (the entire renderer↔main API surface via <Mono>contextBridge</Mono>, with <Mono>contextIsolation</Mono> on and <Mono>nodeIntegration</Mono> off), <Mono>storageFile.cjs</Mono> (file backend + backups). Packaged by electron-builder 26 (NSIS target, <Mono>electron-dist/</Mono> output) via <Mono>npm run electron:build</Mono>.</>],
            ["idb-keyval 6", <>Minimal IndexedDB wrapper — the browser backend behind <Mono>lib/storage.js</Mono>. Replaced localStorage to remove its size ceiling.</>],
            ["TipTap 3", <>Rich-text editor powering the Notebook (<Mono>@tiptap/react</Mono>, starter kit, placeholder extension, plus <Mono>tiptap-markdown</Mono> for markdown round-tripping).</>],
            ["pdfjs-dist 5", <>Local, in-browser text extraction from uploaded equipment manuals (<Mono>lib/pdfExtract.js</Mono>). No file content leaves the device.</>],
            ["react-grid-layout 2.2", <>The Dashboard's draggable, resizable card grid.</>],
            ["Recharts 3", <>Charting on the Dashboard and Finances pages.</>],
            ["react-datepicker 9", <>Date entry, reskinned to the design system by <Mono>src/datepicker-theme.css</Mono>.</>],
            ["qrcode 1.5", <>Renders the multi-device pairing QR code in Preferences.</>],
            ["Inter / Newsreader / JetBrains Mono", <>The three typefaces, loaded via <Mono>@import</Mono> in <Mono>src/styles/theme.css</Mono>.</>],
          ].map(([name, desc]) => (
            <div key={name}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500 }}>{name}</span>
              <span style={{ ...bodyText, display: "inline" }}> — {desc}</span>
            </div>
          ))}
        </div>
        <p style={{ ...bodyText, marginTop: "1rem", color: "var(--fm-ink-mute)" }}>
          No backend framework, no database server, no authentication layer, no external API required for core functionality. Scripts: <Mono>npm run dev</Mono> (browser), <Mono>electron:dev</Mono> (chains Vite and Electron via concurrently + wait-on), <Mono>build</Mono>, and <Mono>electron:build</Mono>.
        </p>
      </ArchSection>

      {/* ── Structure ───────────────────────────────────────────────────────── */}
      <ArchSection id="arch-structure" label="Architecture" heading="Application Structure & Boot" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman is a single-page app with 21 registered page keys (<Mono>PAGE_KEYS</Mono> in <Mono>src/App.jsx</Mono>), rendered by page components that live at the repository root (<Mono>home-maintenance.jsx</Mono>, <Mono>inventory-page.jsx</Mono>, <Mono>workbench-page.jsx</Mono>, …). Several keys share a component: <Mono>alerts</Mono> and <Mono>workbench</Mono> both render <Mono>workbench-page.jsx</Mono>, <Mono>timeline</Mono> renders <Mono>guide-page.jsx</Mono> pre-set to its Timeline tab, and <Mono>lifecycle-page.jsx</Mono> exports four pages (Spending, Forecast, Mortgage, Item Lifespans).
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Navigation is a state variable, not a router: the whole app runs at a single URL with no history management. <Mono>navigate(pageOrKey, navState)</Mono> accepts either a key (<Mono>dashboard</Mono>) or a display title (<Mono>Dashboard</Mono>); <Mono>navState</Mono> is a per-navigation payload pages read on mount — pre-opening an Add modal, preselecting a record, choosing a tab. <Mono>FmNavContext</Mono> (<Mono>src/context/FmNavContext.js</Mono>) exposes <Mono>{"{ current, navigate }"}</Mono> to any component. Everything renders inside an <Mono>ErrorBoundary</Mono>, and <Mono>App.jsx</Mono> also subscribes to Electron <Mono>foreman://</Mono> deep links (<Mono>window.foreman.onDeepLink</Mono> → <Mono>navigate</Mono>) and to remote storage changes from other devices.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>The boot sequence in <Mono>src/main.jsx</Mono> is strictly ordered:</p>
        <div style={stack}>
          <ArchRow name="1 · Hydrate"><Mono>await storageInit()</Mono> — backend detection and cache hydration, described under Storage.</ArchRow>
          <ArchRow name="2 · Migrate"><Mono>loadFpData()</Mono> runs before <Mono>loadRooms()</Mono> because the floor-plan v3 migration writes fresh room IDs; a floor-recovery pass rebuilds levels orphaned by old builds; <Mono>migrateCfvSplit()</Mono> splits the legacy custom-field store into the spatial and item stores; entity-type migrations and stable-key normalization follow (<Mono>lib/migration.js</Mono>, <Mono>lib/entityTypes.js</Mono>).</ArchRow>
          <ArchRow name="3 · Theme">The saved theme and density are stamped onto <Mono>document.documentElement.dataset</Mono> before render, so there is no flash of the default theme.</ArchRow>
          <ArchRow name="4 · Populate"><Mono>useForemanStore.getState().reloadAll()</Mono> fills every store slice from the now-correct cache.</ArchRow>
          <ArchRow name="5 · Render"><Mono>createRoot(...).render(&lt;App /&gt;)</Mono>.</ArchRow>
        </div>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Every page shares the same chrome: <Mono>FmHeader</Mono> (top bar — Workbench, Dashboard, and Calendar as direct links; Property, Finances, and Work as dropdown groups) and <Mono>FmSubnav</Mono> (page tabs and stat counters). The global Command Palette (<Mono>components/CommandPalette.jsx</Mono>, ⌘K / Ctrl-K) mounts above the pages in <Mono>App.jsx</Mono>. Its index is built by <Mono>buildCommandIndex()</Mono> in <Mono>lib/commandIndex.js</Mono>, which flattens pages, inventory items, maintenance tasks, chores, services, utilities, and projects into one searchable list; <Mono>rankCommands()</Mono> scores five tiers — label prefix, word-start, substring, sublabel/keyword, and a subsequence fuzzy match ("wh" finds Water Heater). Static <Mono>COMMAND_ACTIONS</Mono> deep-link into add-modals via <Mono>navState</Mono>.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>Code is organized into four layers:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--fm-hairline2)" }}>
          {[
            ["lib/store.js", "The global Zustand store — slices, write-through actions, selectors. Pages read via subscriptions; store actions handle all cross-page writes. Calling load*() directly in a page is a code smell."],
            ["lib/", "67 data-utility modules, one per domain (chores.js, ledger.js, budgetForecast.js, geometry.js, …). Pure functions with no React: they read/write through storage.js, parse and format values, and compute derived results."],
            ["components/", "38 domain components: the maintenance table, detail modals and panels, schedule pickers, filter pills, the command palette."],
            ["src/components/", "Design-system primitives shared by every page: FmHeader, FmSubnav, FmCard, FmStatusDot, FmSysTag, FmCaps, FmSectionLabel."],
          ].map(([name, desc]) => (
            <div key={name}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem" }}>{name}</span>
              <span style={{ ...bodyText, display: "inline" }}> {desc}</span>
            </div>
          ))}
        </div>
      </ArchSection>

      {/* ── State ───────────────────────────────────────────────────────────── */}
      <ArchSection id="arch-state" label="State" heading="State Management" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          A single Zustand store — <Mono>useForemanStore</Mono> in <Mono>lib/store.js</Mono> — holds every cross-page slice: <Mono>rooms</Mono>, <Mono>floors</Mono>, <Mono>fpData</Mono>, <Mono>spatialAssignments</Mono>, <Mono>itemFieldValues</Mono>, <Mono>inventory</Mono>, <Mono>projects</Mono>, <Mono>chores</Mono>, <Mono>services</Mono>, <Mono>expenses</Mono>, <Mono>lifespanOverrides</Mono>, <Mono>supplies</Mono>, <Mono>utilities</Mono>, <Mono>sessions</Mono>, <Mono>budget</Mono>, and <Mono>entityTypes</Mono>, plus per-page UI state. It initializes to safe empty defaults and is populated by <Mono>reloadAll()</Mono> once storage is ready.
        </p>
        <div style={stack}>
          <ArchRow name="Write-through actions">Every mutation persists inside the action itself — <Mono>addProject()</Mono> calls <Mono>saveProjects()</Mono> and updates the slice in the same <Mono>set()</Mono>; there is no separate save step, so the UI can never get ahead of storage. Domain modules (<Mono>lib/services.js</Mono>, <Mono>lib/utilities.js</Mono>, <Mono>lib/budget.js</Mono>, …) export pure add/update/delete helpers that the store wraps, keeping business logic out of React.</ArchRow>
          <ArchRow name="One routing seam for item details"><Mono>setCustomField(stableKey, fieldId, value)</Mono> checks <Mono>SPATIAL_FIELD_NAMES</Mono>: location fields write to the <Mono>spatialAssignments</Mono> slice (<Mono>foreman-spatial-assignments</Mono>), everything else to <Mono>itemFieldValues</Mono> (<Mono>foreman-item-field-values</Mono>). Inventory, the Floor Plan, and the Notebook all write through this one action — which is why a spec edited on any page appears on every other.</ArchRow>
          <ArchRow name="reloadAll() as universal resync">Called at boot, after profile switches and imports, and whenever a multi-device delta lands (<Mono>onStorageRemoteChange</Mono> → <Mono>reloadAll()</Mono> in <Mono>App.jsx</Mono>). Internal order matters: <Mono>loadFpData()</Mono> precedes <Mono>loadRooms()</Mono> because the fpData migration can create rooms, and <Mono>runBackfillMigration()</Mono> backfills <Mono>spatialAssignments</Mono> from legacy <Mono>fpData.zoneItems</Mono> records.</ArchRow>
          <ArchRow name="Selectors"><Mono>selectZoneItems</Mono> groups assignments by zone label (replacing all legacy <Mono>fpData.zoneItems</Mono> reads); <Mono>selectAllFieldValues</Mono> merges both field slices per key, with a documented caveat to prefer two separate subscriptions in hot components so each slice re-renders independently.</ArchRow>
          <ArchRow name="Per-page UI state"><Mono>usePageUIState(pageId)</Mono> persists each page's active tab, sort, and filters under <Mono>foreman-page-ui-state</Mono>, so view configuration survives navigation and reloads. When a page has no stored state it returns a module-level <Mono>_EMPTY_PAGE_UI</Mono> constant, keeping Zustand's <Mono>Object.is</Mono> selector comparison stable and avoiding spurious re-renders on every store update.</ArchRow>
        </div>
      </ArchSection>

      {/* ── Data model ──────────────────────────────────────────────────────── */}
      <ArchSection id="arch-datamodel" label="Data" heading="The Data Model" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <ArchBlock title="Maintenance tasks">
            <p style={bodyText}><Mono>data/maintenance.json</Mono> ships 164 default task rows, each <Mono>{"{ category, categoryType, item, task, schedule }"}</Mono>. <Mono>loadData()</Mono> in <Mono>lib/data.js</Mono> merges three layers at read time: the defaults (assigned <Mono>_id: "default-{"{idx}"}"</Mono> and a composite <Mono>_defaultKey</Mono> of <Mono>category|item|task</Mono>), sparse per-row edits from <Mono>foreman-overrides</Mono> keyed by that composite, and user-created rows from <Mono>foreman-custom-data</Mono>; <Mono>foreman-use-default-data</Mono> can exclude the defaults entirely. The composite key is the stable reference that completion dates (<Mono>maintenance-dates</Mono>), next-due dates (<Mono>maintenance-next-dates</Mono>), notes, follow flags, and per-completion records all join on.</p>
          </ArchBlock>
          <ArchBlock title="Inventory">
            <p style={bodyText}>A state map under <Mono>foreman-inventory</Mono>: each category and item carries a status of included, hidden, or archived. Items are referenced by a stable key from <Mono>getItemStableKey()</Mono> (<Mono>lib/itemKeys.js</Mono>) — a generated ID for custom items (<Mono>custom-1748abc</Mono>) or a <Mono>default:</Mono> prefix for built-ins — so renaming an item never breaks associated data.</p>
            <p style={{ ...bodyText, marginTop: "0.6rem" }}>Associated data splits across two stores keyed by stable key. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Spatial assignments</span> (<Mono>foreman-spatial-assignments</Mono>) record which room or exterior zone each item is placed in — what the Floor Plan and location groupings read. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Item field values</span> (<Mono>foreman-item-field-values</Mono>) hold detail fields: manufacturer, model, serial, warranty expiry, install date, item type. Both are store slices, so writes on any page propagate everywhere.</p>
          </ArchBlock>
          <ArchBlock title="Notebook articles">
            <p style={bodyText}>Each inventory item has one free-form article, its body stored under <Mono>foreman-guide-notes</Mono> keyed by <Mono>category|item</Mono>. Standalone articles live in <Mono>foreman-standalone-articles</Mono> with bodies in the same notes store under <Mono>standalone:&lt;id&gt;</Mono> keys. Each article's classification — item, location, system, project, task — lives in <Mono>foreman-article-associations</Mono> (<Mono>lib/articleAssociations.js</Mono>); derived associations are read live from the item rather than copied. The specs shown on an article are <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>not</span> stored with the note: editing them writes through the same <Mono>setCustomField</Mono> action and the same stable-key stores Inventory uses, so a spec changed on either page appears on the other automatically. Sidebar organization is its own small state: grouping mode in <Mono>foreman-notebook-grouping</Mono> and, in custom mode, drag order in <Mono>foreman-notebook-order</Mono> (<Mono>lib/notebookOrg.js</Mono>).</p>
          </ArchBlock>
          <ArchBlock title="Floor plan">
            <p style={bodyText}>The home's spatial structure spans three stores. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Levels</span> (<Mono>foreman-floors</Mono>, <Mono>lib/floors.js</Mono>) are an ordered list, each with a <Mono>kind</Mono> — floor, basement, attic, roof, or yard — that sets sort position and uniqueness (floors are numbered and repeatable; the rest are singletons). <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Rooms</span> (<Mono>foreman-rooms</Mono>, <Mono>lib/rooms.js</Mono>) are the zones placed on those levels — label, level, contained items, and an optional <Mono>use</Mono> (bedroom, full / ¾ / half bath, kitchen, …) that drives the bed/bath and finished-area rollups in the Property Details panel. Drawn zone polygons and on-canvas markers persist under the historical <Mono>fp-data</Mono> key (<Mono>lib/fpData.js</Mono>). Only zones whose category resolves to the spatial room class count toward finished living area; garages, basements, attics, and yards are tracked but excluded.</p>
            <p style={{ ...bodyText, marginTop: "0.6rem" }}>Zones are created four ways, all producing the same polygon record: parametric shapes (rectangle, L, or U, sized in feet at 20 canvas units per foot); dimension entry, which auto-arranges a typed room into the first free spot; freehand tracing; or address import (opt-in Online Mode), which geocodes via OpenStreetMap Nominatim (<Mono>lib/buildingFootprint.js</Mono>) and projects the returned building footprint into canvas units. The footprint is stored as the plan's single <Mono>outline</Mono> (<Mono>fp-data.outline</Mono>) — a scaffold drawn on every floor, never a room, never counted toward area. During drags, edges magnetically snap to neighboring zones (<Mono>lib/geometry.js</Mono>) so rooms share walls cleanly.</p>
          </ArchBlock>
          <ArchBlock title="Chores">
            <p style={bodyText}>Objects with unique IDs under <Mono>foreman-chores</Mono> (<Mono>lib/chores.js</Mono>). Schedules use a human-readable string format ("every 1 weeks", "every 3 months"), parsed by <Mono>lib/scheduleInterval.js</Mono>; each chore carries an optional duration estimate the Workbench reads and writes as a shared value. Next occurrences and per-occurrence completion records — who, when, notes — live in separate keys (<Mono>chore-next-dates</Mono>, <Mono>foreman-chore-completion-records</Mono>; see <Mono>lib/choreCompletions.js</Mono>) linked by chore ID. Unlike maintenance, chores keep every occurrence, not just the most recent.</p>
          </ArchBlock>
          <ArchBlock title="Services">
            <p style={bodyText}>Stored under <Mono>foreman-services</Mono> (<Mono>lib/services.js</Mono>) as two sub-maps: <Mono>services</Mono> (id → Service) and <Mono>visits</Mono> (id → ServiceVisit). A Service carries provider, phone, category (fixed 15-item taxonomy plus "Other"), cost, billing cycle, renewal date, auto-renew flag, a "paying since" date, and a <Mono>costHistory</Mono> of dated cost segments — a price change applies only from its effective date forward, leaving past Ledger months untouched. A ServiceVisit records date, technician, notes, and an optional cost override that also corrects that month's generated charge (<Mono>lib/serviceCharges.js</Mono>). Monthly cost normalizes from the billing cycle — annual ÷ 12, quarterly ÷ 3, one-time excluded.</p>
          </ArchBlock>
          <ArchBlock title="Utilities">
            <p style={bodyText}>Mirrors Services: <Mono>foreman-utilities</Mono> (<Mono>lib/utilities.js</Mono>) holds <Mono>utilities</Mono> (id → Utility) and <Mono>bills</Mono> (id → Bill). A Utility carries type, provider, account number, usage unit, an optional typical monthly amount, a payment cycle (monthly through annually), and a due day; a Bill holds billing period, amount, optional usage, due date, and paid flag. Estimated monthly cost is the trailing-12-month average divided by the cycle length, so a bimonthly or annual bill reads as a steady monthly expense rather than a lump.</p>
          </ArchBlock>
          <ArchBlock title="Expenses & the Ledger">
            <p style={bodyText}>A flat map under <Mono>foreman-expenses</Mono> (<Mono>lib/expenses.js</Mono>), each expense recording date, amount, description, an optional <Mono>linkedItem</Mono> (inventory stable key, for system/room rollups) and <Mono>linkedWork</Mono> (a <Mono>{"{ kind, id }"}</Mono> pointing at a project or to-do). <Mono>lib/ledger.js</Mono> consolidates expenses, utility bills, generated service charges, inventory purchases, and mortgage payments into one transaction list — computing a trailing-12-month repairs total and rolling spend up by type, system/room, and project.</p>
          </ArchBlock>
          <ArchBlock title="Expected lifespan">
            <p style={bodyText}>Curated default service lives live in code (<Mono>lib/lifespans.js</Mono>), keyed by item name; the Default Values tab overrides a type's default via <Mono>foreman-lifespan-overrides</Mono>. A specific item's lifespan is an <Mono>estimated_lifespan</Mono> custom field seeded from the type default at creation; the replacement forecast prefers the item's own value and falls back to the type default.</p>
          </ArchBlock>
          <ArchBlock title="Forecast (cash-flow projection)">
            <p style={bodyText}><Mono>foreman-budget</Mono> stores only what the user sets — a monthly <Mono>target</Mono>, two run-rate toggles (<Mono>includeReserve</Mono>, <Mono>includeRepairsBaseline</Mono>), <Mono>planned</Mono> one-off items keyed by <Mono>YYYY-MM</Mono>, and the mortgage model. The 12-month projection itself is derived at read time by <Mono>lib/budgetForecast.js</Mono>: services projected from each contract's billing cycle and renewal anchor, a seasonal per-calendar-month average of logged utility bills, reserve and repairs baselines spread evenly, planned items, and warranty expiries riding along as non-dollar risk markers. The mortgage is modelled as a recurring bill — <Mono>defaultMonthly</Mono> filling un-overridden months, a per-month <Mono>overrides</Mono> map, and an <Mono>escrowMonthly</Mono> split of principal &amp; interest versus taxes &amp; insurance — and kept out of the operating run-rate, surfacing separately as total monthly outlay.</p>
          </ArchBlock>
          <ArchBlock title="Supplies">
            <p style={bodyText}><Mono>foreman-supplies</Mono> holds two sub-maps: <Mono>tracked</Mono> (keyed by the consuming maintenance task's composite key) with on-hand count, reorder threshold, and product URL for auto-derived consumables; <Mono>manual</Mono> for fully user-defined supplies. The list itself is derived at read time from a curated catalog in <Mono>lib/supplies.js</Mono> joined to inventory specs and maintenance cadence, so it stays in sync without duplicating data.</p>
          </ArchBlock>
          <ArchBlock title="Work sessions">
            <p style={bodyText}><Mono>foreman-sessions</Mono> (<Mono>lib/sessions.js</Mono>) maps id → Session: title, assignee, status (active / done / abandoned), timestamps, and an array of SessionItems — each referencing its source task (maintenance composite key, chore id, or to-do id) alongside a snapshot of its label and room so History still renders if the source is later renamed or deleted. Items record a per-item result (done / skipped / blocked), notes, and any spawned blocker to-do. Completions made in a session write the same records as completing the task on its home page — the session is purely additive bookkeeping.</p>
          </ArchBlock>
          <ArchBlock title="Images">
            <p style={bodyText}>All photo attachments pass through <Mono>lib/images.js</Mono>: resized on a canvas to at most 1400&nbsp;px and re-encoded as JPEG (quality 0.82), then stored as data URLs under the single <Mono>foreman-images</Mono> key — the one key the desktop backend partitions into its own <Mono>images.json</Mono> so the main data file stays small.</p>
          </ArchBlock>
          <ArchBlock title="Profiles & export">
            <p style={bodyText}><Mono>lib/profiles.js</Mono> defines <Mono>PROFILE_DATA_KEYS</Mono> — the explicit manifest of every storage key a profile snapshot or export contains. Device-identity keys (<Mono>foreman-household-id</Mono>, <Mono>foreman-sync-secret</Mono>) are deliberately excluded so switching profiles never severs the reminder Worker pairing. Legacy keys stay in the manifest so old export files round-trip correctly.</p>
          </ArchBlock>
          <ArchBlock title="Entity types">
            <p style={bodyText}>The categorization system (<Mono>lib/entityTypes.js</Mono>). Built-in types (room, exterior, system, HVAC, plumbing, electrical, safety, structure) each belong to a behavioral class — spatial (location-based) or functional (system-based) — which controls how categories are grouped and filtered on every page. Users can define custom types that extend the built-in hierarchy.</p>
          </ArchBlock>
        </div>
      </ArchSection>

      {/* ── Design ──────────────────────────────────────────────────────────── */}
      <ArchSection id="arch-design" label="Design" heading="Design System" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The entire visual language is 37 CSS custom properties declared in <Mono>src/styles/theme.css</Mono>. Every color, font, spacing value, border, and radius in the app references a token; no hardcoded values appear in component code.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          {[
            ["Backgrounds", "Four depth levels: --fm-bg (base), --fm-bg-raised, --fm-bg-panel, --fm-bg-sunk"],
            ["Borders", "--fm-hairline and --fm-hairline2 line weights; --fm-border / --fm-border-2 as composite shorthands"],
            ["Text", "Three levels: --fm-ink (primary), --fm-ink-dim (secondary), --fm-ink-mute (placeholder/disabled)"],
            ["Brass accent", "--fm-brass, --fm-brass-dim, --fm-brass-bg — all active states, focus rings, interactive highlights"],
            ["Status colors", "--fm-red (overdue), --fm-amber (due soon), --fm-green (on schedule), --fm-cyan (utility/in-progress), --fm-purple (reserved)"],
            ["Typography", "--fm-serif (Newsreader), --fm-sans (Inter), --fm-mono (JetBrains Mono)"],
            ["Spacing", "A 10-step scale from 4px to 30px (--fm-spacing-xs through --fm-spacing-5xl)"],
            ["Radius & tags", "--fm-radius (2px), --fm-radius-lg (3px); --fm-tag-size / -spacing / -padding for mono caps labels"],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", minWidth: "120px", paddingTop: "0.15rem" }}>{name}</span>
              <p style={{ ...bodyText, fontSize: "0.8rem" }}>{desc}</p>
            </div>
          ))}
        </div>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The brass color (#c9a96e) anchors the identity. Three typefaces divide the hierarchy: Newsreader for display headings, Inter for body content, JetBrains Mono for labels, tags, filter pills, and data-dense UI.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The two alternate themes are pure token-override blocks — <Mono>:root[data-theme="daylight"]</Mono> and <Mono>:root[data-theme="obsidian"]</Mono> in the same file redefine only the variables (Daylight also softens radii to 4/5&nbsp;px; Obsidian swaps brass for indigo); nothing outside <Mono>theme.css</Mono> changes. Theme and density are stamped onto the root element in <Mono>src/main.jsx</Mono> before React renders, so there is no flash of unstyled content. Density (<Mono>:root[data-density]</Mono>) scales the root font size — Compact 14px, Default 16px, Comfortable 18px — which propagates through every <Mono>rem</Mono>-based measurement in the app.
        </p>
      </ArchSection>

      {/* ── Integrations ────────────────────────────────────────────────────── */}
      <ArchSection id="arch-integrations" label="Integrations" heading="External Integrations" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <ArchBlock title="Reminders (Cloudflare Worker)">
            <p style={bodyText}>The <Mono>worker/</Mono> directory is a self-contained Cloudflare Worker (<Mono>worker/src/index.js</Mono>, configured by <Mono>wrangler.toml</Mono>) backed by Workers KV. The frontend (<Mono>lib/reminders.js</Mono>) POSTs a snapshot of upcoming due dates to <Mono>/sync</Mono>, authenticated by a household ID + sync secret generated locally and registered in KV on first sync. A cron trigger fires hourly (<Mono>0 * * * *</Mono>); the scheduled handler dispatches only households whose stored <Mono>sendHourUtc</Mono> matches the current UTC hour — effectively a daily Discord digest at each household's chosen local time, recomputed across DST. <Mono>/dispatch</Mono> fires a digest on demand, and webhook URLs are validated against the same Discord regex on both ends. The Worker only ever sees next-due summaries, never full data.</p>
          </ArchBlock>
          <ArchBlock title="AI Inspection (Groq)">
            <p style={bodyText}><Mono>lib/inspectionGroq.js</Mono> sends inspection photos to Groq's chat-completions API (<Mono>llama-3.3-70b-versatile</Mono>) and parses a structured JSON list of findings back into the review flow (<Mono>components/InspectionReview.jsx</Mono>). Requires a user-supplied Groq API key in Preferences and is entirely opt-in — one of only two features that send data off-device.</p>
          </ArchBlock>
          <ArchBlock title="Address import (OpenStreetMap)">
            <p style={bodyText}>The other: in the Floor Plan's opt-in Online Mode, <Mono>lib/buildingFootprint.js</Mono> geocodes the household address against OpenStreetMap Nominatim and projects the returned building footprint into canvas units to seed the plan outline. Only the address string is transmitted.</p>
          </ArchBlock>
          <ArchBlock title="PDF parsing (local)">
            <p style={bodyText}>Equipment manuals uploaded as PDFs are parsed entirely in-browser by <Mono>pdfjs-dist</Mono> (<Mono>lib/pdfExtract.js</Mono>); no file content is transmitted. Extracted text is searchable when setting up inventory items or maintenance tasks.</p>
          </ArchBlock>
        </div>
      </ArchSection>
    </div>
  );
}

// ─── Development Roadmap tab ───────────────────────────────────────────────────

const ROADMAP_SECTIONS = [
  // Top Priority — gate adoption/shipping or are pervasive, high-leverage wins.
  { id: "road-setup",     label: "Home Setup Wizard",      group: "Top Priority" },
  { id: "road-electron",  label: "Windows App",            group: "Top Priority" },
  { id: "road-undo",      label: "Undo & Restore",         group: "Top Priority" },
  { id: "road-complete",  label: "Complete Anywhere",      group: "Top Priority" },
  // Medium Priority — clear value, build on existing foundations, not gating.
  { id: "road-gcal",      label: "Google Calendar",        group: "Medium Priority" },
  { id: "road-vault",     label: "Document Vault",         group: "Medium Priority" },
  { id: "road-handoff",   label: "Handoff Export",         group: "Medium Priority" },
  { id: "road-emergency", label: "Emergency Reference",    group: "Medium Priority" },
  { id: "road-seasonal",  label: "Seasonal Playbooks",     group: "Medium Priority" },
  { id: "road-household", label: "Household & Assignments", group: "Medium Priority" },
  { id: "road-qr",        label: "QR Labels",              group: "Medium Priority" },
  { id: "road-mobile",    label: "Mobile App",             group: "Medium Priority" },
  // Low Priority — niche, advanced, or heavy/speculative builds.
  { id: "road-advisor",   label: "AI Advisor",             group: "Low Priority" },
  { id: "road-ha",        label: "Home Assistant",         group: "Low Priority" },
  { id: "road-gla",       label: "GLA Measurements",       group: "Low Priority" },
  { id: "road-wrapped",   label: "Year in Review",         group: "Low Priority" },
  { id: "road-furniture", label: "Furniture Planning",     group: "Low Priority" },
];

function RoadmapTab() {
  const { activeSection, sectionRefs, scrollTo } = useToc(ROADMAP_SECTIONS);

  return (
    <div>
      <TocNav sections={ROADMAP_SECTIONS} activeSection={activeSection} onSelect={scrollTo} />

      <RoadGroupHeader label="Top Priority" first />

      <ArchSection id="road-setup" label="Onboarding" heading="Home Setup Wizard" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          Foreman ships with 421 default maintenance tasks, a ~90-type expected-lifespan table, and a deep category tree — but a new home starts empty, and populating inventory, the floor plan, and the right schedule is the steepest cliff in the app. The Setup Wizard turns that cold start into a guided ten-minute pass, drawing on the defaults already in the codebase rather than asking you to build from scratch.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Profile your home", "A short guided flow captures the essentials — home type, year built, square footage, stories, and the systems you actually have (gas vs. electric, well vs. municipal water, septic vs. sewer, central air vs. none) — the answers that decide which of the built-in tasks are relevant to you."],
            ["Prune, don't dump", "Rather than dropping every default task on you at once, the wizard includes only what fits your answers and hides the rest — no tankless flush if you don't have one, no well-pump service on municipal water — so the maintenance list starts honest and uncluttered, true to the calm tenet."],
            ["Seed the structure", "Generates your floors, the common rooms for your home type, and a starter inventory of the systems every home has — HVAC, water heater, electrical panel, detectors — each ready to fill in with a model number and install date as you find them."],
            ["Resumable and re-runnable", "Every step is optional and the flow is resumable: lay the bones in ten minutes and come back for specifics. Existing users can re-run it to fold in a newly finished basement or a system they didn't have before, without disturbing what's already entered."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-electron" label="Distribution" heading="Windows Desktop App" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The core Electron work is shipped. Foreman runs as a native Windows desktop app: data lives in Documents\Foreman\data.json (written via atomic temp+rename), rolling backups land in Documents\Foreman\backups\ on an hourly/daily/weekly retention schedule, and the system tray, native file dialogs, OS notification bridge, and foreman:// protocol handler are all wired up. The browser dev build (npm run dev) continues to use IndexedDB unchanged — the file backend only activates when window.foreman.isElectron is true, detected at module load in lib/storage.js. Three items remain before this is fully distributable.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            [`NSIS installer (blocked by OneDrive)`, `The electron-builder config is in place — the “build” field in package.json targets win/nsis and the electron:build script runs vite build then electron-builder. The build currently fails with EPERM: operation not permitted on a temp-to-final rename because OneDrive's sync process locks files mid-write inside the project directory. Fix option A: pause OneDrive sync before running npm run electron:build. Fix option B: set the output directory outside OneDrive by adding “directories”: { “output”: “C:/Temp/foreman-build” } to the build config in package.json. Also needed before release: a proper app icon at assets/icon.ico (256x256 minimum, referenced as “icon”: “assets/icon.ico” in the win block of the build config) to replace the current placeholder PNG. A code-signing certificate (DigiCert, Sectigo, or equivalent) is needed to suppress the Windows Defender SmartScreen warning on first install — without it users see “Windows protected your PC” on every fresh install. The electron-builder win block accepts certificateFile and certificatePassword fields, or use the electron-windows-sign package for PKCS#12 or Azure Key Vault signing.`],
            [`Auto-update`, `Not yet implemented. The bridge is already stubbed: preload.cjs exposes onUpdateStatus(cb) for the renderer to subscribe to, and the comment in preload.cjs marks it as a Phase 4 item. Implementation: add electron-updater as a runtime dependency (npm install electron-updater — note: runtime, not devDependency). In electron/main.cjs, require autoUpdater from electron-updater and call autoUpdater.checkForUpdatesAndNotify() inside app.whenReady() after the window is created. Add a publish block to the build config in package.json: { “provider”: “github”, “owner”: “root-house-code”, “repo”: “Foreman” }. Push a GitHub Release with the built installer and its .yml manifest attached; electron-updater compares the installed version string against the latest.yml on GitHub on every startup. Wire autoUpdater events (update-available, update-downloaded, error) through ipcMain to the renderer via ipcRenderer.on(“update-status”) and surface them as a dismissible banner. Important: auto-update on Windows requires the installer to be code-signed — unsigned builds silently fail the update check.`],
            [`Item-level deep links for QR scanning`, `The foreman:// protocol is registered and page-level routing works — foreman://inventory opens the Inventory page. What is missing is sub-page routing for specific records, which is the useful case for QR code labels printed on appliances or rooms. The handleDeepLink function in electron/main.cjs already forwards the full URL string to the renderer via mainWindow.webContents.send(“deep-link”, url). The onDeepLink effect in src/App.jsx currently extracts only parsed.hostname as the page key. Extend it to also read the pathname: for a URL like foreman://inventory/item-id-abc, hostname is “inventory” and pathname is “/item-id-abc” — pass { deepLinkId: “item-id-abc” } as navState to navigate(). Each page that supports deep linking then reads navState?.deepLinkId on mount and selects the matching record, opening its detail panel. InventoryPage already accepts navState for similar pre-selection patterns. The same pattern extends to maintenance tasks, chores, rooms, or any entity with a stable string id.`],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-undo" label="Trust" heading="Undo & Restore" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Every history tab now has permanent delete, and Inventory, the Floor Plan, and Projects all carry destructive actions — each guarded only by a confirmation dialog. Meanwhile the desktop app writes rolling backups (hourly / daily / weekly) that are invisible from inside the app: restoring one means finding Documents\Foreman\backups\ and hand-copying a file. For the honest / durable / earns-trust tenets, deletion with no recovery is the weakest link in the core. Two pieces close it, both cheap because every destructive action already flows through the storage layer.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Undo toast", "Snapshot a key's prior value at the storageSet layer before each destructive write and offer “Deleted X — Undo” for ~10 seconds. One generic mechanism covers every page — history records, inventory items, zones, projects — with no per-page code."],
            ["Backups browser", "A Preferences panel that lists the desktop app's rolling backups with dates and preview counts (items, records), and restores one in a click — taking its own pre-restore snapshot first so a restore is itself undoable."],
            ["Browser-build parity", "The same restore UI runs over the existing profile-snapshot mechanism in the browser build, so recovery isn't a desktop-only privilege."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-complete" label="Logging" heading="Complete Anywhere" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Logging a completed task is the most frequent action in Foreman, but it's only fully available on a task's home page or inside a Workbench session. The Calendar shows the due chip, the Dashboard triage shows the overdue item, the Alerts tray names it, Item Lifespans shows the aging item — and in every one of those places you must navigate away to act. This closes that gap: wherever Foreman shows you due work, it lets you finish it.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Inline ✓ Done everywhere", "An inline complete affordance on every surface that displays a due or overdue task — Calendar chips, Dashboard triage rows, Alerts tray entries, and the item detail panel's Maintenance tab."],
            ["Same writers, same record", "Each surface reuses the exact completion flow that already exists — maintenance and chore completion records, supply decrement, next-date advance, multi-assignee prompt where relevant — so a completion logged from the Calendar is indistinguishable from one logged on the Maintenance page."],
            ["Tenet payoff", "Utility: you come with a problem and leave with it handled — wherever you happened to see the problem."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <RoadGroupHeader label="Medium Priority" />

      <ArchSection id="road-gcal" label="Google Calendar" heading="Google Calendar Integration" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          A Google Calendar integration is planned so that your maintenance schedule, chore due dates, and project deadlines appear alongside your existing calendar events — without requiring you to copy anything manually.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The integration is designed in two stages. The first is a .ics export: a standards-based calendar feed any application can subscribe to — Google Calendar, Apple Calendar, Outlook, and others. Subscribe once and your calendar stays current as due dates shift. The second stage is a direct Google Calendar push via OAuth, giving Foreman a dedicated calendar in your account that it updates as tasks are logged or rescheduled.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Events will carry enough context to be actionable: the category, item name, and task description, not just a bare "Maintenance Due" notification. The goal is that Foreman fits inside the tools your household already checks, rather than becoming another app to remember to open.
        </p>
      </ArchSection>

      <ArchSection id="road-vault" label="Documents" heading="Document Vault" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman already attaches receipts to inventory items and parses equipment manuals locally, but documents are scattered across individual items with no central place to store, search, or retrieve them. The Document Vault is a single repository for every piece of paper a home generates — kept local, like everything else in Foreman.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["One repository", "Receipts, warranties, permits, insurance policies, contractor contracts, inspection reports, appliance manuals, and material spec sheets — all in one searchable place instead of a drawer and three email accounts."],
            ["Linked, not siloed", "Every document attaches to an inventory item, project, service, or maintenance task. The contract for a roof replacement sits with both the Roof item and the project that installed it, reachable from either."],
            ["Expiry tracking", "Documents with a date — warranties, permits, insurance renewals — surface as Dashboard alerts and Calendar chips before they lapse, so the claim gets filed while it still counts."],
            ["Local-first and searchable", "Files are stored in IndexedDB alongside the rest of your data; nothing is uploaded. PDF text is extracted locally (via the existing PDF.js pipeline) to power full-text search across the whole vault."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-handoff" label="Export" heading="Handoff Export" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          A home's complete record is most valuable at the moment of transfer — selling the house, onboarding a new owner, filing an insurance claim, or handing a property manager the keys. The Handoff Export compiles everything Foreman knows into a single portable dossier, honoring the tenet that the registry should outlast the renovation.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Complete dossier", "Inventory with specs and install dates, full maintenance history, service contracts and visit logs, warranty status, cost-of-ownership summary, attached documents, and the floor plan — assembled into one record."],
            ["Two formats", "A polished PDF report for a person (buyer, agent, insurer) and a structured JSON export for importing into another Foreman instance, so a new owner inherits the live registry rather than a static printout."],
            ["Scoped and redactable", "Choose what leaves the device. A buyer gets maintenance history and specs; an insurer gets one item's purchase price, warranty, and receipts; a contractor gets the relevant system. You decide the scope per export."],
            ["Inherited knowledge", "The new owner imports the dossier and starts with decades of structured home knowledge already in place, instead of guessing when the water heater was installed."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-emergency" label="Emergency" heading="Emergency Quick-Reference" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          When something fails — a burst pipe, a gas smell, a tripped main — you need critical information immediately, not a search. A dedicated emergency view surfaces it in one tap, drawn almost entirely from data Foreman already holds.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Shutoffs at a glance", "Water main, gas, and electrical panel locations pinned on the floor plan — shutoff valves are already inventory items, so they just need surfacing front-and-center."],
            ["Emergency contacts", "Your plumber, electrician, and HVAC providers pulled from Services, each one tap to call when it matters."],
            ["What-to-do guides", "Concise, calm steps for common emergencies: no power, no water, gas smell, active leak, frozen pipes."],
            ["Critical specs", "Panel amperage, water-heater and main-valve type, fuel shutoffs — the numbers you can never find in a crisis, surfaced without digging."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-seasonal" label="Seasonal" heading="Seasonal Playbooks" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Homes run on seasons, and maintenance tasks already carry an optional season constraint — but nothing bundles seasonal work or reacts to actual conditions. Seasonal Playbooks bring the calendar of the seasons into the app, turning “I should probably winterize soon” into a scheduled, checked-off list.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Open / close checklists", "Curated spring and fall playbooks — gutter cleaning, hose-bib shutoff, HVAC changeover, detector battery checks, irrigation blow-out — scheduled as a set with a single tap rather than one task at a time."],
            ["Weather-aware triggers", "In Online Mode, the local forecast surfaces time-sensitive work: shut off exterior water before the first freeze, service the AC before the first heat wave, clear gutters once the leaves have dropped."],
            ["Regional timing", "Playbooks adapt to your climate — first and last frost dates, season lengths — so the prompts arrive at the right moment for where you actually live."],
            ["Built on what's here", "Reuses the season field already on maintenance tasks and the existing Online Mode gate for the network calls, so the foundation is already in place."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-household" label="Household" heading="Household & Assignments" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman is single-user today, but a home is run by a household. Chores and maintenance already record who completed the work — this builds that latent data into a first-class people model so the load can be shared and seen.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Household roster", "Define the people in your home, then assign chores, maintenance tasks, and to-dos to them. Assignment becomes a real relationship rather than a free-text name."],
            ["Per-person workload", "See what each member owns and has completed, so the work can be balanced rather than silently falling on one person."],
            ["Rotations", "Round-robin schedules for shared recurring chores — whose turn it is to take out the trash or clean the bathroom, advanced automatically as each occurrence is logged."],
            ["Accountability log", "The existing “who completed it” records on chores and maintenance roll up into a per-person history of contributions."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-qr" label="Inventory" heading="QR Labels for Inventory" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Every inventory item already carries the record you want when you're standing in front of it — model number, install date, warranty status, manual, and full maintenance history. QR labels close the last few feet between the physical thing and its data, so the answer is a phone-camera scan away instead of a search.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Print a label per item", "Generate a compact QR sticker for any inventory item — the water heater, the furnace, the panel — sized for a label printer or a sheet of address labels, with the item name printed alongside the code so it's legible without scanning."],
            ["Scan to the record", "Point any phone camera at the sticker to open that item straight to its Foreman page — specs, manual, warranty, and maintenance log — with no searching or menu diving. This depends on the deep-link routing also introduced for the mobile app, since the app runs at a single URL today."],
            ["Log from the thing", "The deep link lands with the item's actions in reach — log a completed task, add an expense, attach a photo — so the record gets updated at the moment and place the work actually happens, not later from memory at a desk."],
            ["Built on the catalog", "Reuses each item's existing stable key as the link target and the specs already on file for the printed label — a thin physical bridge over data that's already there, generated locally with no external service."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-mobile" label="Mobile" heading="Mobile App" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The native Android app is <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>shipped</span> (July 2026): a Kotlin shell around the same renderer as the desktop app — the <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>android/</span> directory is to the phone what <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>electron/</span> is to Windows. It runs standalone (full Foreman with on-device files, atomic writes, and rolling backups) or connected (QR-paired live window into the desktop host), with native notifications, <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>foreman://</span> deep links, and save/open dialogs. An iOS shell and the camera-first workflows below are what remains — designed around the moments when you're standing in front of the thing, not sitting at a desk:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Photo to project / to do", "Point your camera at something that needs attention, take a photo, and Foreman creates a draft project or to-do with the image attached. Add a note and you're done in under a minute."],
            ["AI-powered inspection mode", "Grant Foreman temporary access to your camera. Walk through your home as if doing a routine walk-through. Foreman captures images, analyzes them with an AI model, and returns a structured report of potential issues and maintenance recommendations. Projects and to-dos are auto-generated from the findings. Camera access is session-scoped and not stored between sessions."],
            ["Floorplan generation mode", "Grant Foreman temporary access to your camera and location. Walk each room and Foreman builds your floorplan and inventory as you go, using spatial estimation and image recognition. Camera and location data are used only during the active session to initialize your home's structure in Foreman."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <RoadGroupHeader label="Low Priority" />

      <ArchSection id="road-advisor" label="AI" heading="AI-Powered Home Advisor" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          A conversational AI advisor is planned as a dedicated page in Foreman, trained on trade knowledge across the major disciplines of residential construction and systems: HVAC, plumbing, electrical, roofing, structural, insulation, and finish work. The advisor is current on applicable building codes and standard maintenance intervals.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Unlike a general-purpose AI assistant, the Foreman advisor has full access to your home's specific data: your inventory, your maintenance history, your floor plan, and your existing projects. It can answer questions in context: "When is my water heater due for service?" or "I have 2x8 floor joists on 16-inch centers — what's my max span?" or "Is this crawl space photo showing a moisture problem?"
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The goal is the knowledgeable friend who has done every trade — the one you call before you call a contractor.
        </p>
      </ArchSection>

      <ArchSection id="road-ha" label="Integrations" heading="Home Assistant Integration" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Home Assistant is the leading open-source home automation platform, running locally in hundreds of thousands of households. The planned integration connects Foreman's maintenance and inventory data with Home Assistant's device registry and automation engine.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          In practice: when a smart device in Home Assistant registers an anomaly — an HVAC unit drawing more current than usual, a water sensor triggering, a filter indicator firing — Foreman can receive that signal and automatically create a maintenance task or to-do. In the other direction, completing a maintenance task in Foreman can trigger Home Assistant automations: resetting a filter timer, updating a device's service record, or notifying household members.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The integration is designed to work with the existing Home Assistant webhook and REST API system. No custom Home Assistant add-on is required.
        </p>
      </ArchSection>

      <ArchSection id="road-gla" label="GLA" heading="GLA Measurement Mode" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman's spatial model already separates areas that contribute to square footage (Rooms) from those that don't (Exteriors — garages, basements, attics, and outdoor areas), and surfaces the total as the “Finished area” in the floor plan's Property Details panel. That figure is an honest approximation, not an appraisal-grade measurement. This adds an opt-in mode, for advanced users, that brings the calculation in line with the real estate industry's Gross Living Area (GLA) standard — the same basis an appraiser or listing agent uses.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["Opt-in toggle", "GLA mode is off by default. A single switch in Preferences turns on the stricter measurement and display system, so the everyday experience stays simple while advanced users get appraisal-grade rigor when they want it."],
            ["ANSI Z765 rules", "Finished, heated, above-grade living space counts toward GLA; below-grade space (basements), garages, and unfinished areas (most attics) are measured and reported separately rather than folded into the headline number — matching how living area is defined for appraisals and listings."],
            ["Measured to standard", "Area is computed from exterior wall dimensions with ceiling-height minimums applied, and finished vs. unfinished status tracked per space, so the total is defensible against a real appraisal."],
            ["Honest display", "When enabled, the floor plan reports Gross Living Area alongside separate above-grade, below-grade, and garage subtotals, instead of a single summed figure — the breakdown a buyer or appraiser expects to see."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-wrapped" label="Recap" heading="Year in Review" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman already records everything a recap needs — completion records with people and durations, work sessions, expenses, service visits, project history, the streaks implicit in the Timeline — but nothing celebrates the work. A seasonal and annual recap turns the honest record into a reward, and recaps are a proven behavior loop: seeing the record grow is what keeps people keeping the record. The "Foreman is fun" tenet, made concrete.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.85rem" }}>
          {[
            ["The numbers that tell the story", "Tasks completed, hours invested, money spent versus replacement reserve funded, most-serviced item (“MVP: Furnace — 6 services”), busiest room, longest streak, and each household member's contribution — all derived read-time from records that already exist. Zero new data entry."],
            ["Seasonal and annual", "A recap view surfaced at season changes and in late December — as a Timeline tab or a Dashboard card that appears when a period closes."],
            ["Printable and portable", "Exportable as a clean one-pager, which quietly doubles as the first slice of the Handoff Export dossier — the year's chapter of the home's record."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", minWidth: "1rem", paddingTop: "0.3rem" }}>›</span>
              <p style={bodyText}>
                <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{name}: </span>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="road-furniture" label="Furniture" heading="Furniture Planning" sectionRefs={sectionRefs}>
      </ArchSection>
    </div>
  );
}

// ─── Updates tab ──────────────────────────────────────────────────────────────

const UPDATES = [
  {
    date: "July 3, 2026",
    heading: "Mobile: Install Foreman to Your Home Screen",
    bullets: [
      ["An app icon, not a browser tab", "Foreman is now an installable web app. On a phone connected via Multi-Device Sharing, use the browser's “Add to Home Screen” and you get a Foreman icon — brass F on the house colors — that opens the app directly. iPhones get the same treatment via Safari."],
      ["A header that fits a phone", "The header and tab bar now wrap and scale on small screens instead of running off the edge — every page, dropdown, and stat is reachable by touch. This is the first pass of mobile polish; page layouts themselves are next."],
      ["Faster loads where supported", "A service worker caches the app's assets so revisits load instantly, and never touches live data — reads, writes, and the cross-device update stream always go straight to the host. (Browsers only enable this over HTTPS or localhost, so on plain wifi sharing it simply stays off — everything else works the same.)"],
      ["Foreman, by name", "The browser tab and installed app are now titled Foreman instead of the old “Home Maintenance Registry”."],
    ],
  },
  {
    date: "July 3, 2026",
    heading: "Multi-Device: Use Foreman From Your Phone",
    bullets: [
      ["Share on your wifi", "The Windows desktop app can now host Foreman for every device on your home network. Flip on Multi-Device Sharing in Preferences → Integrations, scan the QR code with your phone, and the full app opens in the browser — live against the same data this computer holds. Works for laptops and other computers too."],
      ["No cloud, no accounts", "This computer is the host; other devices are windows into it. Nothing leaves your wifi network, there is nothing to sign up for, and the link carries a pairing code so guests on your network can't browse your data. Regenerate the code any time to cut off paired devices."],
      ["Live in both directions", "Log a chore from the couch and the desktop updates in front of you; check something off on the desktop and the phone reflects it. Changes stream between devices instantly over the local network."],
      ["Honest constraint", "Devices connect to this computer, so the desktop app must be running (it lives in the system tray). Away from home or with the host off, other devices can't reach the data — the tradeoff for keeping everything local."],
    ],
  },
  {
    date: "July 1, 2026",
    heading: "Navigation: Pages Remember Their State",
    bullets: [
      ["Filters and sort survive navigation", "Navigating away from a page and returning no longer resets it. Maintenance remembers its active tab, status filter, location, type, season, and frequency chips. Chores remembers the active room and sort column. Workbench remembers which tab (Queue or History). Inventory remembers the view (List, Overview, Outline) and the filters in the list view. Lifecycle remembers the forecast horizon and the Ledger subnav tab. The Notebook remembers the 'Only documented' toggle."],
      ["Persists across reloads too", "Configuration is written to storage on every change, so it survives a full page reload — not just within-session navigation. The forecast horizon you set stays set the next time you open the app."],
      ["Transient state is intentionally not restored", "Search queries, open detail panels, and selected items reset on navigation as before. Restoring those would be disorienting without the activity that led to them. Only deliberate view configuration — tab, filters, sort — is remembered."],
    ],
  },
  {
    date: "July 1, 2026",
    heading: "All History Tabs: Delete Records",
    bullets: [
      ["Delete any history entry", "Every history tab — Maintenance, Chores, Utilities, Services, and Workbench — now has an × button at the end of each row. Click it to remove that completion record permanently."],
      ["Confirmation before deleting", "Clicking × opens a confirmation dialog before committing the delete, so accidental taps don't wipe records."],
    ],
  },
  {
    date: "June 28, 2026",
    heading: "Chores: Multi-Assignee Completion",
    bullets: [
      ["Log multiple people at once", "The completion form now accepts more than one assignee — select any combination from your household roster using the new chip picker. Names not on the roster can be typed in and committed with Enter."],
      ["Everyone is credited the full time", "Each assignee is credited the chore's full duration — a 60-minute chore done by two people logs 60 minutes for each, not 30. A live hint below the Time field confirms it as you pick people: \"60m each · 2 people\". The dashboard query engine expands each completion into one row per person, so a chart grouped by Assignee shows each person's full time."],
      ["History shows every assignee", "The History tab lists all assignees in the Who column; the Time column shows the chore's full duration, which is the time credited to each person."],
      ["Backward compatible", "Existing single-assignee records are read as a one-person completion automatically. No migration needed."],
    ],
  },
  {
    date: "June 28, 2026",
    heading: "Dashboard: Custom Panels & Arrange Mode",
    bullets: [
      ["Build your own charts", "A new '+ Add Visualization' button opens an 8-step builder: pick a chart type (bar, line, area, pie), a data source (chore completions, maintenance completions, spending, utilities, services, or inventory), a group-by field, a measure (count, sum, or average), optional filters, and a date range. A live preview updates as you configure each step. Name it and save, and it lands on the dashboard as a draggable panel."],
      ["Edit or delete any custom panel", "Custom panels show a ⋯ menu with Edit and Delete. Edit reopens the builder with the panel's current config pre-filled so you can refine it."],
      ["Arrange panels freely", "A new '⊞ Arrange Panels' button puts the dashboard into edit mode: all panels get a dashed brass border and a grab cursor; resize handles appear in the corner. Drag any panel to reorder it; drag the corner to resize. Escape or '✓ Done' exits. A Reset button restores the default layout. The arrangement persists across reloads."],
    ],
  },
  {
    date: "June 27, 2026",
    heading: "Floor Plan: Building Outline",
    bullets: [
      ["A real Outline type", "The building footprint you import from your address is now its own Outline — a neutral white border with no fill, distinct from rooms and exteriors. It shows on every floor as scaffolding to trace against and is never counted toward square footage. On import it is auto-squared to the grid, so the snapping room tools line up with it."],
      ["Select and edit it like a zone", "Click the outline to select it: its side lengths appear on each wall and a detail panel opens with its size and options. Drag the border to move the whole outline, drag a corner to reshape it, click a corner to remove it, or click the border to add one — the same editing as a room or exterior zone."],
      ["Calibrate its size", "Set the outline's width or length in feet and it scales proportionally from its corner. Rooms you have already scaffolded onto it reflow with the change, so they stay aligned to the walls instead of drifting out of place."],
      ["Per-floor visibility and delete", "Show or hide the outline on individual floors, toggle it everywhere with the Outline filter, or delete it — all from the detail panel or the filter's options menu. Rooms snap cleanly to its walls as you place them."],
    ],
  },
  {
    date: "June 27, 2026",
    heading: "Floor Plan: Edit & Group Zones",
    bullets: [
      ["Resize by exact dimensions", "Select any placed zone and type its width and height in feet in the detail panel — a precise alternative to dragging its corners."],
      ["Change a zone's shape", "Switch a placed zone between rectangle, L, and U at any time, using the same shape selector offered when you add one. The zone keeps its position and footprint."],
      ["Move a zone to another floor", "Reassign a zone's floor from its panel. It keeps the same position and size on the new floor and brings its item pins along."],
      ["Group zones", "With the Select tool, group several zones so they move together as a unit and resize proportionally — handy for shifting a wing of the house or scaling a whole floor at once."],
      ["Labels readable at any zoom", "Zone and drawing labels now scale with the zoom level, staying legible whether you are zoomed far out or all the way in, instead of shrinking until you cannot read them."],
    ],
  },
  {
    date: "June 23, 2026",
    heading: "Floor Plan: Faster Room Building",
    bullets: [
      ["Parametric room shapes", "Adding a room now gives you a shape — rectangle, L, or U — with editable dimensions in feet, right in the toolbar. The placement ghost previews your exact shape and size as you move the cursor; click to drop it. No more dragging a fixed box to resize."],
      ["Walls snap together", "Drag a room next to another and their edges snap flush, so rooms share a wall instead of leaving a sliver gap or overlapping. Dragging a corner snaps it onto a neighbor's edge as well, and a brass guide line marks the moment a snap lands."],
      ["Add rooms by typing", "A new Dimensions mode builds a plan without drawing at all: type a room's name and size, press Add, and it drops into the first open spot automatically. Add several in a row to lay out a floor in seconds, then drag them into position — they'll snap as they meet."],
      ["Import your building outline from your address", "With Online Mode on, the new Address button looks up your home's real building footprint (via OpenStreetMap) and adds it as a scaffold Outline — a neutral white border, pre-scaled to feet, that you drop rooms onto. The footprint is auto-squared to the grid on import (real buildings rarely face true north), so the grid-snapping room tools — and snap-to-wall — align to it cleanly. Drag its border to move it, and use the Outline filter's ⋯ menu to show or hide it per floor or delete it. One Outline per plan (re-importing replaces it). It's the envelope, not the interior — a tracing guide, since a roofline runs slightly larger than the foundation and interior walls aren't included. Gated behind Online Mode and only runs when you click Fetch; nothing is sent until you ask."],
    ],
  },
  {
    date: "June 21, 2026",
    heading: "Windows Desktop App",
    bullets: [
      ["Runs as a native Windows app", "Foreman can now be launched as a standalone desktop application — no browser required. Run npm run electron:dev to open it in a native window during development, or npm run electron:build to produce an NSIS installer."],
      ["Data lives in Documents\\Foreman\\", "All your data is written to two real files on disk: data.json (everything except images) and images.json. They're plain text, copyable, and yours — not locked inside IndexedDB. The browser dev build continues to use IndexedDB exactly as before; the file backend only activates in the Electron app."],
      ["Automatic rolling backups", "On every launch and once per hour while the app is open, Foreman snapshots data.json into Documents\\Foreman\\backups\\. Backups are pruned on a three-tier schedule: all hourlies for the last 24 hours, one per day for the last 7 days, one per week for the last 4 weeks."],
      ["System tray", "Closing the window hides Foreman to the system tray rather than quitting it. Right-click the tray icon to reopen or quit."],
      ["Native file dialogs", "Profile export and import use the OS save/open dialog in the desktop app instead of the browser download mechanism."],
      ["Deep links", "Foreman registers the foreman:// custom protocol. Clicking a foreman:// link from another app focuses the window and navigates to the right page."],
    ],
  },
  {
    date: "June 19, 2026",
    heading: "Mortgage: Real Loan Modeling & Equity",
    bullets: [
      ["Amortize from your loan terms", "Enter your original principal, interest rate, term, and start month, and the Mortgage page computes your current balance, payoff date, and interest — paid so far, remaining, and this year (an estimate for the mortgage-interest tax deduction). The computed principal & interest can be set as your monthly payment in one click."],
      ["Amortization chart", "See the loan's whole life at a glance, by year, with two views: Balance (the declining-balance staircase, with the current year marked and past years dimmed) and Principal vs Interest (each year's payments split, showing the crossover where principal overtakes interest). Hover any year for its principal, interest, and end-of-year balance."],
      ["Equity & loan-to-value", "Add your home value to see the equity you've built and your loan-to-value. The loan terms are additive — your cash-flow payment model is untouched; they just power the analysis on top."],
      ["PMI cancellation heads-up", "When your loan-to-value reaches 80%, the Mortgage page flags it and a heads-up appears in Triage — you may be able to ask your lender to cancel PMI."],
      ["Full-height panel", "The Mortgage panel now fills the screen, with the month-by-month payment ledger scrolling inside it."],
    ],
  },
  {
    date: "June 19, 2026",
    heading: "Utilities: Cost Over Time",
    bullets: [
      ["See your spending history", "Utilities → History gains a Cost Over Time chart of every logged bill, with three views: Timeline (each month, stacked by utility type), Year over year (a Jan–Dec axis with one bar per year, to spot seasonal patterns), and Totals (composition pies by type, season, and year)."],
      ["Respects your filter", "The chart follows the History type filter, so you can isolate a single utility — handy for seeing a heating or cooling season swing on its own."],
    ],
  },
  {
    date: "June 19, 2026",
    heading: "Spending: Edit or Delete Any Entry",
    bullets: [
      ["One selection, two actions", "Click any ledger row to select it; Edit and Delete then appear by the “+ Add Expense” button instead of crowding every row. Expenses open the full form; utility, service, purchase, and mortgage entries edit their amount inline."],
      ["Delete with a safeguard", "Deleting any entry now asks first, with a message tailored to what actually happens — removing a utility bill, clearing an item's price, or suppressing a generated service/mortgage charge."],
      ["Tidier tabs", "The redundant Summary tab is gone, and “Purchases” is now “Inventory Purchases.” The ledger scrolls within its panel while the filters, summary, and column headers stay put."],
    ],
  },
  {
    date: "June 15, 2026",
    heading: "Finances: One Record of Spend, One Forecast",
    bullets: [
      ["A Finances menu", "The header gains a Finances group, and the old Lifecycle page is gone — its two halves are now their own pages: Ledger (what the home has cost) and Forecast (what it's projected to cost). Services and Utilities moved here too, since they're really accounts-payable inputs that feed both."],
      ["A unified Ledger", "Ledger → History is one backward-looking record of every paid transaction, pulled from everywhere: logged expenses, utility bills, service charges, inventory purchases, and mortgage payments. Filter by type, sort any column, edit expenses inline, or correct a service charge in place. Ledger → Summary rolls it all up — spend by type (trailing-12 and all-time), invested by system and room, and project spend."],
      ["Services are assumed paid", "A recurring service no longer needs a logged payment to count — Foreman assumes it was paid on its billing cycle, starting from a new “Paying since” date. Change a service's cost and only the current and future months move; past months keep what they were, and you can correct any single entry."],
      ["Forecast", "The former Budget tab is now Forecast: the same forward twelve-month run-rate — services, seasonal utilities, replacement reserve, repairs baseline, planned costs, and mortgage — framed strictly as a projection."],
      ["Attribute spend to projects & supplies", "An expense can now be tagged to a project or to-do alongside its item, so the Summary shows estimated-vs-actual Project Spend. And restocking a supply can log its cost as an expense in one step."],
    ],
  },
  {
    date: "June 15, 2026",
    heading: "Lifespans, Default Values & Page Help",
    bullets: [
      ["Estimated lifespan is per item", "Every item now carries an editable Estimated Lifespan in its details. A new item inherits the default for its type; change one item and only that item changes. The replacement forecast reads each item's own value."],
      ["Default Values", "Preferences → Info is now Default Values — a searchable table of every item type showing its default estimated lifespan (editable, and used to seed new items) alongside the built-in Model Coverage."],
      ["Lifespans on Inventory", "The Replacement Forecast moved onto the Inventory page as a sortable “Lifespans” tab. Inventory's other tabs are now named List View, Table View, and Outline View."],
      ["Help on every page", "An “i” button in the header opens a short guide to the current page — what it's for, how to use it, and which other pages share its data."],
    ],
  },
  {
    date: "June 14, 2026",
    heading: "Chores: Details, Duration & Sorting",
    bullets: [
      ["Reopen a chore's details", "Single-click a chore to reopen the full detail window and update any field — room, item, cadence, day and time, assignee, or notes — long after you first created it. The name label stays a one-click inline rename, so renaming and editing details no longer compete for the same click."],
      ["Duration estimate", "Chores now carry a Duration in minutes, editable both from the chore details window and from the Workbench's task table — one shared value, so a change in either place shows up in the other. The Workbench keyword heuristic only seeds the first guess."],
      ["Sort by status", "The Chores table's Status column is now sortable like every other column — click it to order by urgency (most overdue first), click again to reverse, shift-click to add it as a tiebreaker."],
    ],
  },
  {
    date: "June 14, 2026",
    heading: "Faster Item & Article Editing",
    bullets: [
      ["Open an item in one click", "On the Inventory page, single-click anywhere on an item's row to open its details in the side panel — no more hunting for the document icon. The inline field editors (system, type, location, rename) and the row's delete action still work exactly as before."],
      ["Double-click to edit an article", "In the Notebook, double-click an article — in the sidebar list or anywhere in its body — to drop straight into edit mode, instead of reaching for the Edit button."],
      ["Wider Notebook sidebar", "The article sidebar is a little wider so filter labels like “Exclude Blanks” read in full."],
      ["Floor-plan duplicate fix", "A room on the floor plan no longer lists or counts the same item twice. Items are now de-duplicated by category and name — the way Inventory identifies them — so a single furnace shows once, not twice."],
    ],
  },
  {
    date: "June 14, 2026",
    heading: "Notebook: Write Your Own Articles",
    bullets: [
      ["Create standalone articles", "The Notebook is no longer limited to one article per inventory item. Hit + New Article to write a free-standing note — a how-to, a vendor list, a seasonal checklist — that lives in the same sidebar, search, grouping, and drag-reorder as every other article, and rename or delete it from the article itself."],
      ["Classify any article", "Every article now carries association fields for what it's about — the item, location, system, project, and maintenance task. Item articles inherit their item's location and system and add Project and Task; standalone articles set all five. Populated associations show as chips when reading and persist across reloads."],
      ["Model Coverage moved", "The manufacturer and model coverage reference that used to live in the Notebook now sits under Preferences → Default Values, keeping the Notebook focused on your writing."],
    ],
  },
  {
    date: "June 13, 2026",
    heading: "Notebook Articles: Organize & Edit",
    bullets: [
      ["Organize the article list", "The Notebook sidebar gains a Group by control — keep the system tree, or regroup by Room, by Recent (last-edited first), or a Custom drag-to-reorder arrangement that's yours to set. The chosen mode and your custom order both persist across reloads."],
      ["Editable item details", "An item's specs are now editable straight from its article. Hit Edit and change the manufacturer, model, serial, purchase date, location, or any custom field — written through the same store Inventory uses, so the two stay in sync automatically. You can add fields, from the library or your own, without leaving the article."],
      ["Specs now match Inventory", "Fixed a storage-key mismatch that left article specs reading from the wrong place — a default item's details entered in Inventory now actually show on its article."],
      ["Search notes and specs", "The sidebar search now matches note bodies and spec values too, not just item names, and a Documented toggle filters to the articles you've actually written in. Each article also links straight to its Inventory record."],
    ],
  },
  {
    date: "June 13, 2026",
    heading: "Timeline & Editable Effort Estimates",
    bullets: [
      ["Timeline is its own page", "The activity feed that used to live as the Notebook's Journal tab is now a first-class page named Timeline, reachable from the Overview menu in the header. Same automatic record of everything that's happened to the house — completed maintenance, chores, service visits, utility bills, expenses, and projects — now one click closer. The Notebook returns to being a focused knowledge base of articles."],
      ["Tune a task's estimate", "On the Workbench, double-click any task's time estimate to type your own — the keyword heuristic is only a starting guess. Your number persists, flows into the session's time budget, and clearing the field reverts to the automatic estimate."],
    ],
  },
  {
    date: "June 13, 2026",
    heading: "Operating Budget & Cash-Flow Forecast",
    bullets: [
      ["Forward run-rate", "Lifecycle gains a Budget tab that projects what the home costs to run over the next twelve months — a single “cost to run / mo” figure built from your recurring services, a seasonal average of logged utility bills, the replacement reserve, and a trailing repairs baseline. No new data entry; it reads what the other pages already hold."],
      ["Month-by-month, not just an average", "A stacked bar chart and an expandable table break each month into its categories, so a heavy quarter (an annual service renewal, a warranty lapsing) is visible before it lands. Each month opens to show the service charges driving it, warranties expiring that month, and this month's logged-so-far actuals against the projection."],
      ["A target and one-offs", "Set a monthly target to see whether the run-rate is over or under it, toggle whether the replacement reserve and repairs baseline count toward the figure, and pin planned one-off costs (property tax, a known big repair) to the month they're due."],
      ["Mortgage & total outlay", "Add your mortgage as a recurring line — a default monthly payment that projects forward, with an escrow sub-amount that splits each payment into principal & interest versus taxes & insurance. Because real payments drift (an escrow re-analysis, an extra-principal month), any individual month can be corrected in a payment ledger and the rest fall back to the default. The mortgage stays separate from the operating run-rate — it's financing, not upkeep — and surfaces as a second “total monthly outlay” figure alongside the cost to operate."],
      ["Surfaced on the Dashboard", "The Dashboard At a Glance gains a Run cost stat — the projected monthly operating figure — that jumps straight to the Budget tab, and the command palette can open it directly (“View operating budget”)."],
    ],
  },
  {
    date: "June 12, 2026",
    heading: "Work Sessions (Workbench)",
    bullets: [
      ["Plan a session", "A new Workbench page turns the triage list into a plan: pick from everything due or overdue — maintenance, chores, dated to-dos — filtered by room, system, or window, with effort estimates summed against an optional time budget. One tap from the Dashboard Triage panel seeds it with everything overdue or due this week."],
      ["Run the punch list", "Items run one card at a time, grouped room by room, with a progress rail and elapsed timer. Done writes the complete record immediately — completion log, next-due date, supply decrement — exactly as if you'd logged it from its home page. Skip leaves the item honestly due; Can't captures what's blocking and spawns a linked to-do."],
      ["Durable history", "Every session is kept with per-item results and notes — a record that outlives the latest-completion-only maintenance log — and each completed session appears in the Timeline. Reload mid-session and Foreman offers to resume right where you left off."],
      ["Profile export fix", "Services, utilities, supplies, expenses, and completion records are now included in profile snapshots and exports — previously they leaked across profile switches."],
    ],
  },
  {
    date: "June 10, 2026",
    heading: "Command Palette & Global Search",
    bullets: [
      ["Jump to anything", "Press ⌘K / Ctrl-K — or click the new Search box in the header — to open a palette that searches across pages, inventory items, maintenance tasks, chores, services, utilities, and projects all at once, from anywhere in the app. Selecting a maintenance task, chore, service, or utility lands you on its page already filtered to it."],
      ["Search and act", "Fuzzy matching (type “wh” for Water Heater), keyboard navigation (↑↓ to move, ↵ to open, esc to close), quick actions that land on the right page with its Add form already open (log a bill, add a chore, new project, log an expense, add a service, new to-do), and recently-used entries surfaced first."],
      ["Built on what's there", "Reuses every page's existing data and the app's navigation — no new storage, and the header box advertises the keyboard shortcut so it's actually discoverable."],
    ],
  },
  {
    date: "June 9, 2026",
    heading: "Home Journal",
    bullets: [
      ["Unified activity feed", "The Notebook page gains a Journal tab — a single reverse-chronological record of everything that has happened to the house, assembled automatically from completed maintenance, chore completions, service visits, utility bills, logged expenses, and projects. No new data entry; it reads logs you already create."],
      ["Filter, search, and jump", "Narrow the feed by type, area (system or room), or person — surfacing the previously-hidden “who did it” data — search across it, and click any entry to jump to its source page."],
      ["The story of the house", "Grouped by month and sorted newest-first, it's the backward-looking companion to the Calendar and the backbone of the planned Handoff Export."],
    ],
  },
  {
    date: "June 9, 2026",
    heading: "Reliable Delete Confirmations",
    bullets: [
      ["Fixed dead delete buttons", "Delete actions that relied on the browser's native confirmation dialog — which is disabled in the desktop and IDE app shells, so the buttons silently did nothing — now use in-app confirmation that works everywhere."],
      ["Consistent everywhere", "Service, utility, and bill deletions confirm inline on the row (“Delete? Yes / No”), and category and room deletions use a shared confirmation dialog. Each still removes its child records — a service's visits, a utility's bills."],
    ],
  },
  {
    date: "June 8, 2026",
    heading: "Utilities Tracker",
    bullets: [
      ["Accounts + monthly bills", "A new Utilities page tracks recurring bills — electricity, gas, water, sewer, garbage, internet. Each utility is an account under which you log every monthly bill, building a spend history. Mirrors the Services → Visits model."],
      ["Cost + usage", "Bills capture the dollar amount and, for metered utilities, usage in the right unit (kWh, therms, gallons — prefilled from the type). Flat utilities like garbage just record the amount."],
      ["Estimated monthly", "Each utility's estimated monthly cost is a trailing-12-month average of its bills (falling back to a typical amount). The summed total shows on the Dashboard and rolls into the Lifecycle cost of ownership as Annual Utilities."],
    ],
  },
  {
    date: "June 8, 2026",
    heading: "Grouped Navigation",
    bullets: [
      ["Menu-bar nav", "The top navigation now collects its pages into a few dropdown menus — Overview, Property, Upkeep, and Work — instead of a long flat row of buttons. Notebook stays a direct button, Read Me / Preferences sit apart as quieter meta links, and Preferences shows as a gear icon."],
      ["Context at a glance", "The menu holding the page you're on highlights in brass, so you always know which section you're in. Menus open on hover and the active page is marked inside."],
    ],
  },
  {
    date: "June 8, 2026",
    heading: "Supplies Tracker",
    bullets: [
      ["Derived consumables", "A new Supplies page lists the replaceable parts your home burns through — furnace and water filters, softener salt, detector batteries, bulbs — derived automatically from inventory items that have one. The spec to buy comes from the item's own fields; the replacement cadence and next-change date come from its maintenance schedule. Nothing new to enter."],
      ["On-hand counts", "Set a quantity with one tap, then adjust it with −/＋ steppers. Each supply carries a reorder point (default: one) that decides when it's considered low."],
      ["Shopping list", "Everything at or below its reorder point collects on a dedicated Shopping List tab, copyable to clipboard in one click for a store run."],
      ["Manual supplies & tuning", "Add your own supplies that aren't tied to an inventory item (trash bags, AA batteries), and set a custom reorder point, product URL, and notes on any supply — derived or manual — from a single editor."],
      ["Closed the loop", "The Dashboard At a Glance shows how many supplies are low or out, and completing a replace/refill maintenance task offers a one-tap “use one from supplies” that decrements your stock — so the count stays honest without extra bookkeeping."],
    ],
  },
  {
    date: "June 7, 2026",
    heading: "Lifecycle: Cost of Ownership & Replacement Forecast",
    bullets: [
      ["Cost of Ownership", "A new page that rolls up recorded purchase prices by system and room, and normalizes recurring service spend into monthly and annual cost-of-ownership figures. Built entirely from data you'd already entered — no new fields required."],
      ["Replacement Forecast", "Ages each item against a curated expected-lifespan table (~90 item types), showing life remaining as a color-coded bar sorted soonest-first, with an estimated replacement cost per item."],
      ["Replacement reserve", "Projects a suggested annual set-aside by spreading the cost of every item within ~5 years of end-of-life across its remaining runway — turning surprise replacements into a planned budget line."],
      ["Warranty alerts", "Surfaces warranties expiring within 90 days (or recently lapsed) so claims get filed while they still count."],
      ["Expense log", "Log one-off repair and part costs and optionally link each to an inventory item; a trailing-12-month repairs total rolls up on the Cost of Ownership tab."],
      ["Surfaced everywhere", "The Dashboard At a Glance gains a Lifecycle stat (annual replacement reserve, or total invested before any forecast exists), and warranty-expiry dates now appear as amber chips across the Calendar's month, week, and agenda views."],
    ],
  },
  {
    date: "June 7, 2026",
    heading: "Dashboard: Schedule Timeline, Sortable Panels & Truer Health",
    bullets: [
      ["Schedule timeline", "A new T−30 to T+90 panel plots maintenance, chores, to-dos, and project deadlines as dots positioned by due date and colored by type and urgency, with hover detail and month markers."],
      ["Sortable panels", "The Systems, Rooms, To Dos, and Projects panels now sort by any column — click a header to sort, click again to reverse; the active column is marked."],
      ["Health reflects chores", "System and room health now accounts for overdue chores, not just maintenance, and rooms that exist only as chore locations (e.g. a master bath) now appear with their own health and next-due date."],
      ["Columnar To Dos & Projects", "Both render as compact tables with inline-editable Status, Priority, and Due; the Triage panel was retitled and gained a Chores shortcut."],
    ],
  },
  {
    date: "June 7, 2026",
    heading: "Inventory & Notebook Refinements",
    bullets: [
      ["Unified Location field", "The item details panel merged the separate Room and Exterior fields into a single inclusive Location field covering all spatial categories; the underlying data splits to the correct field automatically."],
      ["Cleaner Notebook headers", "Category headings in the Notebook sidebar and article view no longer show the redundant [subtype] bracket."],
      ["Expanded model coverage", "Added Montigo gas fireplaces to the model library, including the 30FID and 34FID."],
    ],
  },
  {
    date: "June 7, 2026",
    heading: "Offline / Online Mode",
    bullets: [
      ["Offline by default", "Foreman now ships in explicit offline mode — no network requests are made unless you opt in. All data stays in your browser."],
      ["Online Mode toggle", "Enable Online Mode from Preferences → Profile (Connectivity section) or Preferences → Integrations. The toggle is mirrored in both places and writes to the same setting."],
      ["Integration gating", "Discord reminders and the AI Inspection upload are locked behind Online Mode. Both show a clear notice when offline so you always know why a feature is unavailable."],
      ["Header indicator", "When Online Mode is active, a small green dot and \"Online\" label appear in the top navigation bar so the current mode is always visible."],
    ],
  },
  {
    date: "June 7, 2026",
    heading: "Services & Service Manager",
    bullets: [
      ["Services page", "A dedicated page for recurring service contracts and subscriptions — pest control, lawn care, HVAC maintenance plans, home warranties, security monitoring, and more. Each service carries provider details, cost, billing cycle, renewal date, and an auto-renews flag."],
      ["Inline visit log", "Log individual service visits directly under each service row: date, technician, notes, and an optional cost override. Full cross-service visit history available on the History tab."],
      ["Dashboard integration", "Total monthly cost across all active services (normalized from billing cycle) surfaces on the Dashboard At a Glance card."],
      ["Calendar integration", "Renewal dates appear as brass chips on the Calendar across month, week, and agenda views."],
    ],
  },
];

function UpdatesTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {UPDATES.map(({ date, heading, bullets }) => (
        <div key={heading}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.6rem" }}>
            <h2 style={sectionHeading}>{heading}</h2>
            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", flexShrink: 0 }}>{date}</span>
          </div>
          {bullets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--fm-hairline2)" }}>
              {bullets.map(([name, desc]) => (
                <div key={name}>
                  <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500 }}>{name}</span>
                  <span style={{ ...bodyText, display: "inline" }}> — {desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page shell ────────────────────────────────────────────────────────────────

export default function ReadMePage({ navigate }) {
  const [activeTab, setActiveTab] = useState("Instructions");

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Read Me" tagline="what is foreman" />
      <FmSubnav
        tabs={["Instructions", "Our Design Tenets", "Technical Architecture", "Development Roadmap", "Updates"]}
        active={activeTab}
        onTabChange={setActiveTab}
      />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 820, padding: "2.5rem 3rem" }}>
          {activeTab === "Instructions" && <InstructionsTab />}
          {activeTab === "Our Design Tenets" && <TenetsTab />}
          {activeTab === "Technical Architecture" && <ArchTab />}
          {activeTab === "Development Roadmap" && <RoadmapTab />}
          {activeTab === "Updates" && <UpdatesTab />}
        </div>
      </div>
    </div>
  );
}
