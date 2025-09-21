// vite.config.mjs
import { defineConfig } from 'vite';

const CF_HOST = 'away-beverages-adoption-reasonably.trycloudflare.com'; // replace if yours changes

export default defineConfig({
  server: {
    host: '0.0.0.0',          // listen on all interfaces so the tunnel can reach it
    port: 5173,
    strictPort: true,

    // IMPORTANT: must be an ARRAY. You can allow the exact host and/or the whole domain.
    allowedHosts: [CF_HOST, '.trycloudflare.com'],

    // HMR over the public tunnel URL (prevents websocket issues)
    hmr: {
      protocol: 'wss',
      host: CF_HOST,
      clientPort: 443
    },

    // Optional but handy in dev:
    cors: true
  }
});
