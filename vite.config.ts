// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Server routes (email webhooks) need non-VITE_ env vars in process.env.
Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), ""));

export default defineConfig({
  vite: {
    plugins: [VitePWA({
      strategies: "generateSW",
      filename: "sw.js",
      injectRegister: null,
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["offline.html", "pwa-*.png", "favicon.png"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && url.origin === self.location.origin && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/lovable/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "smatrapay-navigation",
              // Reject every response from storage: personal HTML never becomes an offline page.
              cacheableResponse: { statuses: [] },
              precacheFallback: { fallbackURL: "/offline.html" },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/[^/]+-[\w-]{8,}\.(js|css|woff2|png|jpg|webp)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "smatrapay-static-assets", expiration: { maxEntries: 80, maxAgeSeconds: 2592000 } },
          },
        ],
      },
    })],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve("node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve("node_modules/entities/lib/encode.js"),
        entities: path.resolve("node_modules/entities"),
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
