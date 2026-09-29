import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: {
    port: 4173,
    strictPort: true,
    allowedHosts: ['weiltron-1.taila6a1e2.ts.net'],
  },
  plugins: [VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['icons/*.png', 'icons/kestrel.svg'],
    manifest: {
      id: '/',
      name: 'Kestrel',
      short_name: 'Kestrel',
      description: 'An illustrated spaceship card battle. Command the Kestrel from the bridge.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'landscape',
      theme_color: '#101d27',
      background_color: '#070d18',
      icons: [
        { src: '/icons/kestrel-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/kestrel-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/kestrel-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      cacheId: 'kestrel-bridge',
      globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,webmanifest}'],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      navigateFallback: '/index.html',
      navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/],
      cleanupOutdatedCaches: false,
      skipWaiting: false,
      clientsClaim: false,
      // The complete, content-hashed shell is precached. No unbounded runtime
      // cache and no cache deletion outside Workbox's Kestrel namespace.
      runtimeCaching: [],
    },
    devOptions: { enabled: false },
  })],
});
