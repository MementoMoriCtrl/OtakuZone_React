import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'

async function start(context, overrides = {}, repository) {
  const config = { ...loadConfig({ NODE_ENV: 'test' }), ...overrides }
  const server = createApp({ config, repository }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}/api/v1`
}

test('configuración valida orígenes, puerto y producción sin filtrar valores', () => {
  assert.throws(() => loadConfig({ PORT: '-1' }), /PORT/)
  assert.throws(() => loadConfig({ CORS_ORIGINS: '*' }), /CORS_ORIGINS/)
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /CORS_ORIGINS/)
  assert.throws(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'http://example.test' }), /HTTPS/)
  assert.throws(() => loadConfig({ CORS_ORIGINS: 'https://user:secret@example.test' }), (error) => !error.message.includes('secret'))
  assert.equal(loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://otakuzone.example' }).environment, 'production')
})

test('health y catálogo real del fixture: contrato, Helmet y ausencia de variables', async (context) => {
  const base = await start(context)
  const health = await fetch(`${base}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { success: true, data: { status: 'ok', service: 'otakuzone-api', version: 'v1' } })
  assert.equal(health.headers.get('x-powered-by'), null)
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(health.headers.get('content-security-policy'))
  assert.equal(health.headers.get('cache-control'), 'no-store')
  const products = await (await fetch(`${base}/products`)).json()
  assert.equal(products.data.length, 12)
  assert.deepEqual(products.meta, { source: 'demo', count: 12 })
  assert.equal((await (await fetch(`${base}/categories`)).json()).data.length, 5)
  assert.equal((await (await fetch(`${base}/promotions`)).json()).data.length, 2)
  const head = await fetch(`${base}/health`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})

test('consultas combinadas y vacío usan la fuente demostrativa compartida', async (context) => {
  const base = await start(context)
  const filtered = await (await fetch(`${base}/products?categoryId=mangas&q=volumen`)).json()
  assert.equal(filtered.data.length, 3)
  assert.ok(filtered.data.every((item) => item.categoryId === 'mangas'))
  const empty = await (await fetch(`${base}/products?categoryId=papeleria`)).json()
  assert.deepEqual(empty.data, [])
  assert.equal(empty.meta.count, 0)
  assert.equal((await (await fetch(`${base}/products/figura-mensajera`)).json()).data.id, 'figura-mensajera')
})

test('entradas no admitidas, desconocidas, repetidas y paths inválidos: 400', async (context) => {
  const base = await start(context)
  for (const path of ['/products?q=' + 'a'.repeat(101), '/products?categoryId=../secret', '/products?q=one&q=two', '/products?categoryId[]=figuras', '/products?unexpected=1', '/products/%2F', '/products/%E0%A4%A', '/categories?unknown=1']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 400, path)
    const body = await response.json()
    assert.equal(body.success, false)
    assert.ok(!JSON.stringify(body).includes('stack'))
  }
})

test('404, 405, JSON inválido y límite de cuerpo tienen formato JSON consistente', async (context) => {
  const base = await start(context)
  for (const path of ['/not-found', '/products/not-found', '/categories/not-found']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 404)
    assert.equal((await response.json()).success, false)
  }
  const method = await fetch(`${base}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'GET, HEAD, OPTIONS')
  const invalid = await fetch(`${base}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_JSON')
  const huge = await fetch(`${base}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(11000) }) })
  assert.equal(huge.status, 413)
  assert.equal((await huge.json()).error.code, 'PAYLOAD_TOO_LARGE')
})

test('CORS permite frontend, rechaza otros orígenes y responde preflight', async (context) => {
  const base = await start(context)
  const allowed = await fetch(`${base}/products`, { headers: { Origin: 'http://127.0.0.1:5173' } })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true')
  const denied = await fetch(`${base}/products`, { headers: { Origin: 'https://blocked.example' } })
  assert.equal(denied.status, 403)
  assert.equal(denied.headers.get('access-control-allow-origin'), null)
  assert.equal((await denied.json()).error.code, 'CORS_ORIGIN_DENIED')
  const preflight = await fetch(`${base}/products`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.ok(preflight.headers.get('access-control-allow-methods').includes('POST'))
})

test('rate limiting real devuelve 429, Retry-After y se recupera', async (context) => {
  const base = await start(context, { rateLimitMax: 2, rateLimitWindowMs: 1000 })
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/health`)).status, 200)
  const limited = await fetch(`${base}/health`)
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
  assert.ok(limited.headers.get('ratelimit'))
  assert.equal(limited.headers.get('cache-control'), 'no-store')
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED')
  await new Promise((resolve) => setTimeout(resolve, 1100))
  assert.equal((await fetch(`${base}/health`)).status, 200)
})

test('error interno en producción oculta trazas, rutas y valores internos', async (context) => {
  const logged = context.mock.method(console, 'error', () => {})
  const repository = { findProducts: async () => { throw new Error('secreto-interno /private/database') } }
  const base = await start(context, { environment: 'production', origins: ['https://otakuzone.example'] }, repository)
  const response = await fetch(`${base}/products`)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { success: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.' } })
  assert.equal(logged.mock.callCount(), 1, 'el detalle se registra solo en el servidor')
})
