import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { validateProductionApi } from './src/config/api.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    if (mode === 'local-preview' && process.env.VERCEL) throw new Error('El build local no se puede publicar en Vercel.')
    if (mode !== 'local-preview') validateProductionApi(loadEnv(mode, process.cwd(), 'VITE_'))
  }
  return { plugins: [react(), tailwindcss()], build: { outDir: mode === 'local-preview' ? 'dist-local' : 'dist' } }
})
