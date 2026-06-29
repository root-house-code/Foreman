import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // react-draggable's log() reads process.env.DRAGGABLE_DEBUG, which throws
  // "process is not defined" in the browser on every drag-start (breaking all
  // react-grid-layout dragging). Vite only auto-replaces process.env.NODE_ENV,
  // so define this explicitly.
  define: {
    "process.env.DRAGGABLE_DEBUG": "false",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
