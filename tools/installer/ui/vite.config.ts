import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Small fixed-size wizard window; assets are embedded into the installer
// binary by tauri-build (frontendDist: ui/dist).
export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 1430,
        strictPort: true,
    },
    build: {
        outDir: "dist",
        target: "es2021",
    },
});
