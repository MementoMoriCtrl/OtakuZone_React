import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerBody, loginBody } from '../src/validators/auth.js'
import { loadAuthConfig } from '../src/config/auth.js'
import { cookieOptions, browserMutation, publicAuthMutation } from '../src/middlewares/auth.js'

test('contrato de email API conserva trim/lowercase y rechaza direcciones acentuadas', () => {
  const body = { name: 'Test User', email: ' User@EXAMPLE.test ', password: 'Clave12345' }
  assert.equal(registerBody.parse(body).email, 'user@example.test')
  assert.equal(loginBody.parse({ email: body.email, password: body.password }).email, 'user@example.test')
  for (const email of ['josé@example.test', 'user@éxample.test']) {
    assert.equal(registerBody.safeParse({ ...body, email }).success, false)
    assert.equal(loginBody.safeParse({ email, password: body.password }).success, false)
  }
  // This tests the API validator, not MySQL/TiDB collation equivalence.
})
test('provisioning runtime existente no concede DDL ni cambios de rol/password existentes', async () => {
  const sql = await readFile(new URL('../database/provisioning/separate-users.reviewed.sql', import.meta.url), 'utf8')
  const runtime = sql.split('-- MANTENIMIENTO:')[0].replace(/--[^\n]*/g, '')
  const grants = runtime.match(/GRANT[\s\S]*?;/g)
  assert.ok(grants.length > 10)
  for (const grant of grants) {
    assert.doesNotMatch(grant, /\b(?:CREATE|ALTER|DROP|GRANT OPTION|ALL PRIVILEGES)\b/)
    assert.doesNotMatch(grant, /ON\s+\*\.\*/)
    for (const match of grant.matchAll(/UPDATE\s*\(([^)]+)\)/g)) assert.doesNotMatch(match[1], /\b(?:rol_id|password_hash|email)\b/)
  }
  assert.match(runtime, /UPDATE \(revocada_en\)/)
  // Specification only: no CREATE USER/GRANT is ever sent to a server here.
})
test('cookies locales/productivas y protección Origin/CSRF siguen activas', () => {
  const local = loadAuthConfig({ JWT_SECRET: 'test-only-'.repeat(8) })
  assert.equal(local.cookieName, 'otakuzone_session')
  assert.deepEqual(cookieOptions(local), { httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
  const production = loadAuthConfig({ JWT_SECRET: 'test-only-'.repeat(8), NODE_ENV: 'production' })
  assert.equal(production.cookieName, '__Host-otakuzone_session')
  assert.deepEqual(cookieOptions(production), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  const request = { get: key => key === 'Origin' ? 'https://blocked.test' : '1', is: () => true }
  assert.throws(() => browserMutation(['http://localhost:5173'])(request, {}, () => {}), error => error.code === 'CSRF_ORIGIN_REJECTED')
  assert.throws(() => publicAuthMutation({ get: () => '' }, {}, () => {}), error => error.code === 'CSRF_REJECTED')
})
