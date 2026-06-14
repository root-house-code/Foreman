import { useState, useMemo, useEffect } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import AssigneeInput from "./components/AssigneeInput.jsx";
import { FilterDropdown, FilterRow } from "./components/FilterPill.jsx";
import { useForemanStore } from "./lib/store.js";
import { storageGet, storageSet } from "./lib/storage.js";
import { buildSessionCandidates, orderByRoom, createSession, createSessionItem } from "./lib/sessions.js";
import { saveMaintenanceCompletionRecord, loadMaintenanceCompletionRecords, maintenanceKey } from "./lib/maintenance.js";
import { computeNextDate } from "./lib/scheduleInterval.js";
import { toggleChoreCompletion, saveChoreCompletions, loadChoreCompletions, saveChoreCompletionRecord } from "./lib/choreCompletions.js";
import { loadChoreNextDates, saveChoreNextDates, computeChoreNextDate } from "./lib/chores.js";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { consumingTaskInfo, composeSpec, SUPPLY_CATALOG } from "./lib/supplies.js";
import { loadData } from "./lib/data.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_META = {
  maintenance: { label: "MAINT", color: "var(--fm-brass)" },
  chore:       { label: "CHORE", color: "var(--fm-green)" },
  todo:        { label: "TODO",  color: "var(--fm-cyan)" },
};

function candKey(c) { return `${c.kind}:${c.ref}:${c.choreDate || ""}`; }

