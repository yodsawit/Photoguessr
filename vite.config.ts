import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** API port of the local Node server (`npm run dev:server`, server/index.ts). */
const API_PORT = Number(process.env.API_PORT ?? 8787)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: { '/api': `http://localhost:${API_PORT}` },
    // The dev server serves any project file by URL; keep server code, scripts and raw photos unreachable.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/scripts/**', '**/photos/**', '**/sweeper/**'] },
  },
})
