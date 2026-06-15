import { useMemo, useState } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { useForemanStore } from "./lib/store.js";
import { loadMaintenanceCompletionRecords } from "./lib/maintenance.js";
import { loadChoreCompletionRecords } from "./lib/choreCompletions.js";
import { buildJournal } from "./lib/journal.js";
import JournalView from "./components/JournalView.jsx";

// Timeline — the home's activity history. A read-only roll-up of completed
// maintenance, chores, service visits, expenses, projects, and work sessions,
// built at read time by buildJournal (lib/journal.js).
export default function TimelinePage({ navigate }) {
  const chores    = useForemanStore(s => s.chores);
  const services  = useForemanStore(s => s.services);
  const utilities = useForemanStore(s => s.utilities);
  const expenses  = useForemanStore(s => s.expenses);
  const projects  = useForemanStore(s => s.projects);
  const sessions  = useForemanStore(s => s.sessions);
  const [maintenanceRecords] = useState(() => loadMaintenanceCompletionRecords());
  const [choreRecords]       = useState(() => loadChoreCompletionRecords());

  const journalEvents = useMemo(
    () => buildJournal({ maintenanceRecords, choreRecords, chores, services, utilities, expenses, projects, sessions }),
    [maintenanceRecords, choreRecords, chores, services, utilities, expenses, projects, sessions]
  );

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Timeline" tagline="Timeline" />
      <FmSubnav
        tabs={["Timeline"]}
        active="Timeline"
        stats={[{ value: journalEvents.length, label: "entries", color: "var(--fm-brass)" }]}
      />
      <JournalView events={journalEvents} navigate={navigate} />
    </div>
  );
}
