import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { createAuthService } from '../src/services/authService.js'
import { loadAuthConfig } from '../src/config/auth.js'
import { authSql } from '../src/db/authSql.js'

// Stateful SQL double: a canonical unique key is SPECIFIED here, not certified
// for either SQL engine. No MySQL connection or real user is created.
function accountPoolDouble() {
  const users = new Map(), sessions = new Map(), lookedUp = []
  let statements = 0, id = 0
  const connection = {
    query: async () => {}, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params = []) => {
      statements++
      if (sql === authSql.clientRole) return [[{ id: '1' }]]
      if (sql === authSql.register) {
        const [, name, email, passwordHash] = params
        if (users.has(email)) throw Object.assign(new Error('fixture duplicate'), { code: 'ER_DUP_ENTRY' })
        const row = { id: String(++id), name, email, passwordHash, bio: '', roleCode: 'cliente', state: 'activo' }
        users.set(email, row); return [{ insertId: id }]
      }
      if (sql === authSql.byEmail) { lookedUp.push(params[0]); return [[...users.values()].filter(user => user.email === params[0])] }
      if (sql === authSql.byId) return [[...users.values()].filter(user => user.id === params[0])]
      if (sql === authSql.insertSession) { sessions.set(params[0], { id: params[1], expiresAt: params[2] }); return [{ affectedRows: 1 }] }
      throw new Error('Unexpected fixture SQL')
    },
  }
  return { execute: connection.execute, getConnection: async () => connection, end: async () => {}, users, sessions, lookedUp, statementCount: () => statements }
}

test('registro/login HTTP canonicalizan email, rechazan Unicode y respetan conflicto UNIQUE', async context => {
  const config = loadConfig({ NODE_ENV: 'test', AUTH_ENABLED: 'true', JWT_SECRET: randomBytes(64).toString('hex'), BCRYPT_ROUNDS: '10', AUTH_RATE_MAX: '100', DB_USER: 'test', DB_PASSWORD: 'fixture-only' })
  const pool = accountPoolDouble()
  const app = createApp({ config, authPool: pool })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await app.locals.closeResources() })
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`
  const request = (route, data) => fetch(base + route, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': '1' }, body: JSON.stringify(data) })
  const account = { name: 'User Fixture', email: ' USER@EXAMPLE.COM ', password: 'Clave12345' }
  const registered = await request('/register', account)
  assert.equal(registered.status, 201)
  assert.equal((await registered.json()).data.user.email, 'user@example.com')
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/)
  assert.match(registered.headers.get('set-cookie'), /SameSite=Lax/)
  assert.equal((await request('/register', { ...account, email: 'user@example.com' })).status, 409)
  assert.equal(pool.users.size, 1)
  const login = await request('/login', { email: ' User@Example.Com ', password: account.password })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).data.user.email, 'user@example.com')
  assert.deepEqual(pool.lookedUp, ['user@example.com'])
  const statements = pool.statementCount()
  for (const email of ['josé@example.com', 'user@éxample.com', '用户@example.com', 'user name@example.com', '\u00a0user@example.com']) {
    for (const route of ['/register', '/login']) {
      const response = await request(route, route === '/register' ? { ...account, email } : { email, password: account.password })
      assert.equal(response.status, 400)
      const body = await response.text()
      assert.ok(!body.includes(email)); assert.ok(!body.includes(account.password)); assert.ok(!body.includes('passwordHash'))
    }
  }
  assert.equal(pool.statementCount(), statements)
  const missing = await request('/login', { email: 'missing@example.com', password: account.password })
  const wrong = await request('/login', { email: account.email, password: 'Wrong12345' })
  assert.equal(missing.status, 401); assert.equal(wrong.status, 401)
  assert.deepEqual(await missing.json(), await wrong.json())
})

test('el servicio también protege llamadas directas antes de crear/buscar cuentas', async () => {
  const emails = []
  const repository = { registerWithSession: async input => { emails.push(input.email); return { id: '1', email: input.email, name: 'Fixture', bio: '', roleCode: 'cliente' } }, findByEmail: async email => { emails.push(email); return null } }
  const service = createAuthService(repository, loadAuthConfig({ JWT_SECRET: randomBytes(64).toString('hex'), BCRYPT_ROUNDS: '10' }))
  await service.register({ name: 'Fixture', email: ' USER@EXAMPLE.COM ', password: 'Clave12345' })
  await assert.rejects(service.login({ email: ' USER@example.com ', password: 'Clave12345' }), error => error.code === 'INVALID_CREDENTIALS')
  assert.deepEqual(emails, ['user@example.com', 'user@example.com'])
  await assert.rejects(service.register({ name: 'Fixture', email: 'josé@example.com', password: 'Clave12345' }))
  await assert.rejects(service.login({ email: '用户@example.com', password: 'Clave12345' }))
  assert.equal(emails.length, 2)
})
