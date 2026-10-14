import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { viteVersionPlugin } from "@checkin/spa-version-guard";

export default defineConfig(({ mode }) => ({
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  plugins: [
    react(),
    viteVersionPlugin({
      version: "1.0.1",
      title: "LimArt Chấm Công Staff",
    }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "apple-touch-icon.png",
        "logo.png",
        "icon-192.png"
      ],
      manifest: {
        name: "LimArt Chấm Công",
        short_name: "LimArt",
        description: "Ứng dụng chấm công nhân viên LimArt Mobile-First & Offline-First",
        theme_color: "#faf6f0",
        background_color: "#faf6f0",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/admin/, /^\/api/],
        globPatterns: ["**/*.{js,css,html,svg,webp,woff,woff2}"],
        globIgnores: ["**/capybara_bg.png", "**/capybara_mascot.png", "**/icons/capy_*.png"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.googleusercontent\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-avatar-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // CacheFirst cho static assets (fonts, icons, images, css, js)
            urlPattern: ({ request, url }) =>
              !url.pathname.startsWith("/admin") &&
              (request.destination === "style" ||
                request.destination === "script" ||
                request.destination === "image" ||
                request.destination === "font"),
            handler: "CacheFirst",
            options: {
              cacheName: "limart-v3-static-assets",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // NetworkFirst cho API endpoints với timeout fallback (chỉ staff endpoints, không cache /api/admin/*)
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/staff/") ||
              url.pathname === "/api/checkins/today" ||
              url.pathname === "/api/ip-status",
            handler: "NetworkFirst",
            options: {
              cacheName: "limart-v2-api-cache",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/")) {
              return "vendor-react";
            }
            if (id.includes("/@tanstack/react-query/")) {
              return "vendor-query";
            }
            if (id.includes("/lucide-react/") || id.includes("/sonner/")) {
              return "vendor-ui";
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true
  }
}));
