import { useState, useMemo, Component } from "react";
import { FmNavContext } from "./context/FmNavContext";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "#ff6b6b", padding: "2rem", fontFamily: "monospace", background: "#1a0000", minHeight: "100vh" }}>
          <h2 style={{ color: "#ff4444" }}>Render Error</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8em", opacity: 0.7 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { migrateToEntityTypes } from "../lib/entityTypes.js";
import { runMigrations } from "../lib/migration.js";
import HomeMaintenanceTable from "../home-maintenance.jsx";
import InventoryPage from "../inventory-page.jsx";
import BoardPage from "../board-page.jsx";
import ProjectsPage from "../projects-page.jsx";
import DashboardPage from "../dashboard-page.jsx";
import GuidePage from "../guide-page.jsx";
import TimelinePage from "../timeline-page.jsx";
import ChoresPage from "../chores-page.jsx";
import CalendarPage from "../calendar-page.jsx";
import PreferencesPage from "../preferences-page.jsx";
import ReadMePage from "../read-me-page.jsx";
import FloorPlanPage from "../floor-plan-page.jsx";
import ServicesPage from "../services-page.jsx";
import LifecyclePage from "../lifecycle-page.jsx";
import SuppliesPage from "../supplies-page.jsx";
import UtilitiesPage from "../utilities-page.jsx";
import CommandPalette from "../components/CommandPalette.jsx";
import WorkbenchPage from "../workbench-page.jsx";

// Run once at module load — idempotent, safe to re-run on HMR
migrateToEntityTypes();
runMigrations();

const PAGE_KEYS = {
  readme: "Read Me",
  dashboard: "Dashboard",
  calendar: "Calendar",
  floorplan: "Floor Plan",
  inventory: "Inventory",
  maintenance: "Maintenance",
  services: "Services",
  utilities: "Utilities",
  supplies: "Supplies",
  chores: "Chores",
  workbench: "Workbench",
  board: "To Dos",
  projects: "Projects",
  lifecycle: "Lifecycle",
  guide: "Notebook",
  timeline: "Timeline",
  preferences: "Preferences",
};

export default function App() {
  const [page, setPage] = useState("maintenance");
  const [navState, setNavState] = useState(null);

  const navigate = (pageOrKey, state = null) => {
    // Handle both page keys (dashboard, maintenance) and page names (Dashboard, Maintenance)
    const key = Object.entries(PAGE_KEYS).find(([k, v]) => k === pageOrKey || v === pageOrKey)?.[0] || pageOrKey;
    setPage(key);
    setNavState(state);
  };

  const navContextValue = useMemo(
    () => ({
      current: PAGE_KEYS[page] || page,
      navigate,
    }),
    [page]
  );

  const pageContent = () => {
    if (page === "readme") return <ReadMePage navigate={navigate} />;
    if (page === "floorplan") return <FloorPlanPage navigate={navigate} />;
    if (page === "inventory") return <InventoryPage navigate={navigate} navState={navState} />;
    if (page === "dashboard") return <DashboardPage navigate={navigate} />;
    if (page === "workbench") return <WorkbenchPage navigate={navigate} navState={navState} />;
    if (page === "board") return <BoardPage navigate={navigate} navState={navState} />;
    if (page === "projects") return <ProjectsPage navigate={navigate} navState={navState} />;
    if (page === "guide") return <GuidePage navigate={navigate} />;
    if (page === "timeline") return <TimelinePage navigate={navigate} />;
    if (page === "services") return <ServicesPage navigate={navigate} navState={navState} />;
    if (page === "utilities") return <UtilitiesPage navigate={navigate} navState={navState} />;
    if (page === "supplies") return <SuppliesPage navigate={navigate} />;
    if (page === "lifecycle") return <LifecyclePage navigate={navigate} navState={navState} />;
    if (page === "chores") return <ChoresPage navigate={navigate} navState={navState} />;
    if (page === "calendar") return <CalendarPage navigate={navigate} />;
    if (page === "preferences") return <PreferencesPage navigate={navigate} />;
    return <HomeMaintenanceTable navigate={navigate} navState={navState} />;
  };

  return (
    <FmNavContext.Provider value={navContextValue}>
      <ErrorBoundary>
        {pageContent()}
      </ErrorBoundary>
      <CommandPalette navigate={navigate} />
    </FmNavContext.Provider>
  );
}
