import { useState, useMemo } from "react";
import { useForemanStore } from "./lib/store.js";
import { buildAlerts, summarizeAlerts } from "./lib/alerts.js";
import { loadChoreNextDates } from "./lib/chores.js";
import { storageGet } from "./lib/storage.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";

const TABS = ["All", "Maintenance", "Chores", "Warranties", "Supplies", "Services", "Planned"];
const TAB_KIND = {
  Maintenance: "maintenance", Chores: "chore", Warranties: "warranty",
  Supplies: "supply", Services: "service", Planned: "planned",
};

const SECTIONS = [
  { sev: "overdue", label: "Overdue",  color: "var(--fm-red)" },
  { sev: "soon",    label: "Due Soon", color: "var(--fm-amber)" },
  { sev: "info",    label: "Heads-Up", color: "var(--fm-brass)" },
];

const SEV_COLOR = { overdue: "var(--fm-red)", soon: "var(--fm-amber)", info: "var(--fm-brass)" };
const KIND_LABEL = {
  maintenance: "MAINT", chore: "CHORE", warranty: "WARR", supply: "SUPPLY", service: "SVC", planned: "PLAN",
};

const sectionTitle = {
  color: "var(--fm-ink-mute)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function fmtDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AlertsPage({ navigate }) {
  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const supplies        = useForemanStore(s => s.supplies);
  const services        = useForemanStore(s => s.services);
  const chores          = useForemanStore(s => s.chores);
  const budget          = useForemanStore(s => s.budget);

  const [choreNextDates] = useState(() => loadChoreNextDates());
  const nextDatesMap = useMemo(() => storageGet("maintenance-next-dates") ?? {}, []);
  const [activeTab, setActiveTab] = useState("All");

  const alerts = useMemo(
    () => buildAlerts({ itemFieldValues, inventory, supplies, services, chores, choreNextDates, nextDatesMap, budget }),
    [itemFieldValues, inventory, supplies, services, chores, choreNextDates, nextDatesMap, budget]
  );

  const summary = useMemo(() => summarizeAlerts(alerts), [alerts]);

  const filtered = useMemo(
    () => activeTab === "All" ? alerts : alerts.filter(a => a.kind === TAB_KIND[activeTab]),
    [alerts, activeTab]
  );

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Triage" tagline="Triage" />
      <FmSubnav
        tabs={TABS}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={[
          { value: summary.overdue, label: "overdue",  color: summary.overdue > 0 ? "var(--fm-red)" : "var(--fm-green)" },
          { value: summary.soon,    label: "due soon", color: summary.soon > 0 ? "var(--fm-amber)" : "var(--fm-ink)" },
          { value: summary.total,   label: "total" },
        ]}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem 3rem" }}>
        {filtered.length === 0 ? (
          <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "0.5rem", justifyContent: "center", paddingTop: "6rem" }}>
            <div style={{ color: "var(--fm-green)", fontFamily: "var(--fm-serif)", fontSize: "1.4rem" }}>All clear</div>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem" }}>
              {alerts.length === 0 ? "No active alerts across your home." : "No alerts in this filter."}
            </div>
          </div>
        ) : (
          SECTIONS.map(section => {
            const rows = filtered.filter(a => a.severity === section.sev);
            if (rows.length === 0) return null;
            return (
              <div key={section.sev} style={{ marginBottom: "1.75rem" }}>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <span style={{ background: section.color, borderRadius: "50%", height: 7, width: 7 }} />
                  <span style={sectionTitle}>{section.label}</span>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{rows.length}</span>
                </div>
                <div style={{ border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", overflow: "hidden" }}>
                  {rows.map((a, i) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(a.nav.page, a.nav.state)}
                      style={{
                        alignItems: "center", background: "var(--fm-bg-panel)",
                        border: "none", borderBottom: i < rows.length - 1 ? "var(--fm-border)" : "none",
                        borderLeft: `3px solid ${SEV_COLOR[a.severity]}`,
                        cursor: "pointer", display: "flex", gap: "0.85rem", padding: "0.7rem 1rem",
                        textAlign: "left", transition: "background 0.1s", width: "100%",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--fm-bg-panel)"; }}
                    >
                      <span style={{ color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.08em", width: 48 }}>
                        {KIND_LABEL[a.kind]}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: "var(--fm-ink)", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        {a.sub && (
                          <span style={{ color: "var(--fm-ink-mute)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.sub}
                          </span>
                        )}
                      </span>
                      <span style={{ color: SEV_COLOR[a.severity], flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.65rem", textAlign: "right" }}>
                        {a.detail}
                      </span>
                      {a.date && (
                        <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", textAlign: "right", width: 52 }}>
                          {fmtDate(a.date)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
