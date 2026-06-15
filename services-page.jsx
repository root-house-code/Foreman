import { useState, useMemo, useEffect } from "react";
import { useForemanStore } from "./lib/store.js";
import { FIXED_SERVICE_CATEGORIES, toMonthly } from "./lib/services.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { FilterDropdown } from "./components/FilterPill.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtCost(cost) {
  if (cost == null || cost === "") return "—";
  return "$" + Number(cost).toFixed(2);
}

function displayCat(svc) {
  return svc.category === "Other" ? (svc.customCategory || "Other") : (svc.category || "—");
}

// ── Style constants ───────────────────────────────────────────────────────────

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

const fieldLabel = {
  color: "var(--fm-ink-mute)",
  display: "block",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
};

const fieldInput = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.4rem 0.6rem",
  width: "100%",
  boxSizing: "border-box",
};

const fieldSelect = {
  ...fieldInput,
  cursor: "pointer",
};

const modalOverlay = {
  alignItems: "flex-start",
  background: "rgba(0,0,0,0.6)",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  left: 0,
  overflowY: "auto",
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: 200,
};

const modalBox = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: "4rem auto",
  maxWidth: 540,
  padding: "1.5rem",
  width: "90%",
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

const btnDanger = {
  background: "transparent",
  border: "1px solid var(--fm-red)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-red)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.7rem",
};

const EMPTY_SERVICE = {
  name: "",
  providerName: "",
  providerPhone: "",
  category: "Pest Control",
  customCategory: "",
  cost: "",
  billingCycle: "annual",
  renewalDate: "",
  startDate: "",
  autoRenews: false,
  linkedRooms: [],
  linkedExterior: [],
  linkedItems: [],
  notes: "",
  active: true,
};

const EMPTY_VISIT = {
  date: new Date().toISOString().slice(0, 10),
  techName: "",
  notes: "",
  overrideCost: "",
  linkedItems: [],
};

// ── ServiceModal ──────────────────────────────────────────────────────────────

