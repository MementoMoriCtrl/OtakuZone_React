import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, preview } from 'vite'
import { loadEnvironment } from '../backend/src/config/loadEnvironment.js'
import { loadConfig } from '../backend/src/config/env.js'
import { createApp } from '../backend/src/app.js'

// Validate the existing local configuration without opening its database pool.
loadEnvironment()
try { loadConfig() } catch { throw new Error('Configuración local inválida; valores privados omitidos.') }
console.log('Configuración backend local válida; no se abre MySQL.')

let dev, built, api
const app = createApp({ config: loadConfig({ NODE_ENV: 'test' }) })
try {
  api = app.listen(0, '127.0.0.1')
  await once(api, 'listening')
  const base = `http://127.0.0.1:${api.address().port}/api/v1`
  for (const path of ['/health', '/products']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).success, true)
  }
  dev = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0, open: false } })
  await dev.listen()
  const origin = `http://127.0.0.1:${dev.httpServer.address().port}`
  for (const path of ['/', '/perfil', '/src/main.jsx', '/src/services/auth.js']) {
    assert.equal((await fetch(origin + path)).status, 200)
  }
  built = await preview({ mode: 'local-preview', build: { outDir: 'dist-local' }, preview: { host: '127.0.0.1', port: 0, open: false } })
  const response = await fetch(`http://127.0.0.1:${built.httpServer.address().port}/perfil`)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /id="root"/)
  console.log('Smoke local aprobado: Vite, módulos React, ruta profunda, preview y API demo; sin escrituras ni AniList externo.')
} finally {
  if (dev) await dev.close()
  if (built) await new Promise(resolve => built.httpServer.close(resolve))
  if (api) { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)) }
  await app.locals.closeResources()
}
