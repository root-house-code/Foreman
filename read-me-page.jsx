import { useState, useRef, useEffect } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";

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

function TocNav({ sections, activeSection, onSelect }) {
  return (
    <nav style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "2.25rem" }}>
      <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.18em", marginRight: "0.25rem", textTransform: "uppercase" }}>
        Contents
      </span>
      {sections.map(({ id, label }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
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
      })}
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

const PAGES = [
  ["Dashboard", "At-a-glance summary of your home's state. Shows upcoming maintenance, active projects, recent inventory additions, and overdue items. The entry point for a daily or weekly check-in."],
  ["Calendar", "All scheduled maintenance tasks and chores laid out across time. Supports month, week, day, and year views. Use it to see what's coming, identify clusters of work, and confirm what's been completed."],
  ["Inventory", "A catalog of everything in your home: appliances, fixtures, systems, materials, and finishes. Organized by system and room, with custom fields for install dates, model numbers, warranties, and finish specs. Inventory items link directly to maintenance tasks."],
  ["Maintenance", "The core of Foreman. A structured list of recurring maintenance tasks across every system in your home: HVAC, plumbing, electrical, roofing, and more. Each task has a schedule, an optional season constraint, and a completion log. Tracks what's overdue, what's due soon, and what's on schedule."],
  ["Services", "A dedicated manager for recurring service contracts and subscriptions: pest control, lawn care, HVAC maintenance plans, home warranties, security monitoring, and more. Track provider details, costs, billing cycles, and renewal dates. Log individual service visits with technician notes. Renewal dates surface on the Calendar and monthly costs roll up to the Dashboard."],
  ["Chores", "Regular household tasks with repeating schedules. Assign chores to rooms, set frequency, and mark them done as you go. Chores are ongoing upkeep, distinct from maintenance tasks, which are system-specific inspection or service events."],
  ["To Dos", "A Kanban-style board for one-off action items that don't belong in a recurring schedule. Use it for anything from calling a contractor to ordering a replacement part. Move work from backlog to done."],
  ["Projects", "Track renovation initiatives and improvement projects from start to completion. Log progress, attach notes, link inventory items, and follow effort across time. Useful for anything with a defined scope that spans days or weeks."],
  ["Notebook", "A knowledge base for your home. Articles and notes organized by system: a place to document how something works, what product you used, lessons from a past repair, or reference material for a future project."],
  ["Preferences", "Configure the structure of your home: floors, rooms, entity types, and application settings. The definitions here shape how data is organized across all other pages."],
];

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
      </div>

      <div ref={el => { sectionRefs.current["sec-pages"] = el; }} id="sec-pages" style={divider}>
        <div style={sectionLabel}>Navigation</div>
        <h2 style={sectionHeading}>Pages</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {PAGES.map(([name, desc]) => (
            <div key={name}>
              <div style={{ font: "500 0.9rem var(--fm-serif)", color: "var(--fm-ink)", marginBottom: "0.2rem" }}>{name}</div>
              <p style={bodyText}>{desc}</p>
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
  { id: "arch-stack",        label: "Built With" },
  { id: "arch-structure",    label: "App Structure" },
  { id: "arch-datamodel",    label: "Data Model" },
  { id: "arch-design",       label: "Design System" },
  { id: "arch-integrations", label: "Integrations" },
];

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

function ArchTab() {
  const { activeSection, sectionRefs, scrollTo } = useToc(ARCH_SECTIONS);

  return (
    <div>
      <TocNav sections={ARCH_SECTIONS} activeSection={activeSection} onSelect={scrollTo} />

      <ArchSection id="arch-storage" label="Storage" heading="How Foreman Stores Your Data" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          Foreman is a local-first application. There is no server, no account, and no internet connection required to use it. Every piece of data you add — tasks, inventory, chores, projects, notes — is saved in IndexedDB, a database built into your browser. Nothing leaves your device unless you explicitly export it.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Think of IndexedDB as a private, structured database inside your browser. Foreman writes to it whenever you make a change, and reads from it every time you open the app. Unlike the older localStorage API it replaced, IndexedDB has no meaningful storage limit — you won't run out of space from normal use.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The tradeoff: your data is private and fast to access, but it's tied to the specific browser and device you use. Clearing your browser's site data would clear Foreman's data along with it. Use the Export function in Preferences to keep a portable backup.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem", color: "var(--fm-ink-mute)" }}>
          For developers: Foreman uses <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>idb-keyval</span> as a thin wrapper over IndexedDB. All storage goes through <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>lib/storage.js</span>, which maintains an in-memory cache populated at startup. Every <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>load*()</span> call reads from cache synchronously (no async/await required in React state initializers); every <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>save*()</span> call writes to cache immediately and fires an IndexedDB write asynchronously. Keys follow the convention <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>foreman-{"{domain}"}</span> (e.g., foreman-chores, foreman-todos). A handful of older keys use shorter names for historical reasons (maintenance-dates, fp-data).
        </p>
      </ArchSection>

      <ArchSection id="arch-stack" label="Stack" heading="Built With" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            ["React 18", "The UI library. React is the system that keeps the interface in sync with your data. When you mark a task done, React automatically updates every part of the screen that reflects that task without a page refresh."],
            ["Zustand", "Lightweight global state management. A single store in lib/store.js holds named slices for every domain (rooms, projects, chores, spatial assignments, item fields, and more). Pages subscribe to slices using selectors — when a slice changes, every page that reads it re-renders automatically. This is what makes changes on the Floor Plan immediately visible in Inventory without a reload."],
            ["Vite", "The build tool. Vite packages all the source code into the files your browser actually runs. During development it runs a local server that updates the page instantly when you save a file."],
            ["idb-keyval", "A minimal wrapper over IndexedDB that provides a simple get/set/del API. Foreman uses this as its storage backend via lib/storage.js, replacing localStorage to eliminate storage size limits."],
            ["TipTap", "The rich-text editor that powers the Notebook page. Supports formatted notes with headings, lists, bold, italic, and code."],
            ["PDF.js", "Used to parse equipment manuals uploaded as PDFs. Parsing happens locally in your browser; no file content is sent anywhere."],
            ["Inter / Newsreader / JetBrains Mono", "The three typefaces used across the design system."],
          ].map(([name, desc]) => (
            <div key={name}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500 }}>{name}</span>
              <span style={{ ...bodyText, display: "inline" }}> — {desc}</span>
            </div>
          ))}
        </div>
        <p style={{ ...bodyText, marginTop: "1rem", color: "var(--fm-ink-mute)" }}>
          No backend framework. No database. No authentication. No external API is required for core functionality.
        </p>
      </ArchSection>

      <ArchSection id="arch-structure" label="Architecture" heading="Application Structure" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          Foreman has 12 pages. Each page is a standalone React component file at the root of the project (e.g., home-maintenance.jsx, inventory-page.jsx, services-page.jsx). Pages are registered in src/App.jsx and rendered based on a page state variable.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Navigation is custom-built: a single state variable tracks which page is active, and a navigate() function switches between them. There is no URL routing and no browser history management. The entire app runs at a single URL. A React context object (FmNavContext) makes the current page name and navigate function available to every component.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Every page uses the same two layout components as its shell: FmHeader (the top bar with navigation) and FmSubnav (the tab bar below it with page-specific tabs and stat counters). Below those two rails, each page renders its own content independently.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          A single Zustand store in <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>lib/store.js</span> serves as the authoritative source for all cross-page data. Pages subscribe to named slices of the store using selector functions; when a write happens in one place, every subscribed page updates automatically. Each store action persists its change to IndexedDB in the same operation — there is no separate "save" step. The store is seeded from IndexedDB at startup and can be fully reloaded after profile switches or bulk imports via <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>reloadAll()</span>.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>Code is organized into four layers:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--fm-hairline2)" }}>
          {[
            ["lib/store.js", "The global Zustand store. Holds slices for rooms, floors, floor plan data, spatial assignments, item field values, inventory state, projects, chores, services, and entity types. Pages read from slices via subscriptions; store actions handle all writes. Calling load*() directly in a page is a code smell after the refactor — the store is the source of truth."],
            ["lib/", "Data utility modules, one per domain (chores, maintenance, inventory, rooms, floors, reminders, etc.). Pure functions that read and write data via lib/storage.js, parse and format values, and compute derived results. No React code. The storage.js module is the single point of contact with IndexedDB — all other lib files call storageGet/storageSet rather than touching the browser storage API directly."],
            ["components/", "Domain-specific UI components: maintenance table, modals, date pickers, filter pills, schedule pickers."],
            ["src/components/", "Design system components shared across all pages: FmHeader, FmSubnav, FmCard, FmStatusDot, FmSysTag."],
          ].map(([name, desc]) => (
            <div key={name}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem" }}>{name}</span>
              <span style={{ ...bodyText, display: "inline" }}> {desc}</span>
            </div>
          ))}
        </div>
      </ArchSection>

      <ArchSection id="arch-datamodel" label="Data" heading="The Data Model" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Maintenance tasks</div>
            <p style={bodyText}>421 built-in default tasks live in data/maintenance.json. Each task is identified by a composite key: category|item|task (the three values joined with a pipe character). This key is used as a stable reference across multiple storage entries — completion records, next due dates, notes, and custom field values all reference it. Custom tasks you create are stored separately and merged in at load time.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Inventory</div>
            <p style={bodyText}>Uses a state map: each category and item carries a status of included, hidden, or archived. Items are referenced by a stable key — a generated ID for custom items (e.g., <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>custom-1748abc</span>) or a <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>default:</span> prefix for built-in items — so renaming an item doesn't break any associated data.</p>
            <p style={{ ...bodyText, marginTop: "0.6rem" }}>Associated data is split across two stores keyed by stable key. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Spatial assignments</span> (<span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>foreman-spatial-assignments</span>) record which room or exterior zone each item is placed in — this is what the Floor Plan and Outline read to group items by location. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Item field values</span> (<span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>foreman-item-field-values</span>) record detail fields like manufacturer, model number, serial number, warranty expiry, install date, and item type. Both are slices in the global store, so writes on any page propagate everywhere automatically.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Chores</div>
            <p style={bodyText}>Stored as objects with a unique ID. Schedules use a human-readable string format ("every 1 weeks", "every 3 months"). Next occurrence dates and per-occurrence completion records (who completed it, when, any notes) are stored in separate localStorage keys and linked by chore ID. Unlike maintenance, chores track every occurrence, not just the most recent.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Services</div>
            <p style={bodyText}>Stored under <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>foreman-services</span> as a single object with two sub-maps: <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>services</span> (id → Service) and <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>visits</span> (id → ServiceVisit). A Service carries provider name, phone, category (from a fixed 15-item taxonomy with an "Other" escape hatch), cost, billing cycle, renewal date, and auto-renews flag. A ServiceVisit is a child record of a Service and records the date, technician, notes, and an optional cost override. Monthly cost is normalized from the billing cycle — annual cost divided by 12, quarterly by 3, one-time excluded — and surfaced on the Dashboard and in the Services stats bar.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Entity types</div>
            <p style={bodyText}>Power the categorization system. Built-in types (room, exterior, system, HVAC, plumbing, electrical, safety, structure) each belong to a behavioral class: spatial (location-based, like rooms) or functional (system-based, like HVAC). This distinction controls how categories are grouped and filtered across all pages. Users can create custom types that extend the built-in hierarchy.</p>
          </div>
        </div>
      </ArchSection>

      <ArchSection id="arch-design" label="Design" heading="Design System" sectionRefs={sectionRefs}>
        <p style={bodyText}>
          The entire visual language is defined by approximately 30 CSS custom properties declared in src/styles/theme.css. Every color, font, spacing value, border style, and corner radius in the application references one of these variables. No hardcoded values appear in component code.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          {[
            ["Backgrounds", "Four depth levels: --fm-bg (base), --fm-bg-raised, --fm-bg-panel, --fm-bg-sunk"],
            ["Borders", "--fm-hairline and --fm-hairline2 for line weights; --fm-border and --fm-border-2 as composite shorthands"],
            ["Text", "Three levels: --fm-ink (primary), --fm-ink-dim (secondary), --fm-ink-mute (placeholder/disabled)"],
            ["Brass accent", "--fm-brass, --fm-brass-dim, --fm-brass-bg — used for all active states, focus rings, and interactive highlights"],
            ["Status colors", "--fm-red (overdue), --fm-amber (due soon), --fm-green (on schedule), --fm-cyan (utility/in-progress)"],
            ["Typography", "--fm-serif (Newsreader), --fm-sans (Inter), --fm-mono (JetBrains Mono)"],
            ["Spacing", "A 10-step scale from 4px to 30px (--fm-spacing-xs through --fm-spacing-5xl)"],
            ["Radius", "--fm-radius (2px) and --fm-radius-lg (3px)"],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", minWidth: "120px", paddingTop: "0.15rem" }}>{name}</span>
              <p style={{ ...bodyText, fontSize: "0.8rem" }}>{desc}</p>
            </div>
          ))}
        </div>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          The brass color (#c9a96e) anchors the design's identity. Three typefaces divide the visual hierarchy: Newsreader for display headings, Inter for body content, and JetBrains Mono for labels, tags, filter pills, and data-dense UI elements.
        </p>
        <p style={{ ...bodyText, marginTop: "0.85rem" }}>
          Two additional themes are available and selectable in Preferences. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Daylight</span> inverts the palette to a warm off-white background with dark ink — suited for bright environments. <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>Obsidian</span> uses a near-black background with indigo-tinted accents in place of brass. Themes are applied via a <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>data-theme</span> attribute on the root element before React renders, so there is no flash of unstyled content on load. A <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>density control</span> in Preferences scales the root font size (Compact: 14px, Default: 16px, Comfortable: 18px), which propagates through every <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>rem</span>-based measurement in the app.
        </p>
      </ArchSection>

      <ArchSection id="arch-integrations" label="Integrations" heading="External Integrations" sectionRefs={sectionRefs}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>Reminders</div>
            <p style={bodyText}>An optional Cloudflare Worker (a small program running in the cloud, separate from this app) can send daily reminder digests via Discord. You configure this in Preferences by supplying a Discord webhook URL and a send time. The worker authenticates using a household ID and sync secret generated locally. It reads only next-due dates, not your full data. DST-aware timezone handling is configured per household.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>AI Inspection</div>
            <p style={bodyText}>The Preferences page supports photo-based home inspection analysis powered by Groq's AI API. Photos are sent to Groq's servers for analysis and return a structured list of potential issues and maintenance suggestions. This integration requires a Groq API key configured in Preferences.</p>
          </div>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>PDF Parsing</div>
            <p style={bodyText}>Equipment manuals can be uploaded as PDFs. Text is extracted locally in your browser using PDF.js — no file content is transmitted. Extracted text can be searched and referenced when setting up inventory items or maintenance tasks.</p>
          </div>
        </div>
      </ArchSection>
    </div>
  );
}

