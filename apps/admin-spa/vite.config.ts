import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteVersionPlugin } from "@checkin/spa-version-guard";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/admin/",
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  plugins: [
    react(),
    viteVersionPlugin({
      version: "1.0.2",
      title: "LimArt Admin Portal",
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router/") ||
              id.includes("/react-router-dom/")
            ) {
              return "vendor-react";
            }
            if (
              id.includes("/lucide-react/") ||
              id.includes("/@radix-ui/react-tooltip/") ||
              id.includes("/@radix-ui/react-dialog/") ||
              id.includes("/@radix-ui/react-dropdown-menu/") ||
              id.includes("/@radix-ui/react-tabs/")
            ) {
              return "vendor-ui";
            }
          }
        },
      },
    },
  },
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
}));
