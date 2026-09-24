import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createApi } from './server/api.ts'

/** Serves the game API (answers stay server-side) in both `vite` dev and `vite preview`. */
function gameApi(): Plugin {
  const api = createApi(path.resolve(import.meta.dirname, 'server/data/pool.json'))
  return {
    name: 'photoguessr-api',
    configureServer: (server) => void server.middlewares.use(api),
    configurePreviewServer: (server) => void server.middlewares.use(api),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), gameApi()],
  server: {
    host: true,
    // The dev server serves any project file by URL; keep answers and raw data unreachable.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/scripts/**', '**/photos/**'] },
  },
})