function ServiceModal({ initial, isEdit, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_SERVICE, ...initial }));

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const id = isEdit ? initial.id : "svc-" + Date.now();
    onSave({
      ...form,
      id,
      cost: form.cost === "" ? null : Number(form.cost),
      active: isEdit ? form.active : true,
    });
  }

  return (
    <div style={modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={modalBox}>
        <div style={{ borderBottom: "1px solid var(--fm-hairline)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem" }}>
            {isEdit ? "Edit Service" : "Add Service"}
          </span>
        </div>

        {/* Name */}
        <div>
          <label style={fieldLabel}>Name *</label>
          <input required style={fieldInput} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Quarterly Pest Control" />
        </div>

        {/* Category */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Category</label>
            <select style={fieldSelect} value={form.category} onChange={e => set("category", e.target.value)}>
              {FIXED_SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {form.category === "Other" && (
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Custom Category</label>
              <input style={fieldInput} value={form.customCategory} onChange={e => set("customCategory", e.target.value)} placeholder="e.g. Radon Testing" />
            </div>
          )}
        </div>

        {/* Provider */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 2 }}>
            <label style={fieldLabel}>Provider Name</label>
            <input style={fieldInput} value={form.providerName} onChange={e => set("providerName", e.target.value)} placeholder="e.g. Orkin" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Phone</label>
            <input style={fieldInput} value={form.providerPhone} onChange={e => set("providerPhone", e.target.value)} placeholder="555-1234" />
          </div>
        </div>

        {/* Cost + Billing */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Cost ($)</label>
            <input style={fieldInput} type="number" min="0" step="0.01" value={form.cost} onChange={e => set("cost", e.target.value)} placeholder="0.00" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Billing Cycle</label>
            <select style={fieldSelect} value={form.billingCycle} onChange={e => set("billingCycle", e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="one-time">One-time</option>
            </select>
          </div>
        </div>

        {/* Paying since (history start) */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Paying Since</label>
            <input style={fieldInput} type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", marginTop: "0.2rem" }}>seeds the Ledger history (blank = last 12 months)</div>
          </div>
        </div>

        {/* Renewal */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Renewal Date</label>
            <input style={fieldInput} type="date" value={form.renewalDate} onChange={e => set("renewalDate", e.target.value)} />
          </div>
          <div style={{ paddingBottom: "0.1rem" }}>
            <label style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input type="checkbox" checked={form.autoRenews} onChange={e => set("autoRenews", e.target.checked)} />
              Auto-renews
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={fieldLabel}>Notes</label>
          <textarea style={{ ...fieldInput, resize: "vertical", minHeight: 64 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Contract number, login, notes…" />
        </div>

        {/* Active (edit only) */}
        {isEdit && (
          <div>
            <label style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
              Active
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary}>{isEdit ? "Save" : "Add Service"}</button>
        </div>
      </form>
    </div>
  );
}

// ── VisitModal ────────────────────────────────────────────────────────────────

function VisitModal({ service, initial, isEdit, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_VISIT, ...(initial || {}), serviceId: service?.id || "" }));

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  // If opened from History tab without a specific service, allow selecting
  const svcData = useForemanStore(s => s.services);
  const allServices = Object.values(svcData?.services ?? {}).filter(s => s.active);

  function handleSubmit(e) {
    e.preventDefault();
    const id = isEdit ? initial.id : "visit-" + Date.now();
    onSave({
      ...form,
      id,
      overrideCost: form.overrideCost === "" ? null : Number(form.overrideCost),
    });
  }

  return (
    <div style={modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={modalBox}>
        <div style={{ borderBottom: "1px solid var(--fm-hairline)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem" }}>
            {isEdit ? "Edit Visit" : "Log Visit"}
          </span>
          {service && (
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", marginLeft: "0.75rem" }}>
              {service.name}
            </span>
          )}
        </div>

        {/* Service selector (when opened from History tab without pre-selected service) */}
        {!service && (
          <div>
            <label style={fieldLabel}>Service *</label>
            <select required style={fieldSelect} value={form.serviceId} onChange={e => set("serviceId", e.target.value)}>
              <option value="">Select a service…</option>
              {allServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Date</label>
            <input required style={fieldInput} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Tech / Rep Name</label>
            <input style={fieldInput} value={form.techName} onChange={e => set("techName", e.target.value)} placeholder="e.g. John Smith" />
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Notes</label>
          <textarea style={{ ...fieldInput, resize: "vertical", minHeight: 64 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="What was done, findings, follow-up items…" />
        </div>

        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Override Cost ($) — blank = use service cost</label>
          <input style={fieldInput} type="number" min="0" step="0.01" value={form.overrideCost} onChange={e => set("overrideCost", e.target.value)} placeholder="Leave blank to inherit" />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary}>{isEdit ? "Save" : "Log Visit"}</button>
        </div>
      </form>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ServicesPage({ navigate, navState }) {
  const svcData       = useForemanStore(s => s.services);
  const addService    = useForemanStore(s => s.addService);
  const updateService = useForemanStore(s => s.updateService);
  const deleteService = useForemanStore(s => s.deleteService);
  const addVisit      = useForemanStore(s => s.addVisit);
  const updateVisit   = useForemanStore(s => s.updateVisit);
  const deleteVisit   = useForemanStore(s => s.deleteVisit);

  const allServices = useMemo(() => Object.values(svcData?.services ?? {}), [svcData]);
  const allVisits   = useMemo(() => Object.values(svcData?.visits ?? {}), [svcData]);

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("Services");

  // ── Services tab filters ─────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [catFilter, setCatFilter]       = useState("ALL");
  const [search, setSearch]             = useState("");
  const [expandedId, setExpandedId]     = useState(null);

  // Deep-link from the command palette: pre-fill search, or open the Add modal.
  useEffect(() => {
    if (navState?.search != null) { setActiveTab("Services"); setStatusFilter("ALL"); setSearch(navState.search); }
    if (navState?.openAdd) setAddOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── History tab filters ──────────────────────────────────────────────────
  const [histCatFilter, setHistCatFilter] = useState("ALL");
  const [histSearch, setHistSearch]       = useState("");

  // ── Modals ───────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen]       = useState(false);
  const [editSvc, setEditSvc]       = useState(null);    // service obj being edited
  const [visitSvc, setVisitSvc]     = useState(null);    // service to log visit for (null = general)
  const [visitFromHistory, setVisitFromHistory] = useState(false);
  const [editVisit, setEditVisit]   = useState(null);    // { visit, service } being edited
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // service id pending delete confirm
  const [confirmDeleteVisitId, setConfirmDeleteVisitId] = useState(null); // visit id pending delete confirm

  // ── Derived: categories present in data ──────────────────────────────────
  const presentCats = useMemo(() => {
    const cats = new Set(allServices.map(s => s.category === "Other" ? (s.customCategory || "Other") : s.category));
    return FIXED_SERVICE_CATEGORIES.filter(c => c === "Other" ? false : cats.has(c))
      .concat([...cats].filter(c => !FIXED_SERVICE_CATEGORIES.includes(c)));
  }, [allServices]);

  // ── Filtered services ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allServices;
    if (statusFilter === "ACTIVE") list = list.filter(s => s.active);
    if (catFilter !== "ALL") {
      list = list.filter(s => {
        const cat = s.category === "Other" ? (s.customCategory || "Other") : s.category;
        return cat === catFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.providerName || "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) =>
      (a.renewalDate || "").localeCompare(b.renewalDate || "") || a.name.localeCompare(b.name)
    );
  }, [allServices, statusFilter, catFilter, search]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const activeServices = useMemo(() => allServices.filter(s => s.active), [allServices]);
  const monthlyTotal = useMemo(
    () => activeServices.reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0),
    [activeServices]
  );

  // ── Filtered visits (History tab) ─────────────────────────────────────────
  const filteredVisits = useMemo(() => {
    return allVisits
      .filter(v => {
        const svc = svcData?.services?.[v.serviceId] ?? {};
        const cat = svc.category === "Other" ? (svc.customCategory || "Other") : svc.category;
        if (histCatFilter !== "ALL" && cat !== histCatFilter) return false;
        if (histSearch.trim()) {
          const q = histSearch.toLowerCase();
          if (
            !(svc.name || "").toLowerCase().includes(q) &&
            !(v.techName || "").toLowerCase().includes(q) &&
            !(v.notes || "").toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allVisits, svcData, histCatFilter, histSearch]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function visitsFor(serviceId) {
    return allVisits.filter(v => v.serviceId === serviceId);
  }

  function handleSaveService(svcObj) {
    if (editSvc) {
      updateService(svcObj.id, svcObj);
    } else {
      addService(svcObj);
    }
    setAddOpen(false);
    setEditSvc(null);
  }

  function handleDeleteService(id) {
    deleteService(id); // lib deleteService also prunes all of this service's visits
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteId(null);
  }

  function handleSaveVisit(visitObj) {
    if (editVisit) {
      updateVisit(visitObj.id, visitObj);
      setEditVisit(null);
    } else {
      addVisit(visitObj);
    }
    setVisitSvc(null);
    setVisitFromHistory(false);
  }

  function handleDeleteVisit(id) {
    deleteVisit(id);
    setConfirmDeleteVisitId(null);
  }

  function openEditVisit(visit) {
    const svc = svcData?.services?.[visit.serviceId] ?? null;
    setEditVisit({ visit, service: svc });
  }

  const today = new Date().toISOString().slice(0, 10);

  function renewalStatus(renewalDate) {
    if (!renewalDate) return null;
    const diff = Math.round((new Date(renewalDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
    if (diff < 0)  return { label: "Expired", color: "var(--fm-red)" };
    if (diff <= 30) return { label: `${diff}d`, color: "var(--fm-amber)" };
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>

      <FmHeader active="Services" tagline="Services" />

      <FmSubnav
        tabs={["Services", "History"]}
        active={activeTab}
        onTabChange={tab => { setActiveTab(tab); }}
        stats={activeTab === "Services"
          ? [
              { value: activeServices.length, label: "active" },
              { value: "$" + Math.round(monthlyTotal), label: "/mo" },
            ]
          : [{ value: filteredVisits.length, label: "visits logged" }]
        }
      />

      {/* ── Services tab ── */}
      {activeTab === "Services" && (
        <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl)" }}>

          {/* Filter bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem", alignItems: "center" }}>
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: "0.25rem", width: 44, flexShrink: 0 }}>Status</span>
            <FilterDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "ACTIVE", label: "Active" }, { value: "ALL", label: "All" }]}
            />
            <div style={{ flex: 1 }} />
            <button style={btnPrimary} onClick={() => setAddOpen(true)}>+ Add Service</button>
          </div>

          {presentCats.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem", alignItems: "center" }}>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: "0.25rem", width: 44, flexShrink: 0 }}>Category</span>
              <FilterDropdown
                value={catFilter}
                onChange={setCatFilter}
                options={[{ value: "ALL", label: "All" }, ...presentCats.map(c => ({ value: c, label: c }))]}
              />
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search services or providers…"
              style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.7rem", width: 260 }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
            />
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
              {allServices.length === 0
                ? "No services yet. Click \"+ Add Service\" to add your first contract."
                : "No services match the current filter."}
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thCell, width: 24 }} />
                  <th style={thCell}>Name</th>
                  <th style={thCell}>Category</th>
                  <th style={thCell}>Provider</th>
                  <th style={thCell}>Cost</th>
                  <th style={thCell}>Cycle</th>
                  <th style={thCell}>Renews</th>
                  <th style={thCell}>Status</th>
                  <th style={{ ...thCell, width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(svc => {
                  const isExpanded = expandedId === svc.id;
                  const svcVisits = visitsFor(svc.id).sort((a, b) => b.date.localeCompare(a.date));
                  const renewal = renewalStatus(svc.renewalDate);
                  return (
                    <>
                      <tr
                        key={svc.id}
                        style={{ cursor: "pointer", opacity: svc.active ? 1 : 0.5 }}
                        onClick={() => setExpandedId(isExpanded ? null : svc.id)}
                      >
                        <td style={{ ...tdCell, color: "var(--fm-ink-mute)", fontSize: "0.7rem" }}>
                          {isExpanded ? "▾" : "▸"}
                        </td>
                        <td style={{ ...tdCell, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)" }}>{svc.name}</td>
                        <td style={tdCell}>{displayCat(svc)}</td>
                        <td style={tdCell}>{svc.providerName || "—"}</td>
                        <td style={tdCell}>{fmtCost(svc.cost)}</td>
                        <td style={tdCell}>{svc.billingCycle}</td>
                        <td style={tdCell}>
                          {svc.renewalDate ? (
                            <span>
                              {fmtDate(svc.renewalDate)}
                              {renewal && (
                                <span style={{ marginLeft: "0.4rem", color: renewal.color, fontWeight: 600 }}>
                                  ({renewal.label})
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={tdCell}>
                          <span style={{
                            background: svc.active ? "rgba(127,176,135,0.12)" : "var(--fm-bg-sunk)",
                            border: `1px solid ${svc.active ? "var(--fm-green)" : "var(--fm-hairline2)"}`,
                            borderRadius: "var(--fm-radius)",
                            color: svc.active ? "var(--fm-green)" : "var(--fm-ink-mute)",
                            fontFamily: "var(--fm-mono)",
                            fontSize: "0.6rem",
                            letterSpacing: "0.08em",
                            padding: "0.1rem 0.35rem",
                            textTransform: "uppercase",
                          }}>
                            {svc.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td style={{ ...tdCell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          {confirmDeleteId === svc.id ? (
                            <>
                              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginRight: "0.4rem" }}>Delete + visits?</span>
                              <button
                                style={{ ...btnDanger, fontSize: "0.62rem", padding: "0.2rem 0.5rem", marginRight: "0.35rem" }}
                                onClick={() => handleDeleteService(svc.id)}
                              >Yes</button>
                              <button
                                style={{ ...btnGhost, fontSize: "0.62rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => setConfirmDeleteId(null)}
                              >No</button>
                            </>
                          ) : (
                            <>
                              <button
                                style={{ ...btnGhost, fontSize: "0.62rem", padding: "0.2rem 0.5rem", marginRight: "0.35rem" }}
                                onClick={() => setEditSvc(svc)}
                              >Edit</button>
                              <button
                                style={{ ...btnDanger, fontSize: "0.62rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => setConfirmDeleteId(svc.id)}
                                title="Delete service and all its visits"
                              >✕</button>
                            </>
                          )}
                        </td>
                      </tr>

                      {/* Expanded: inline visits */}
                      {isExpanded && (
                        <tr key={svc.id + "-exp"}>
                          <td colSpan={9} style={{ background: "var(--fm-bg-sunk)", borderBottom: "1px solid var(--fm-hairline)", padding: "0.75rem 0.75rem 0.75rem 2.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                Visits ({svcVisits.length})
                              </span>
                              <button
                                style={{ ...btnPrimary, fontSize: "0.62rem", padding: "0.2rem 0.55rem" }}
                                onClick={e => { e.stopPropagation(); setVisitSvc(svc); }}
                              >+ Log Visit</button>
                            </div>

                            {svcVisits.length === 0 ? (
                              <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", margin: 0 }}>
                                No visits logged yet.
                              </p>
                            ) : (
                              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                <thead>
                                  <tr>
                                    {["Date", "Tech", "Notes", "Cost", ""].map(h => (
                                      <th key={h} style={{ ...thCell, fontSize: "0.54rem" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {svcVisits.map(v => (
                                    <tr key={v.id}>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap", color: "var(--fm-brass-dim)" }}>{fmtDate(v.date)}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem" }}>{v.techName || "—"}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", maxWidth: 280 }}>{v.notes || "—"}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap" }}>
                                        {v.overrideCost != null ? fmtCost(v.overrideCost) : fmtCost(svc.cost)}
                                      </td>
                                      <td style={{ ...tdCell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                                        {confirmDeleteVisitId === v.id ? (
                                          <>
                                            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", marginRight: "0.35rem" }}>Delete?</span>
                                            <button
                                              style={{ ...btnDanger, fontSize: "0.58rem", padding: "0.15rem 0.4rem", marginRight: "0.3rem" }}
                                              onClick={() => handleDeleteVisit(v.id)}
                                            >Yes</button>
                                            <button
                                              style={{ ...btnGhost, fontSize: "0.58rem", padding: "0.15rem 0.4rem" }}
                                              onClick={() => setConfirmDeleteVisitId(null)}
                                            >No</button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              style={{ ...btnGhost, fontSize: "0.58rem", padding: "0.15rem 0.4rem", marginRight: "0.3rem" }}
                                              onClick={() => openEditVisit(v)}
                                            >Edit</button>
                                            <button
                                              style={{ ...btnDanger, fontSize: "0.58rem", padding: "0.15rem 0.4rem" }}
                                              onClick={() => setConfirmDeleteVisitId(v.id)}
                                              title="Delete this visit"
                                            >✕</button>
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "History" && (
        <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl)" }}>

          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <FilterDropdown
              value={histCatFilter}
              onChange={setHistCatFilter}
              options={[{ value: "ALL", label: "All" }, ...presentCats.map(cat => ({ value: cat, label: cat }))]}
            />
            <div style={{ flex: 1 }} />
            <button style={btnPrimary} onClick={() => { setVisitSvc(null); setVisitFromHistory(true); }}>+ Log Visit</button>
            <input
              value={histSearch}
              onChange={e => setHistSearch(e.target.value)}
              placeholder="Search…"
              style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.7rem", width: 200 }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
            />
          </div>

          {allVisits.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
              No visits logged yet. Use &quot;Log Visit&quot; on any service to record a completed visit.
            </p>
          ) : filteredVisits.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
              No results match your filter.
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Date", "Service", "Category", "Provider", "Tech", "Notes", "Cost"].map(h => (
                    <th key={h} style={thCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredVisits.map(v => {
                  const svc = svcData?.services?.[v.serviceId] ?? {};
                  return (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                      <td style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}>{fmtDate(v.date)}</td>
                      <td style={{ ...tdCell, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)" }}>{svc.name || "—"}</td>
                      <td style={tdCell}>{svc.id ? displayCat(svc) : "—"}</td>
                      <td style={tdCell}>{svc.providerName || "—"}</td>
                      <td style={tdCell}>{v.techName || "—"}</td>
                      <td style={{ ...tdCell, maxWidth: 280 }}>{v.notes || "—"}</td>
                      <td style={{ ...tdCell, whiteSpace: "nowrap" }}>
                        {v.overrideCost != null ? fmtCost(v.overrideCost) : fmtCost(svc.cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {(addOpen || editSvc) && (
        <ServiceModal
          initial={editSvc ?? {}}
          isEdit={!!editSvc}
          onSave={handleSaveService}
          onClose={() => { setAddOpen(false); setEditSvc(null); }}
        />
      )}

      {(visitSvc !== null || visitFromHistory) && !editVisit && (
        <VisitModal
          service={visitSvc}
          initial={null}
          isEdit={false}
          onSave={handleSaveVisit}
          onClose={() => { setVisitSvc(null); setVisitFromHistory(false); }}
        />
      )}

      {editVisit && (
        <VisitModal
          service={editVisit.service}
          initial={editVisit.visit}
          isEdit={true}
          onSave={handleSaveVisit}
          onClose={() => setEditVisit(null)}
        />
      )}
    </div>
  );
}
