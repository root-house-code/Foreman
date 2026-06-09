import { useState, useMemo } from "react";
import { useForemanStore } from "./lib/store.js";
import { storageGet } from "./lib/storage.js";
import { buildSupplyRows } from "./lib/supplies.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function cadenceLabel(months) {
  if (months == null) return "—";
  if (months >= 12 && months % 12 === 0) return `every ${months / 12} yr`;
  if (months >= 12) return `every ${(months / 12).toFixed(1)} yr`;
  return `every ${months} mo`;
}

const STATUS_ORDER = { out: 0, low: 1, untracked: 2, ok: 3 };
const STATUS_META = {
  out:       { label: "Out",       color: "var(--fm-red)" },
  low:       { label: "Low",       color: "var(--fm-amber)" },
  ok:        { label: "Stocked",   color: "var(--fm-green)" },
  untracked: { label: "Untracked", color: "var(--fm-ink-mute)" },
};

// ── Styles ───────────────────────────────────────────────────────────────────

const card = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  padding: "1.25rem 1.5rem",
};

const thCell = {
  borderBottom: "1px solid var(--fm-hairline2)",
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  fontWeight: 400,
  letterSpacing: "0.12em",
  padding: "0 0.75rem 0.5rem 0",
  textAlign: "left",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tdCell = {
  borderBottom: "1px solid var(--fm-hairline)",
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.55rem 0.75rem 0.55rem 0",
  verticalAlign: "middle",
};

const sectionTitle = {
  color: "var(--fm-ink-mute)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const stepBtn = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.8rem",
  height: 20,
  lineHeight: 1,
  width: 20,
};

const trackBtn = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  letterSpacing: "0.06em",
  padding: "0.15rem 0.5rem",
  textTransform: "uppercase",
};

const pillBtn = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: 3,
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: "0.3rem 0.65rem",
  textTransform: "uppercase",
};

const rowBtn = {
  background: "transparent",
  border: "none",
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.06em",
  padding: 0,
  textTransform: "uppercase",
};

const cancelBtn = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: "0.3rem 0.65rem",
  textTransform: "uppercase",
};

const inputStyle = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  outline: "none",
  padding: "0.35rem 0.5rem",
  width: "100%",
};

const fieldLabel = {
  color: "var(--fm-ink-mute)",
  display: "block",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.55rem",
  letterSpacing: "0.1em",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
};

const modalOverlay = {
  alignItems: "center",
  background: "rgba(8,9,12,0.6)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  position: "fixed",
  zIndex: 100,
};

