import { useState, useEffect, useMemo, useRef } from "react";
import { useForemanStore } from "../lib/store.js";
import { buildCommandIndex, rankCommands, COMMAND_ACTIONS } from "../lib/commandIndex.js";
import { onOpenCommandPalette, loadRecentCommands, pushRecentCommand } from "../lib/commandPalette.js";

const TYPE_META = {
  page:        { label: "Page",        color: "var(--fm-brass)" },
  action:      { label: "Action",      color: "var(--fm-green)" },
  inventory:   { label: "Item",        color: "var(--fm-cyan)" },
  maintenance: { label: "Task",        color: "var(--fm-brass)" },
  chore:       { label: "Chore",       color: "var(--fm-green)" },
  service:     { label: "Service",     color: "var(--fm-cyan)" },
  utility:     { label: "Utility",     color: "var(--fm-cyan)" },
  project:     { label: "Project",     color: "var(--fm-amber)" },
};

export default function CommandPalette({ navigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [recentIds, setRecentIds] = useState([]);
  const inputRef = useRef(null);
  const selectedRef = useRef(null);

  const chores    = useForemanStore(s => s.chores);
  const services  = useForemanStore(s => s.services);
  const utilities = useForemanStore(s => s.utilities);
  const projects  = useForemanStore(s => s.projects);

  const index = useMemo(
    () => buildCommandIndex({ chores, services, utilities, projects }),
    [chores, services, utilities, projects]
  );

  // Empty query → recent + quick actions + pages; otherwise rank the full index.
  const results = useMemo(() => {
    const all = [...COMMAND_ACTIONS, ...index];
    if (!query.trim()) {
      const byId = new Map(all.map(it => [it.id, it]));
      const recent = recentIds.map(id => byId.get(id)).filter(Boolean);
      const pages = index.filter(i => i.type === "page");
      const seen = new Set();
      const out = [];
      [...recent, ...COMMAND_ACTIONS, ...pages].forEach(it => {
        if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
      });
      return out;
    }
    return rankCommands(all, query);
  }, [query, index, recentIds]);

  // Open via Cmd/Ctrl-K (toggle) or the header trigger (emitter). One listener, cleaned up.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    const unsub = onOpenCommandPalette(() => setOpen(true));
    return () => { window.removeEventListener("keydown", onKey); unsub(); };
  }, []);

  // Reset + focus + refresh recents when opened.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setRecentIds(loadRecentCommands());
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function run(item) {
    if (!item) return;
    pushRecentCommand(item.id);
    setOpen(false);
    setQuery("");
    // Deep-link: pages that honor navState.search land filtered to the item.
    const navState = item.searchTerm ? { search: item.searchTerm } : item.navState;
    navigate?.(item.target, navState);
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[Math.min(selected, results.length - 1)]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  if (!open) return null;

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        alignItems: "flex-start",
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 500,
      }}
    >
      <div style={{
        background: "var(--fm-bg-panel)",
        border: "1px solid var(--fm-hairline2)",
        borderRadius: "var(--fm-radius-lg)",
        boxShadow: "0 16px 48px #00000070",
        display: "flex",
        flexDirection: "column",
        marginTop: "12vh",
        maxHeight: "64vh",
        overflow: "hidden",
        width: "min(580px, 92vw)",
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search items, tasks, pages — or jump to an action…"
          style={{
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--fm-hairline)",
            color: "var(--fm-ink)",
            fontFamily: "var(--fm-sans)",
            fontSize: "0.95rem",
            outline: "none",
            padding: "0.9rem 1.1rem",
          }}
        />

        <div style={{ flex: 1, overflowY: "auto", padding: "0.35rem" }}>
          {results.length === 0 ? (
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1rem 0.75rem" }}>
              No matches for “{query}”.
            </div>
          ) : (
            results.map((item, i) => {
              const meta = TYPE_META[item.type] || { label: item.type, color: "var(--fm-ink-dim)" };
              const isSel = i === Math.min(selected, results.length - 1);
              return (
                <div
                  key={item.id}
                  ref={isSel ? selectedRef : null}
                  onMouseEnter={() => setSelected(i)}
                  onMouseDown={e => { e.preventDefault(); run(item); }}
                  style={{
                    alignItems: "center",
                    background: isSel ? "var(--fm-bg-raised)" : "transparent",
                    borderRadius: "var(--fm-radius)",
                    cursor: "pointer",
                    display: "flex",
                    gap: "0.7rem",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  <span style={{ background: "var(--fm-bg-sunk)", border: `1px solid ${meta.color}`, borderRadius: "var(--fm-radius)", color: meta.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.06em", minWidth: 58, padding: "0.1rem 0.35rem", textAlign: "center", textTransform: "uppercase" }}>{meta.label}</span>
                  <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                  {item.sublabel && (
                    <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", whiteSpace: "nowrap" }}>{item.sublabel}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--fm-hairline)", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", gap: "1rem", letterSpacing: "0.06em", padding: "0.45rem 0.85rem" }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span style={{ marginLeft: "auto" }}>{results.length} result{results.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