// ─── Development Roadmap tab ───────────────────────────────────────────────────

const ROADMAP_SECTIONS = [
  { id: "road-mobile",  label: "Mobile App" },
  { id: "road-ha",      label: "Home Assistant" },
  { id: "road-advisor", label: "AI Advisor" },
];

function RoadmapTab() {
  const { activeSection, sectionRefs, scrollTo } = useToc(ROADMAP_SECTIONS);

  return (
    <div>
      <TocNav sections={ROADMAP_SECTIONS} activeSection={activeSection} onSelect={scrollTo} />

      <ArchSection id="road-mobile" label="Mobile" heading="Mobile App" sectionRefs={sectionRefs} first>
        <p style={bodyText}>
          A native mobile companion app is planned for the major mobile platforms. The mobile experience is designed around the moments when you're standing in front of the thing, not sitting at a desk. Three core workflows drive the design:
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

      <ArchSection id="road-advisor" label="AI" heading="AI-Powered Home Advisor" sectionRefs={sectionRefs}>
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
    </div>
  );
}

// ─── Updates tab ──────────────────────────────────────────────────────────────

const UPDATES = [
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--fm-hairline2)" }}>
            {bullets.map(([name, desc]) => (
              <div key={name}>
                <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", fontWeight: 500 }}>{name}</span>
                <span style={{ ...bodyText, display: "inline" }}> — {desc}</span>
              </div>
            ))}
          </div>
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
