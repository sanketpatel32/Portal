import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
    resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    // Subapps are React.lazy code-split, so each route chunk is well under the
    // default 500KB hint. The only "large" chunk is the shared index (React +
    // framework shell), which is stable and cacheable across app updates.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split heavy third-party libs into their own long-term-cacheable chunks
        // so that app-only changes don't bust the browser cache for vendors.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || /node_modules[\\/]react[\\/]/.test(id)) {
              return "react-vendor";
            }
            if (id.includes("@dnd-kit")) {
              return "dnd-vendor";
            }
            if (id.includes("zod")) {
              return "zod-vendor";
            }
            if (id.includes("react-day-picker") || id.includes("radix-ui")) {
              return "calendar-vendor";
            }
          }
        },
      },
    },
  },
})
