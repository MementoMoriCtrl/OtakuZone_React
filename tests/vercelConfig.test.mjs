import test from 'node:test'
import assert from 'node:assert/strict'
import { createVercelConfig } from '../scripts/vercel-config.mjs'
import { validateProductionApi } from '../src/config/api.js'

test('proxy exige origen HTTPS Render fijo y no refleja entrada arbitraria', () => {
  for (const value of [undefined, '', 'http://fixture.onrender.com', 'https://fixture.onrender.com/api', 'https://user:pass@fixture.onrender.com', 'https://fixture.test', 'https://fixture.onrender.com?secret=x']) assert.throws(() => createVercelConfig({ RENDER_API_ORIGIN: value }), error => !error.message.includes('secret=x'))
})
test('rutas API preceden SPA, no cachean y frontend puede usar su propio origen', () => {
  const config = createVercelConfig({ RENDER_API_ORIGIN: 'https://fixture.onrender.com' })
  assert.deepEqual(config.rewrites.map(r => r.source), ['/api/v1', '/api/v1/:path*', '/(.*)'])
  assert.equal(config.rewrites[1].destination, 'https://fixture.onrender.com/api/v1/:path*')
  for (const h of config.headers.slice(0, 2)) assert.ok(h.headers.some(x => x.key === 'Cache-Control' && x.value === 'no-store'))
  validateProductionApi(Object.fromEntries(['VITE_AUTH_API_URL', 'VITE_OTAKUZONE_API_URL', 'VITE_ANIME_API_URL'].map(k => [k, 'https://frontend.test/api/v1'])))
})
