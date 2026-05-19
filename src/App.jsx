import { useState, useMemo } from "react";
import { FmNavContext } from "./context/FmNavContext";
import { migrateToEntityTypes } from "../lib/entityTypes.js";
import { initRoomsFromCategories } from "../lib/rooms.js";
import HomeMaintenanceTable from "../home-maintenance.jsx";
import InventoryPage from "../inventory-page.jsx";
import BoardPage from "../board-page.jsx";
import ProjectsPage from "../projects-page.jsx";
import DashboardPage from "../dashboard-page.jsx";
import GuidePage from "../guide-page.jsx";
import ChoresPage from "../chores-page.jsx";
import CalendarPage from "../calendar-page.jsx";
import PreferencesPage from "../preferences-page.jsx";

// Run once at module load — idempotent, safe to re-run on HMR
migrateToEntityTypes();
initRoomsFromCategories();

const PAGE_KEYS = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  inventory: "Inventory",
  maintenance: "Maintenance",
  chores: "Chores",
  board: "To Dos",
  projects: "Projects",
  guide: "Guide",
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
    if (page === "inventory") return <InventoryPage navigate={navigate} navState={navState} />;
    if (page === "dashboard") return <DashboardPage navigate={navigate} />;
    if (page === "board") return <BoardPage navigate={navigate} />;
    if (page === "projects") return <ProjectsPage navigate={navigate} />;
    if (page === "guide") return <GuidePage navigate={navigate} />;
    if (page === "chores") return <ChoresPage navigate={navigate} navState={navState} />;
    if (page === "calendar") return <CalendarPage navigate={navigate} />;
    if (page === "preferences") return <PreferencesPage navigate={navigate} />;
    return <HomeMaintenanceTable navigate={navigate} navState={navState} />;
  };

  return (
    <FmNavContext.Provider value={navContextValue}>
      {pageContent()}
    </FmNavContext.Provider>
  );
}