function dueLabel(dueDate, today) {
  const days = Math.round((dueDate - today) / 86400000);
  if (days < 0)  return { text: `${-days}d late`, color: "var(--fm-red)" };
  if (days === 0) return { text: "today", color: "var(--fm-amber)" };
  return { text: `in ${days}d`, color: "var(--fm-ink-mute)" };
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtMinutes(min) {
  if (min >= 60) {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min}m`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  padding: "1.25rem 1.5rem",
};

const sectionTitle = {
  color: "var(--fm-ink-mute)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const btnPrimary = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  padding: "0.4rem 0.9rem",
};

const btnGhost = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.9rem",
};

const fieldInput = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.4rem 0.6rem",
  width: "100%",
};

const kindTag = (kind) => ({
  background: "var(--fm-bg-sunk)",
  border: `1px solid ${KIND_META[kind].color}`,
  borderRadius: "var(--fm-radius)",
  color: KIND_META[kind].color,
  flexShrink: 0,
  fontFamily: "var(--fm-mono)",
  fontSize: "0.52rem",
  letterSpacing: "0.06em",
  minWidth: 44,
  padding: "0.1rem 0.35rem",
  textAlign: "center",
});

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WorkbenchPage({ navigate, navState }) {
  const chores             = useForemanStore(s => s.chores);
  const inventory          = useForemanStore(s => s.inventory);
  const spatialAssignments = useForemanStore(s => s.spatialAssignments);
  const itemFieldValues    = useForemanStore(s => s.itemFieldValues);
  const supplies           = useForemanStore(s => s.supplies);
  const setSupplyState     = useForemanStore(s => s.setSupplyState);
  const sessions           = useForemanStore(s => s.sessions);
  const addSession         = useForemanStore(s => s.addSession);
  const updateSession      = useForemanStore(s => s.updateSession);

  const [tab, setTab] = useState(navState?.tab === "History" ? "History" : "Workbench");
  const [screen, setScreen] = useState("builder"); // builder | runner | wrapup
  const [sessionId, setSessionId] = useState(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // ── Resume / Abandon an interrupted active session ───────────────────────────
  const activeSession = useMemo(
    () => Object.values(sessions || {}).find(s => s.status === "active" && s.id !== sessionId),
    [sessions, sessionId]
  );
  const [resumeDismissed, setResumeDismissed] = useState(false);

  function resumeActive() {
    setSessionId(activeSession.id);
    setScreen("runner");
    setResumeDismissed(true);
  }
  function abandonActive() {
    updateSession(activeSession.id, { status: "abandoned", endedAt: new Date().toISOString() });
    setResumeDismissed(true);
  }

  // ── Builder state ─────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("Work session");
  const [assignee, setAssignee] = useState("");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [catFilter, setCatFilter] = useState("ALL");
  const [windowFilter, setWindowFilter] = useState("WEEK"); // OVERDUE | WEEK | MONTH
  const [budget, setBudget] = useState(null); // minutes | null
  const [selected, setSelected] = useState(() => new Set());

  const candidates = useMemo(
    () => buildSessionCandidates({ chores, inventory, spatialAssignments, now: today, todoWindowDays: 30 }),
    [chores, inventory, spatialAssignments, today]
  );

  const windowEnd = useMemo(() => {
    const d = new Date(today);
    if (windowFilter === "OVERDUE") return today;
    d.setDate(d.getDate() + (windowFilter === "WEEK" ? 7 : 30));
    return d;
  }, [today, windowFilter]);

  const visible = useMemo(() => candidates.filter(c => {
    if (windowFilter === "OVERDUE" ? c.dueDate >= today : c.dueDate > windowEnd) return false;
    if (roomFilter !== "ALL" && c.room !== roomFilter) return false;
    if (catFilter !== "ALL" && c.category !== catFilter) return false;
    return true;
  }), [candidates, windowFilter, windowEnd, roomFilter, catFilter, today]);

  const rooms = useMemo(() => [...new Set(candidates.map(c => c.room))].sort(), [candidates]);
  const cats  = useMemo(() => [...new Set(candidates.map(c => c.category))].sort(), [candidates]);

  // Seed from the Dashboard Triage: preselect overdue + due this week.
  useEffect(() => {
    if (navState?.seed !== "triage") return;
    const wk = new Date(today); wk.setDate(wk.getDate() + 7);
    setSelected(new Set(candidates.filter(c => c.dueDate <= wk).map(candKey)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCands = useMemo(() => candidates.filter(c => selected.has(candKey(c))), [candidates, selected]);
  const estTotal = selectedCands.reduce((s, c) => s + (c.estMinutes || 0), 0);

  function toggleSel(c) {
    setSelected(prev => {
      const next = new Set(prev);
      const k = candKey(c);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function startSession() {
    if (selectedCands.length === 0) return;
    const ordered = orderByRoom(selectedCands);
    const items = ordered.map(c => createSessionItem({
      kind: c.kind, ref: c.ref, choreDate: c.choreDate,
      label: c.label, sublabel: c.sublabel, room: c.room, estMinutes: c.estMinutes,
    }));
    const session = createSession({ title: title.trim() || "Work session", assignee: assignee.trim(), items });
    addSession(session);
    setSessionId(session.id);
    setIdx(0);
    setScreen("runner");
  }

  // ── Runner state ──────────────────────────────────────────────────────────────
  const session = sessionId ? sessions?.[sessionId] : null;
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState("");
  const [useSupply, setUseSupply] = useState(true);
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [blockerText, setBlockerText] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Live lookups the snapshots can't carry: maintenance row (schedule/season),
  // chore object, last-completion notes. Rebuilt on session change (incl. resume).
  const runtime = useMemo(() => {
    if (!session) return {};
    const rows = loadData();
    const records = loadMaintenanceCompletionRecords();
    const map = {};
    session.items.forEach(si => {
      if (si.kind === "maintenance") {
        const row = rows.find(r => maintenanceKey(r) === si.ref) || null;
        map[si.id] = { row, lastNote: records[si.ref]?.notes || "" };
      } else if (si.kind === "chore") {
        map[si.id] = { chore: chores.find(c => c.id === si.ref) || null };
      } else {
        map[si.id] = {};
      }
    });
    return map;
  }, [session?.id, chores]); // eslint-disable-line react-hooks/exhaustive-deps

  // On resume, land on the first unresolved card.
  useEffect(() => {
    if (screen === "runner" && session) {
      const first = session.items.findIndex(i => i.result === null);
      setIdx(first === -1 ? Math.max(0, session.items.length - 1) : first);
    }
  }, [screen, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer.
  useEffect(() => {
    if (screen !== "runner" || !session?.startedAt) return;
    const tick = () => setElapsed(Date.now() - new Date(session.startedAt).getTime());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [screen, session?.startedAt]);

  // Reset per-card state when the card changes.
  useEffect(() => { setNote(""); setUseSupply(true); setBlockerOpen(false); setBlockerText(""); }, [idx, sessionId]);

  const item = session?.items?.[idx] || null;
  const rt = item ? (runtime[item.id] || {}) : {};

  const supplyInfo = useMemo(() => {
    if (!item || item.kind !== "maintenance" || !rt.row) return null;
    return consumingTaskInfo(rt.row.category, rt.row.item, rt.row.task, supplies);
  }, [item, rt.row, supplies]);

  const spec = useMemo(() => {
    if (!item || item.kind !== "maintenance" || !rt.row) return "";
    const def = SUPPLY_CATALOG[rt.row.item];
    if (!def || !item) return "";
    const stableKey = rt.row._isCustom ? rt.row._id : `default:${rt.row.category}|${rt.row.item}`;
    return composeSpec(def.specFields, itemFieldValues?.[stableKey]);
  }, [item, rt.row, itemFieldValues]);

  function patchItem(patch) {
    const items = session.items.map(i => i.id === item.id ? { ...i, ...patch } : i);
    updateSession(session.id, { items });
    return items;
  }

  function advance(items) {
    const next = items.findIndex((i, j) => j > idx && i.result === null);
    if (next !== -1) { setIdx(next); return; }
    const anyBefore = items.findIndex(i => i.result === null);
    if (anyBefore !== -1) { setIdx(anyBefore); return; }
    finishSession(items);
  }

  function finishSession(items) {
    updateSession(session.id, {
      items: (items || session.items).map(i => i.result === null ? { ...i, result: "skipped" } : i),
      status: "done",
      endedAt: new Date().toISOString(),
    });
    setScreen("wrapup");
  }

  // ── Completion write paths (mirror calendar-page.jsx:548-600) ─────────────────
  function completeMaintenance(si, row, notes) {
    const now = new Date();
    const key = si.ref;
    saveMaintenanceCompletionRecord(key, { completedAt: now.toISOString(), assignee: session.assignee, notes });
    const dates = storageGet("maintenance-dates") ?? {};
    storageSet("maintenance-dates", { ...dates, [key]: now.toISOString() });
    if (row) {
      const next = computeNextDate(now, row.schedule, row.season); // season-snapped
      if (next) {
        const nextDates = storageGet("maintenance-next-dates") ?? {};
        storageSet("maintenance-next-dates", { ...nextDates, [key]: next.toISOString() });
      }
    }
    if (supplyInfo && supplyInfo.qtyOnHand > 0 && useSupply) {
      setSupplyState(supplyInfo.taskKey, { qtyOnHand: Math.max(0, supplyInfo.qtyOnHand - 1) });
    }
  }

  function completeChore(si, chore, notes) {
    const d = new Date(si.choreDate + "T00:00:00"); d.setHours(0, 0, 0, 0);
    saveChoreCompletions(toggleChoreCompletion(loadChoreCompletions(), si.ref, d));
    saveChoreCompletionRecord(si.ref, d, {
      completedAt: new Date().toISOString(),
      assignee: session.assignee,
      room: chore?.room || si.room,
      roomId: chore?.roomId || null,
      item: chore?.item || "",
      notes,
    });
    if (chore) {
      const nextOcc = computeChoreNextDate(d, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
      saveChoreNextDates({ ...loadChoreNextDates(), [si.ref]: nextOcc.toISOString() });
    }
  }

  function completeTodo(si) {
    saveTodos(loadTodos().map(t => t.id === si.ref
      ? { ...t, status: "done", completedDate: new Date().toISOString() }
      : t));
  }

  function handleDone() {
    const notes = note.trim();
    if (item.kind === "maintenance") completeMaintenance(item, rt.row, notes);
    else if (item.kind === "chore")  completeChore(item, rt.chore, notes);
    else                             completeTodo(item);
    advance(patchItem({ result: "done", resultNotes: notes, completedAt: new Date().toISOString() }));
  }

  function handleSkip() {
    advance(patchItem({ result: "skipped" })); // no data writes — item stays due
  }

  function handleBlocked() {
    const blocker = blockerText.trim();
    let linkedCategory = null, linkedItem = null;
    if (item.kind === "maintenance" && rt.row) { linkedCategory = rt.row.category; linkedItem = rt.row.item; }
    const todo = createTodo({
      title: `Blocked: ${item.label}`,
      linkedCategory, linkedItem,
      linkedRoom: item.room !== "General" ? item.room : null,
    });
    todo.description = blocker;
    saveTodos([...loadTodos(), todo]);
    advance(patchItem({ result: "blocked", resultNotes: blocker, spawnedTodoId: todo.id }));
  }

  // ── History ───────────────────────────────────────────────────────────────────
  const doneSessions = useMemo(
    () => Object.values(sessions || {})
      .filter(s => s.status === "done")
      .sort((a, b) => (b.endedAt || "").localeCompare(a.endedAt || "")),
    [sessions]
  );
  const [expandedHist, setExpandedHist] = useState(null);

  function counts(s) {
    const c = { done: 0, skipped: 0, blocked: 0 };
    s.items.forEach(i => { if (c[i.result] !== undefined) c[i.result] += 1; });
    return c;
  }

  function duration(s) {
    if (!s.startedAt || !s.endedAt) return "—";
    return fmtElapsed(new Date(s.endedAt) - new Date(s.startedAt));
  }

  function resetToBuilder() {
    setSessionId(null);
    setScreen("builder");
    setSelected(new Set());
    setTitle("Work session");
  }

  // ── Subnav stats ──────────────────────────────────────────────────────────────
  const doneCount = session ? session.items.filter(i => i.result === "done").length : 0;
  const stats = tab === "History"
    ? [{ value: doneSessions.length, label: "sessions" }]
    : screen === "runner" && session
      ? [{ value: `${doneCount}/${session.items.length}`, label: "done", color: "var(--fm-green)" }, { value: fmtElapsed(elapsed), label: "elapsed", color: "var(--fm-brass)" }]
      : [{ value: selectedCands.length, label: "selected" }, { value: fmtMinutes(estTotal), label: "est", color: "var(--fm-cyan)" }];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>
      <FmHeader active="Workbench" tagline="get more shit done" />
      <FmSubnav tabs={["Workbench", "History"]} active={tab} onTabChange={setTab} stats={stats} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "Workbench" && (
          <div style={{ margin: "0 auto", maxWidth: screen === "runner" ? 560 : 880, padding: "1.75rem 1.5rem" }}>

            {/* Resume / abandon prompt for an interrupted session */}
            {activeSession && !resumeDismissed && screen === "builder" && (
              <div style={{ ...card, alignItems: "center", display: "flex", gap: "1rem", marginBottom: "1.25rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    Session in progress: <span style={{ color: "var(--fm-brass)" }}>{activeSession.title}</span>
                  </div>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                    {activeSession.items.filter(i => i.result !== null).length} of {activeSession.items.length} handled · started {fmtDateTime(activeSession.startedAt)}
                  </div>
                </div>
                <button style={btnPrimary} onClick={resumeActive}>Resume</button>
                <button style={btnGhost} onClick={abandonActive}>Abandon</button>
              </div>
            )}

            {/* ── Builder ── */}
            {screen === "builder" && (
              <>
                <div style={{ ...card, marginBottom: "1rem" }}>
                  <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.85rem" }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ ...sectionTitle, display: "block", marginBottom: "0.3rem" }}>Session title</label>
                      <input style={fieldInput} value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...sectionTitle, display: "block", marginBottom: "0.3rem" }}>Assignee</label>
                      <AssigneeInput value={assignee} onChange={setAssignee} style={fieldInput} />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <FilterRow label="Window" labelWidth="56px">
                      <FilterDropdown
                        value={windowFilter}
                        onChange={setWindowFilter}
                        defaultValue="WEEK"
                        options={[
                          { value: "OVERDUE", label: "Overdue only" },
                          { value: "WEEK", label: "Due this week" },
                          { value: "MONTH", label: "Due this month" },
                        ]}
                      />
                    </FilterRow>
                    <FilterRow label="Room" labelWidth="56px" hidden={rooms.length === 0}>
                      <FilterDropdown
                        value={roomFilter}
                        onChange={setRoomFilter}
                        options={[{ value: "ALL", label: "All" }, ...rooms.map(r => ({ value: r, label: r }))]}
                      />
                    </FilterRow>
                    <FilterRow label="System" labelWidth="56px" hidden={cats.length === 0}>
                      <FilterDropdown
                        value={catFilter}
                        onChange={setCatFilter}
                        options={[{ value: "ALL", label: "All" }, ...cats.map(c => ({ value: c, label: c }))]}
                      />
                    </FilterRow>
                  </div>
                </div>

                {/* Candidate list */}
                <div style={{ ...card, marginBottom: "1rem", padding: "0.75rem 1rem" }}>
                  <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.35rem 0.5rem 0.6rem" }}>
                    <span style={sectionTitle}>Due &amp; overdue ({visible.length})</span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button style={{ ...btnGhost, fontSize: "0.6rem", padding: "0.2rem 0.55rem" }}
                        onClick={() => setSelected(new Set(visible.map(candKey)))}>Select all</button>
                      <button style={{ ...btnGhost, fontSize: "0.6rem", padding: "0.2rem 0.55rem" }}
                        onClick={() => setSelected(new Set())}>Clear</button>
                    </div>
                  </div>

                  {visible.length === 0 ? (
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.75rem 0.5rem" }}>
                      Nothing due in this window — adjust the filters, or enjoy the afternoon.
                    </div>
                  ) : visible.map(c => {
                    const isSel = selected.has(candKey(c));
                    const due = dueLabel(c.dueDate, today);
                    const sup = c.kind === "maintenance" && c.row ? consumingTaskInfo(c.row.category, c.row.item, c.row.task, supplies) : null;
                    return (
                      <div key={candKey(c)}
                        onClick={() => toggleSel(c)}
                        style={{ alignItems: "center", background: isSel ? "var(--fm-bg-raised)" : "transparent", borderBottom: "1px solid var(--fm-hairline)", borderRadius: "var(--fm-radius)", cursor: "pointer", display: "flex", gap: "0.65rem", padding: "0.5rem" }}>
                        <input type="checkbox" readOnly checked={isSel} style={{ accentColor: "var(--fm-brass)", cursor: "pointer", flexShrink: 0 }} />
                        <span style={kindTag(c.kind)}>{KIND_META[c.kind].label}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "var(--fm-ink)", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", marginTop: "0.1rem" }}>
                            {c.room}
                            {sup && sup.qtyOnHand === null && (
                              <span> · {sup.name.toLowerCase()} untracked
                                <button style={{ background: "none", border: "none", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", padding: "0 0 0 0.3rem", textDecoration: "underline" }}
                                  onClick={e => { e.stopPropagation(); setSupplyState(sup.taskKey, { qtyOnHand: 0 }); }}>mark as out</button>
                              </span>
                            )}
                            {sup && sup.qtyOnHand !== null && sup.qtyOnHand > 0 && <span style={{ color: "var(--fm-green)" }}> · {sup.name} · {sup.qtyOnHand} on hand</span>}
                            {sup && sup.qtyOnHand === 0 && <span style={{ color: "var(--fm-red)" }}> · {sup.name} · out — on Shopping List</span>}
                          </div>
                        </div>
                        <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{fmtMinutes(c.estMinutes)}</span>
                        <span style={{ color: due.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", minWidth: 52, textAlign: "right" }}>{due.text}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer: budget + start */}
                <div style={{ ...card, alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  <span style={sectionTitle}>Budget</span>
                  <FilterDropdown
                    value={budget}
                    onChange={setBudget}
                    options={[
                      { value: null, label: "Any" },
                      { value: 30, label: "30m" },
                      { value: 60, label: "1h" },
                      { value: 120, label: "2h" },
                      { value: 240, label: "Half day" },
                    ]}
                  />
                  <div style={{ flex: 1 }} />
                  <span style={{ color: budget && estTotal > budget ? "var(--fm-amber)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>
                    {selectedCands.length} item{selectedCands.length !== 1 ? "s" : ""} · ~{fmtMinutes(estTotal)}{budget ? ` / ${fmtMinutes(budget)}` : ""}
                  </span>
                  <button
                    style={{ ...btnPrimary, fontSize: "0.8rem", opacity: selectedCands.length === 0 ? 0.4 : 1, padding: "0.55rem 1.4rem" }}
                    disabled={selectedCands.length === 0}
                    onClick={startSession}
                  >Start session</button>
                </div>
              </>
            )}

            {/* ── Runner ── */}
            {screen === "runner" && session && item && (
              <>
                {/* Progress rail */}
                <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.85rem" }}>
                  <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.08em" }}>
                    {idx + 1} of {session.items.length} · {item.room}
                  </span>
                  <div style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: 2, flex: 1, height: 5, overflow: "hidden" }}>
                    <div style={{ background: "var(--fm-green)", height: "100%", transition: "width 0.25s", width: `${(session.items.filter(i => i.result !== null).length / session.items.length) * 100}%` }} />
                  </div>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>{fmtElapsed(elapsed)}</span>
                </div>

                {/* Card */}
                <div style={{ ...card, padding: "1.5rem 1.6rem" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", marginBottom: "0.5rem" }}>
                    <span style={kindTag(item.kind)}>{KIND_META[item.kind].label}</span>
                    <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{item.room}</span>
                    {item.result && (
                      <span style={{ color: item.result === "done" ? "var(--fm-green)" : item.result === "blocked" ? "var(--fm-amber)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", textTransform: "uppercase" }}>{item.result}</span>
                    )}
                  </div>

                  <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.3rem", marginBottom: "0.25rem" }}>{item.label}</div>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", marginBottom: "0.85rem" }}>{item.sublabel}</div>

                  {spec && (
                    <div style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: "var(--fm-radius)", color: "var(--fm-cyan)", display: "inline-block", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", marginBottom: "0.85rem", padding: "0.3rem 0.6rem" }}>
                      {spec}
                    </div>
                  )}

                  {rt.lastNote && (
                    <div style={{ borderLeft: "2px solid var(--fm-hairline2)", color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", fontStyle: "italic", marginBottom: "0.85rem", paddingLeft: "0.7rem" }}>
                      Last time: “{rt.lastNote}”
                    </div>
                  )}

                  <input
                    style={{ ...fieldInput, marginBottom: "0.85rem" }}
                    placeholder="Quick note (optional)…"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />

                  {supplyInfo && supplyInfo.qtyOnHand > 0 && (
                    <label style={{ alignItems: "center", color: "var(--fm-ink-dim)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", gap: "0.45rem", marginBottom: "0.85rem" }}>
                      <input type="checkbox" checked={useSupply} onChange={e => setUseSupply(e.target.checked)} style={{ accentColor: "var(--fm-green)" }} />
                      Use one from supplies ({supplyInfo.name} · {supplyInfo.qtyOnHand} on hand)
                    </label>
                  )}
                  {supplyInfo && supplyInfo.qtyOnHand === 0 && (
                    <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginBottom: "0.85rem" }}>
                      {supplyInfo.name} is out of stock — it's on the Shopping List.
                    </div>
                  )}

                  {!blockerOpen ? (
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <button onClick={handleDone}
                        style={{ background: "rgba(127,176,135,0.12)", border: "1px solid var(--fm-green)", borderRadius: "var(--fm-radius)", color: "var(--fm-green)", cursor: "pointer", flex: 2, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", letterSpacing: "0.06em", padding: "0.75rem" }}>
                        ✓ Done
                      </button>
                      <button onClick={handleSkip} style={{ ...btnGhost, flex: 1, fontSize: "0.78rem", padding: "0.75rem" }}>Skip</button>
                      <button onClick={() => setBlockerOpen(true)}
                        style={{ background: "transparent", border: "1px solid var(--fm-amber)", borderRadius: "var(--fm-radius)", color: "var(--fm-amber)", cursor: "pointer", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.78rem", padding: "0.75rem" }}>
                        Can't
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input autoFocus style={{ ...fieldInput, marginBottom: "0.6rem" }} placeholder="What's blocking?"
                        value={blockerText} onChange={e => setBlockerText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleBlocked(); if (e.key === "Escape") setBlockerOpen(false); }} />
                      <div style={{ display: "flex", gap: "0.6rem" }}>
                        <button onClick={handleBlocked} style={{ ...btnPrimary, flex: 1 }}>Log blocker → To Do</button>
                        <button onClick={() => setBlockerOpen(false)} style={btnGhost}>Back</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card nav + end */}
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: "0.85rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button style={{ ...btnGhost, opacity: idx === 0 ? 0.35 : 1 }} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Prev</button>
                    <button style={{ ...btnGhost, opacity: idx >= session.items.length - 1 ? 0.35 : 1 }} disabled={idx >= session.items.length - 1} onClick={() => setIdx(idx + 1)}>Next →</button>
                  </div>
                  <button style={{ ...btnGhost, color: "var(--fm-ink-mute)" }} onClick={() => finishSession()}>End session</button>
                </div>
              </>
            )}

            {/* ── Wrap-up ── */}
            {screen === "wrapup" && session && (() => {
              const c = counts(session);
              const spawned = session.items.filter(i => i.spawnedTodoId);
              return (
                <>
                  <div style={{ ...card, marginBottom: "1rem", textAlign: "center" }}>
                    <div style={{ ...sectionTitle, marginBottom: "0.5rem" }}>Session complete</div>
                    <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.5rem", marginBottom: "0.35rem" }}>{session.title}</div>
                    <div style={{ fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}>
                      <span style={{ color: "var(--fm-green)" }}>{c.done} done</span>
                      <span style={{ color: "var(--fm-ink-mute)" }}> · {c.skipped} skipped · </span>
                      <span style={{ color: "var(--fm-amber)" }}>{c.blocked} blocked</span>
                      <span style={{ color: "var(--fm-ink-mute)" }}> · {duration(session)}</span>
                    </div>
                  </div>

                  <div style={{ ...card, marginBottom: "1rem", padding: "0.75rem 1rem" }}>
                    {session.items.map(i => (
                      <div key={i.id} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.65rem", padding: "0.45rem 0.4rem" }}>
                        <span style={{ color: i.result === "done" ? "var(--fm-green)" : i.result === "blocked" ? "var(--fm-amber)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", width: 16 }}>
                          {i.result === "done" ? "✓" : i.result === "blocked" ? "⚑" : "—"}
                        </span>
                        <span style={kindTag(i.kind)}>{KIND_META[i.kind].label}</span>
                        <span style={{ color: "var(--fm-ink)", flex: 1, fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</span>
                        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{i.room}</span>
                      </div>
                    ))}
                    {spawned.length > 0 && (
                      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.6rem 0.4rem 0.2rem" }}>
                        {spawned.length} blocker to-do{spawned.length !== 1 ? "s" : ""} created —{" "}
                        <button style={{ background: "none", border: "none", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: 0, textDecoration: "underline" }}
                          onClick={() => navigate("board")}>view on the board</button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
                    <button style={btnPrimary} onClick={() => { setTab("History"); resetToBuilder(); }}>Done</button>
                    <button style={btnGhost} onClick={resetToBuilder}>Plan another</button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── History tab ── */}
        {tab === "History" && (
          <div style={{ margin: "0 auto", maxWidth: 880, padding: "1.75rem 1.5rem" }}>
            {doneSessions.length === 0 ? (
              <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
                No completed sessions yet. Plan one on the Workbench tab and knock out the list.
              </p>
            ) : doneSessions.map(s => {
              const c = counts(s);
              const isExp = expandedHist === s.id;
              return (
                <div key={s.id} style={{ ...card, cursor: "pointer", marginBottom: "0.75rem", padding: "1rem 1.25rem" }}
                  onClick={() => setExpandedHist(isExp ? null : s.id)}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.85rem" }}>
                    <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>{isExp ? "▾" : "▸"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--fm-ink)", fontSize: "0.85rem" }}>{s.title}</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.15rem" }}>
                        {fmtDateTime(s.endedAt)}{s.assignee ? ` · ${s.assignee}` : ""} · {duration(s)}
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--fm-mono)", fontSize: "0.68rem", whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--fm-green)" }}>{c.done}✓</span>
                      <span style={{ color: "var(--fm-ink-mute)" }}> {c.skipped}—</span>
                      <span style={{ color: "var(--fm-amber)" }}> {c.blocked}⚑</span>
                    </span>
                  </div>
                  {isExp && (
                    <div style={{ borderTop: "1px solid var(--fm-hairline)", marginTop: "0.75rem", paddingTop: "0.5rem" }}>
                      {s.items.map(i => (
                        <div key={i.id} style={{ alignItems: "center", display: "flex", gap: "0.6rem", padding: "0.3rem 0" }}>
                          <span style={{ color: i.result === "done" ? "var(--fm-green)" : i.result === "blocked" ? "var(--fm-amber)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", width: 14 }}>
                            {i.result === "done" ? "✓" : i.result === "blocked" ? "⚑" : "—"}
                          </span>
                          <span style={kindTag(i.kind)}>{KIND_META[i.kind].label}</span>
                          <span style={{ color: "var(--fm-ink-dim)", flex: 1, fontSize: "0.75rem" }}>{i.label}</span>
                          {i.resultNotes && <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", fontStyle: "italic", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{i.resultNotes}”</span>}
                          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{i.room}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
