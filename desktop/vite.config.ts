import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
    plugins: [react(), tailwindcss()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
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

    build: {
        rollupOptions: {
            output: {
                // perf: manually chunk heavy deps so they get separate cache-busted files
                // and the main bundle stays small for fast first paint.
                manualChunks: (id) => {
                    // ReactFlow (visual node canvas) — large, rarely used
                    if (id.includes("reactflow") || id.includes("@reactflow")) {
                        return "reactflow";
                    }
                    // floating-ui (autocomplete positioning)
                    if (id.includes("@floating-ui")) {
                        return "floating-ui";
                    }
                    // use-debounce
                    if (id.includes("use-debounce")) {
                        return "debounce";
                    }
                    // Tauri API modules
                    if (id.includes("@tauri-apps")) {
                        return "tauri-api";
                    }
                    // React core
                    if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
                        return "react-vendor";
                    }
                },
            },
        },
        // Warn on chunks > 500 kB
        chunkSizeWarningLimit: 500,
    },
}));
