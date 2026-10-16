import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiTarget = `http://localhost:${process.env["API_PORT"] ?? "3001"}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin in dev: /api/health -> http://localhost:3001/health (no CORS needed).
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
})