const modalBox = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  boxShadow: "0 12px 40px #00000060",
  maxWidth: 440,
  padding: "1.5rem 1.75rem",
  width: "90%",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SuppliesPage({ navigate }) {
  const [activeTab, setActiveTab] = useState("Supplies");
  const [copied, setCopied] = useState(false);

  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const supplies        = useForemanStore(s => s.supplies);
  const setSupplyState     = useForemanStore(s => s.setSupplyState);
  const addManualSupply    = useForemanStore(s => s.addManualSupply);
  const updateManualSupply = useForemanStore(s => s.updateManualSupply);
  const deleteManualSupply = useForemanStore(s => s.deleteManualSupply);

  const [editing, setEditing] = useState(null); // null | supply row | { source:"manual", __new:true }
  const [nextDatesMap] = useState(() => storageGet("maintenance-next-dates") ?? {});

  // ── Unified supply roster (auto-derived + manual), sorted by urgency ──────────
  const rows = useMemo(() => {
    return buildSupplyRows(itemFieldValues, inventory, nextDatesMap, supplies).sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      const an = a.nextDue ? a.nextDue.getTime() : Infinity;
      const bn = b.nextDue ? b.nextDue.getTime() : Infinity;
      if (an !== bn) return an - bn;
      return a.item.localeCompare(b.item);
    });
  }, [itemFieldValues, inventory, nextDatesMap, supplies]);

  const toBuy   = rows.filter(r => r.status === "out" || r.status === "low");
  const tracked = rows.filter(r => r.status !== "untracked").length;

  function setQty(row, qty) {
    const next = Math.max(0, qty);
    if (row.source === "manual") updateManualSupply(row.id, { qtyOnHand: next });
    else setSupplyState(row.taskKey, { qtyOnHand: next });
  }

  function copyShoppingList() {
    const text = toBuy
      .map(r => `• ${r.item}${r.name ? " — " + r.name : ""}${r.spec ? " (" + r.spec + ")" : ""}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>
      <FmHeader active="Supplies" tagline="stock & resupply" />

      <FmSubnav
        tabs={["Supplies", "Shopping List"]}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={[
          { value: toBuy.length, label: "to buy", color: toBuy.length > 0 ? "var(--fm-amber)" : "var(--fm-green)" },
          { value: tracked, label: "tracked" },
        ]}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, padding: "1.75rem 2.25rem" }}>

          {activeTab === "Supplies" && (
            <div style={card}>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                <span style={sectionTitle}>Consumables</span>
                <button style={pillBtn} onClick={() => setEditing({ source: "manual", __new: true })}>+ Add Supply</button>
              </div>
              {rows.length === 0 ? (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.25rem 0" }}>
                  No consumables found yet. Foreman derives these from items in your inventory that have a recurring replaceable part — a furnace filter, fridge water filter, softener salt, detector batteries, and the like. Add those items (and their specs) in Inventory and they'll appear here automatically.
                </div>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={thCell}>Item</th>
                      <th style={thCell}>Supply</th>
                      <th style={thCell}>Spec</th>
                      <th style={{ ...thCell, textAlign: "center" }}>On Hand</th>
                      <th style={{ ...thCell, textAlign: "right" }}>Cadence</th>
                      <th style={{ ...thCell, textAlign: "right" }}>Next Change</th>
                      <th style={{ ...thCell, textAlign: "right" }}>Status</th>
                      <th style={{ ...thCell, paddingRight: 0 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const meta = STATUS_META[r.status];
                      return (
                        <tr key={r.key}>
                          <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{r.item}{r.source === "manual" && <span style={{ color: "var(--fm-ink-mute)", fontSize: "0.55rem", marginLeft: "0.4rem" }}>·manual</span>}</td>
                          <td style={tdCell}>{r.name || "—"}</td>
                          <td style={{ ...tdCell, color: "var(--fm-ink-mute)" }}>{r.spec || "—"}</td>
                          <td style={{ ...tdCell, textAlign: "center" }}>
                            {r.qtyOnHand == null ? (
                              <button style={trackBtn} onClick={() => setQty(r, 1)}>Track</button>
                            ) : (
                              <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
                                <button style={stepBtn} onClick={() => setQty(r, r.qtyOnHand - 1)}>−</button>
                                <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", minWidth: 16, textAlign: "center" }}>{r.qtyOnHand}</span>
                                <button style={stepBtn} onClick={() => setQty(r, r.qtyOnHand + 1)}>+</button>
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdCell, textAlign: "right" }}>{cadenceLabel(r.cadenceMonths)}</td>
                          <td style={{ ...tdCell, textAlign: "right" }}>{fmtDate(r.nextDue)}</td>
                          <td style={{ ...tdCell, textAlign: "right" }}>
                            <span style={{ color: meta.color, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>{meta.label}</span>
                          </td>
                          <td style={{ ...tdCell, paddingRight: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button style={rowBtn} onClick={() => setEditing(r)}>edit</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {rows.length > 0 && (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", lineHeight: 1.6, marginTop: "0.9rem" }}>
                  Cadence and next-change come from each item's maintenance schedule. Set a count with “Track”, then the −/＋ steppers; anything at or below its reorder point shows on the Shopping List.
                </div>
              )}
            </div>
          )}

          {activeTab === "Shopping List" && (
            <div style={card}>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                <span style={sectionTitle}>Shopping List</span>
                {toBuy.length > 0 && <button style={pillBtn} onClick={copyShoppingList}>{copied ? "Copied ✓" : "Copy list"}</button>}
              </div>
              {toBuy.length === 0 ? (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.25rem 0" }}>
                  Nothing to buy — you're stocked up. Items drop in here once their on-hand count reaches the reorder point.
                </div>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={thCell}>Item</th>
                      <th style={thCell}>Supply</th>
                      <th style={thCell}>Spec</th>
                      <th style={{ ...thCell, textAlign: "right" }}>On Hand</th>
                      <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toBuy.map(r => {
                      const meta = STATUS_META[r.status];
                      return (
                        <tr key={r.key}>
                          <td style={{ ...tdCell, color: "var(--fm-ink)" }}>
                            {r.productUrl
                              ? <a href={r.productUrl} target="_blank" rel="noreferrer" style={{ color: "var(--fm-brass)", textDecoration: "none" }}>{r.item} ↗</a>
                              : r.item}
                          </td>
                          <td style={tdCell}>{r.name || "—"}</td>
                          <td style={{ ...tdCell, color: "var(--fm-ink-mute)" }}>{r.spec || "—"}</td>
                          <td style={{ ...tdCell, textAlign: "right" }}>{r.qtyOnHand ?? 0}</td>
                          <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>
                            <span style={{ color: meta.color, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>{meta.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>

      {editing && (
        <SupplyModal
          supply={editing}
          onClose={() => setEditing(null)}
          setSupplyState={setSupplyState}
          addManualSupply={addManualSupply}
          updateManualSupply={updateManualSupply}
          deleteManualSupply={deleteManualSupply}
        />
      )}
    </div>
  );
}

function SupplyModal({ supply, onClose, setSupplyState, addManualSupply, updateManualSupply, deleteManualSupply }) {
  const isManual = supply.source === "manual";
  const isNew = !!supply.__new;

  const [form, setForm] = useState({
    label: supply.item || "",
    spec: supply.spec || "",
    cadenceMonths: supply.cadenceMonths ?? "",
    qtyOnHand: supply.qtyOnHand ?? "",
    reorderThreshold: supply.reorderThreshold ?? 1,
    productUrl: supply.productUrl || "",
    notes: supply.notes || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    const qty = form.qtyOnHand === "" ? null : Math.max(0, parseInt(form.qtyOnHand) || 0);
    const threshold = Math.max(0, parseInt(form.reorderThreshold) || 0);
    const common = { qtyOnHand: qty, reorderThreshold: threshold, productUrl: form.productUrl.trim(), notes: form.notes.trim() };

    if (isManual) {
      const label = form.label.trim();
      if (!label) return;
      const payload = {
        ...common,
        label,
        spec: form.spec.trim(),
        cadenceMonths: form.cadenceMonths === "" ? null : (parseInt(form.cadenceMonths) || null),
      };
      if (isNew) addManualSupply({ id: "sup-" + Date.now(), source: "manual", ...payload });
      else updateManualSupply(supply.id, payload);
    } else {
      setSupplyState(supply.taskKey, common);
    }
    onClose();
  }

  function handleDelete() {
    if (isManual && !isNew) deleteManualSupply(supply.id);
    onClose();
  }

  return (
    <div style={modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalBox}>
        <div style={{ marginBottom: "1.1rem" }}>
          <span style={sectionTitle}>{isNew ? "Add Supply" : isManual ? "Edit Supply" : "Supply Settings"}</span>
          {!isManual && (
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.95rem", marginTop: "0.3rem" }}>
              {supply.item} · {supply.name}
              {supply.spec && <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", marginLeft: "0.5rem" }}>{supply.spec}</span>}
            </div>
          )}
        </div>

        {isManual && (
          <>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={fieldLabel}>Name</label>
              <input style={inputStyle} value={form.label} onChange={e => set("label", e.target.value)} placeholder="e.g. AA Batteries" autoFocus />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Spec</label>
                <input style={inputStyle} value={form.spec} onChange={e => set("spec", e.target.value)} placeholder="optional" />
              </div>
              <div style={{ width: 110 }}>
                <label style={fieldLabel}>Cadence (mo)</label>
                <input style={inputStyle} type="number" min="0" value={form.cadenceMonths} onChange={e => set("cadenceMonths", e.target.value)} placeholder="—" />
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>On Hand</label>
            <input style={inputStyle} type="number" min="0" value={form.qtyOnHand} onChange={e => set("qtyOnHand", e.target.value)} placeholder="untracked" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Reorder at ≤</label>
            <input style={inputStyle} type="number" min="0" value={form.reorderThreshold} onChange={e => set("reorderThreshold", e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label style={fieldLabel}>Product URL</label>
          <input style={inputStyle} value={form.productUrl} onChange={e => set("productUrl", e.target.value)} placeholder="https:// (for quick reorder)" />
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={fieldLabel}>Notes</label>
          <input style={inputStyle} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="optional" />
        </div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div>
            {isManual && !isNew && <button style={{ ...rowBtn, color: "var(--fm-red)" }} onClick={handleDelete}>Delete</button>}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={cancelBtn} onClick={onClose}>Cancel</button>
            <button style={pillBtn} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
