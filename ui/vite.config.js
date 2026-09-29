import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  plugins: [react()],
  server: {
    port: 4000,
    proxy: {
      "/api": "http://localhost:3001"
    }
  },
  optimizeDeps: {
    entries: ["src/main.jsx"]
  }
});