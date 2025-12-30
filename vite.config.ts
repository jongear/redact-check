import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/redact-check/",
  server: {
    watch: {
      usePolling: true,
      interval: 250,
    },
    hmr: {
      overlay: true,
    },
  },
});
