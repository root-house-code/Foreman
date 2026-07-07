import { useSyncExternalStore } from "react";

// Single breakpoint for the mobile experience — phone-width viewports get the
// mobile chrome (bottom nav, card lists, bottom-sheet modals) regardless of
// how the app is served (Android app, LAN browser, PWA). Desktop layouts are
// untouched above this width.
const QUERY = "(max-width: 720px)";

function subscribe(cb) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** True on phone-width viewports; live-updates on rotation/resize. */
export default function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Page-shell height on phones: full dynamic viewport minus the fixed bottom
// tab bar (56px) and the gesture-bar safe area, so viewport-locked pages
// (height:100vh + inner scrollers) end above the nav instead of under it.
export const MOBILE_SHELL_HEIGHT = "calc(100dvh - 56px - env(safe-area-inset-bottom))";
