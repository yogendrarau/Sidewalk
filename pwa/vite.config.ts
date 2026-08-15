import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4477",
      "/media": "http://localhost:4477",
      "/shop-media": "http://localhost:4477",
      "/pay": "http://localhost:4477",
    },
  },
});
