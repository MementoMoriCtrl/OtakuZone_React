import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { loadConfig } from '../src/config/env.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { databaseTlsOptions } from '../src/db/pool.js'
import { createApp } from '../src/app.js'

test('HOST productivo público y PORT dinámico sin alterar desarrollo', () => {
  assert.equal(loadConfig({}).host, '127.0.0.1')
  const config = loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://frontend.test', PORT: '12345', DB_ENGINE: 'mysql', CATALOG_SOURCE: 'mysql', AUTH_ENABLED: 'true', DB_HOST: 'db.test', DB_SSL: 'true', DB_USER: 'fixture', DB_PASSWORD: 'fixture', JWT_SECRET: 'fixture-only-'.repeat(8) })
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.port, 12345)
  assert.throws(() => loadConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY/)
  assert.throws(() => loadConfig({ TRUST_PROXY: '0.0.0.0/0' }), /TRUST_PROXY/)
})
test('MySQL producción exige host explícito y TLS; CA conserva verificación', () => {
  const environment = { NODE_ENV: 'production', DB_USER: 'test-only', DB_PASSWORD: 'test-only' }
  assert.throws(() => loadDatabaseConfig(environment), /DB_HOST/)
  assert.throws(() => loadDatabaseConfig({ ...environment, DB_HOST: 'db.test' }), /DB_SSL/)
  const config = loadDatabaseConfig({ ...environment, DB_HOST: 'db.test', DB_SSL: 'true', DB_SSL_CA: 'line1\\nline2' })
  assert.deepEqual(databaseTlsOptions(config), { ssl: { rejectUnauthorized: true, ca: 'line1\nline2' } })
})
test('headers falsificados no eluden límite detrás de un proxy confiable', async context => {
  const config = loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '127.0.0.1/32,::1/128', RATE_LIMIT_MAX: '2' })
  const app = createApp({ config })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await app.locals.closeResources() })
  const url = `http://127.0.0.1:${server.address().port}/api/v1/health`
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { 'X-Forwarded-For': `198.51.100.${attempt + 1}, 203.0.113.10` } })
    assert.equal(response.status, attempt < 2 ? 200 : 429)
  }
  assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.11' } })).status, 200)
})
