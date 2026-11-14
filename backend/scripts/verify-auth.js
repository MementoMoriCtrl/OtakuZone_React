import { assertTestIsolation } from './test-isolation.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { parseSetCookie } from 'cookie'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadConfig } from '../src/config/env.js'
import { createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema } from '../src/db/schemaCheck.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createApp } from '../src/app.js'

loadEnvironment()
await assertTestIsolation(loadConfig().database)
let pool
const servers = []
const nonce = randomUUID()
const emails = [`client-${nonce}@example.test`, `admin-${nonce}@example.test`]
const password = `Aa1-${randomBytes(20).toString('hex')}`
let checks = 0
try {
  const configured = loadConfig()
  assert.ok(configured.auth && configured.database, 'Activar AUTH_ENABLED con configuración local válida')
  if (configured.environment === 'production') throw new Error('Ejecutar esta verificación con usuarios técnicos solo en desarrollo.')
  pool = createDatabasePool(configured.database)
  await checkDatabaseSchema(pool)
  const config = { ...configured, environment: 'test', rateLimitMax: 1000, auth: { ...configured.auth, rateMax: 100 } }
  async function serverFor(configuration) {
    const server = createApp({ config: configuration, repository: createMysqlCatalogRepository(pool), authPool: pool }).listen(0, '127.0.0.1')
    await once(server, 'listening'); servers.push(server)
    return `http://127.0.0.1:${server.address().port}/api/v1`
  }
  const base = await serverFor(config)
  const origin = config.origins[0]
  async function call(path, { method = 'GET', body, cookie, csrf = '1', originHeader = origin, baseUrl = base } = {}, expected = 200) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(originHeader ? { Origin: originHeader } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json', ...(csrf ? { 'X-OtakuZone-CSRF': csrf } : {}) } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    assert.equal(response.status, expected, `${method} ${path} debe responder ${expected}`)
    const data = await response.json()
    checks++
    const rawCookie = response.headers.getSetCookie().find((value) => value.startsWith(config.auth.cookieName + '='))
    return { response, data, cookie: rawCookie?.split(';')[0], attributes: rawCookie ? parseSetCookie(rawCookie) : null }
  }
  assert.equal((await call('/auth/session')).data.data.user, null)
  await call('/auth/me', {}, 401)
  await call('/admin/overview', {}, 401)
  const client = await call('/auth/register', { method: 'POST', body: { name: 'Cliente técnico', email: emails[0], password } }, 201)
  assert.equal(client.data.data.user.role, 'CLIENTE')
  assert.ok(client.attributes.httpOnly && client.attributes.sameSite.toLowerCase() === 'lax')
  assert.ok(!client.attributes.domain && client.attributes.maxAge === config.auth.ttl)
  assert.ok(!JSON.stringify(client.data).includes(client.attributes.value), 'No devolver el JWT en JSON')
  const [[stored]] = await pool.execute('SELECT password_hash AS hash FROM usuarios WHERE email = ?', [emails[0]])
  assert.ok(stored.hash !== password && /^\$2[aby]\$/.test(stored.hash), 'Solo hash bcrypt en MySQL')
  assert.equal(await bcrypt.compare(password, stored.hash), true)
  assert.equal(bcrypt.getRounds(stored.hash), config.auth.rounds)
  await call('/auth/register', { method: 'POST', body: { name: 'Repetido', email: emails[0], password } }, 409)
  await call('/auth/register', { method: 'POST', body: { name: 'Rol inyectado', email: emails[1], password, role: 'ADMIN' } }, 400)
  await call('/auth/register', { method: 'POST', body: { name: 'Inválido', email: emails[1], password: 'Á1'.repeat(25) } }, 400)
  const wrong = await call('/auth/login', { method: 'POST', body: { email: emails[0], password: 'Incorrecta123' } }, 401)
  const unknown = await call('/auth/login', { method: 'POST', body: { email: `unknown-${nonce}@example.test`, password: 'Incorrecta123' } }, 401)
  assert.equal(wrong.data.error.message, unknown.data.error.message)
  console.log('PASS registro real, unicidad, bcrypt, límite UTF-8, cookie HttpOnly y mensajes de login genéricos')

  const login = await call('/auth/login', { method: 'POST', body: { email: emails[0], password } })
  const cookie = login.cookie
  const csrf = login.data.data.csrfToken
  const session = await call('/auth/session', { cookie })
  assert.equal(session.data.data.user.id, client.data.data.user.id)
  assert.equal(session.data.data.csrfToken, csrf)
  assert.equal((await call('/auth/me', { cookie })).data.data.role, 'CLIENTE')
  await call('/admin/overview', { cookie }, 403)
  await call('/auth/me', { method: 'PATCH', cookie, csrf: null, body: { name: 'Cambio', bio: '' } }, 403)
  await call('/auth/me', { method: 'PATCH', cookie, csrf: 'incorrecto', body: { name: 'Cambio', bio: '' } }, 403)
  await call('/auth/me', { method: 'PATCH', cookie, csrf, originHeader: null, body: { name: 'Cambio', bio: '' } }, 403)
  await call('/auth/me', { method: 'PATCH', cookie, csrf, originHeader: 'https://untrusted.example', body: { name: 'Cambio', bio: '' } }, 403)
  await call('/auth/login', { method: 'POST', body: { email: emails[0], password }, csrf: null }, 403)
  await call('/auth/me', { method: 'PATCH', cookie, csrf, body: { name: 'Cambio', bio: '', role: 'ADMIN' } }, 400)
  await call('/auth/me', { method: 'PATCH', cookie, csrf, body: { name: 'Cambio', bio: '', email: emails[1] } }, 400)
  const profile = await call('/auth/me', { method: 'PATCH', cookie, csrf, body: { name: 'Cliente actualizado', bio: 'Perfil técnico de prueba' } })
  assert.equal(profile.data.data.role, 'CLIENTE')
  const [[saved]] = await pool.execute('SELECT nombre, presentacion FROM usuarios WHERE email = ?', [emails[0]])
  assert.equal(saved.nombre, 'Cliente actualizado')
  assert.equal(saved.presentacion, 'Perfil técnico de prueba')
  console.log('PASS login, sesión privada, actualización persistente, CSRF, origen y rechazo de asignación masiva')

  const admin = await call('/auth/register', { method: 'POST', body: { name: 'Admin técnico', email: emails[1], password } }, 201)
  assert.equal(admin.data.data.user.role, 'CLIENTE', 'El registro público nunca asigna ADMIN')
  await pool.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE email = ?', ['administrador', emails[1]])
  const adminLogin = await call('/auth/login', { method: 'POST', body: { email: emails[1], password } })
  assert.equal(adminLogin.data.data.user.role, 'ADMIN')
  await call('/admin/overview', { cookie: adminLogin.cookie })
  await pool.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE email = ?', ['cliente', emails[1]])
  await call('/admin/overview', { cookie: adminLogin.cookie }, 403)
  console.log('PASS ADMIN autorizado y CLIENTE denegado; cambio de rol en MySQL aplicado incluso al JWT ya emitido')

  const claims = jwt.decode(client.attributes.value)
  assert.ok(!('role' in claims))
  const forged = jwt.sign({ sid: claims.sid }, randomBytes(64).toString('hex'), { subject: claims.sub, expiresIn: 60, issuer: config.auth.issuer, audience: config.auth.audience })
  await call('/auth/me', { cookie: `${config.auth.cookieName}=${forged}` }, 401)
  const now = Math.floor(Date.now() / 1000)
  const expired = jwt.sign({ sid: claims.sid, sub: claims.sub, iat: now - 60, exp: now - 1 }, config.auth.secret, { algorithm: 'HS256', issuer: config.auth.issuer, audience: config.auth.audience })
  await call('/auth/me', { cookie: `${config.auth.cookieName}=${expired}` }, 401)
  const badAlgorithm = jwt.sign({ sid: claims.sid }, config.auth.secret, { algorithm: 'HS384', subject: claims.sub, expiresIn: 60, issuer: config.auth.issuer, audience: config.auth.audience })
  await call('/auth/me', { cookie: `${config.auth.cookieName}=${badAlgorithm}` }, 401)
  await call('/auth/logout', { method: 'POST', cookie, csrf: 'incorrecto', body: {} }, 403)
  const logout = await call('/auth/logout', { method: 'POST', cookie, csrf, body: {} })
  assert.ok(logout.attributes.expires.getTime() < Date.now())
  await call('/auth/me', { cookie }, 401)
  assert.equal((await call('/auth/session', { cookie })).data.data.user, null)
  console.log('PASS firma, algoritmo, expiración, logout y rechazo de replay del JWT revocado')

  const limitedBase = await serverFor({ ...config, auth: { ...config.auth, rateMax: 2, rateWindowMs: 1000 } })
  await call('/auth/login', { method: 'POST', body: {}, baseUrl: limitedBase }, 400)
  await call('/auth/login', { method: 'POST', body: {}, baseUrl: limitedBase }, 400)
  const limited = await call('/auth/login', { method: 'POST', body: {}, baseUrl: limitedBase }, 429)
  assert.ok(Number(limited.response.headers.get('retry-after')) > 0)
  console.log(`PASS rate limiting de autenticación; ${checks} solicitudes HTTP reales comprobadas`)
} catch (error) { console.error('Verificación auth no completada:', error.code ?? error.message); process.exitCode = 1 }
finally {
  for (const server of servers) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
  if (pool) {
    try {
      await pool.execute('DELETE FROM usuarios WHERE email IN (?, ?)', emails)
      const [[remaining]] = await pool.execute('SELECT COUNT(*) AS n FROM usuarios WHERE email IN (?, ?)', emails)
      assert.equal(Number(remaining.n), 0)
      console.log('Usuarios técnicos y sus sesiones eliminados; no se modificaron otras cuentas.')
    } finally { await pool.end() }
  }
}
