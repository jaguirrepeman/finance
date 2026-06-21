import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  base: "/finance/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Portfolio Tracker",
        short_name: "Portfolio",
        description: "Personal investment portfolio tracker and analytics",
        theme_color: "#1a1f2e",
        background_color: "#0f1419",
        display: "standalone",
        start_url: "/finance/",
        scope: "/finance/",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Datos financieros: NetworkFirst para que SIEMPRE se muestre el dato
            // fresco de la Pi cuando hay red, y solo se sirva el caché como
            // respaldo si la red falla o tarda demasiado (offline / Pi caída).
            // Antes era StaleWhileRevalidate, que podía pintar cifras viejas.
            // (Coincide por pathname: un RegExp se evalúa contra el href completo
            // —https://host/...— y "^/finance" nunca casaría.)
            urlPattern: ({ url }) => url.pathname.startsWith("/finance/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 4, // si la Pi tarda >4s, cae al caché
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/finance/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
