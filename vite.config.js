import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // Pre-transform the Svelte components on server start (after SvelteKit's sync), so the
    // browser's initial burst hits warm, correctly-scoped modules. Without this, the first
    // load races sync and some components (TopNav, AgentTree) get served with their scoped
    // CSS dropped — panels render with no background until the file is re-transformed.
    warmup: {
      clientFiles: [
        "./src/routes/+layout.svelte",
        "./src/routes/+page.svelte",
        "./src/lib/components/*.svelte",
      ],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
