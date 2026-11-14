import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { loadAuthConfig } from '../src/config/auth.js'
import { createAuthService, publicUser } from '../src/services/authService.js'
import { cookieOptions } from '../src/middlewares/auth.js'
import { registerBody, profileBody } from '../src/validators/auth.js'

test('política de contraseñas valida bytes de bcrypt y bloquea asignación masiva', () => {
  assert.equal(registerBody.safeParse({ name: 'Cliente', email: 'user@example.test', password: 'Clave12345' }).success, true)
  assert.equal(registerBody.safeParse({ name: 'Cliente', email: 'user@example.test', password: 'Á1'.repeat(25) }).success, false)
  assert.equal(registerBody.safeParse({ name: 'Cliente', email: 'user@example.test', password: 'Clave12345', role: 'ADMIN' }).success, false)
  assert.equal(profileBody.safeParse({ name: 'Cliente', bio: '', role: 'ADMIN' }).success, false)
  assert.equal(profileBody.safeParse({ name: 'Cliente', bio: '', email: 'other@example.test' }).success, false)
})
test('configuración requiere secreto y producción emite cookie host-only segura', () => {
  assert.throws(() => loadAuthConfig({}), /JWT_SECRET/)
  const config = loadAuthConfig({ JWT_SECRET: randomBytes(64).toString('hex'), NODE_ENV: 'production' })
  assert.equal(config.cookieName, '__Host-otakuzone_session')
  assert.deepEqual(cookieOptions(config), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
})
test('DTO de usuario no incluye estado ni hash de contraseña', () => {
  const data = publicUser({ id: 1, name: 'Cliente', email: 'user@example.test', bio: '', roleCode: 'cliente', passwordHash: 'hash-unitario', state: 'activo' })
  assert.deepEqual(Object.keys(data).sort(), ['bio', 'email', 'id', 'name', 'role'])
  assert.equal(data.role, 'CLIENTE')
})
test('JWT con firma inválida o algoritmo distinto no consulta la sesión', async () => {
  let queries = 0
  const config = loadAuthConfig({ JWT_SECRET: randomBytes(64).toString('hex'), BCRYPT_ROUNDS: '10' })
  const service = createAuthService({ findSession: async () => { queries++; return null } }, config)
  const invalid = jwt.sign({ sid: 'a'.repeat(64) }, randomBytes(64).toString('hex'), { subject: '1', expiresIn: 60, issuer: config.issuer, audience: config.audience })
  await assert.rejects(service.authenticate(invalid), (error) => error.status === 401)
  const algorithm = jwt.sign({ sid: 'a'.repeat(64) }, config.secret, { algorithm: 'HS384', subject: '1', expiresIn: 60, issuer: config.issuer, audience: config.audience })
  await assert.rejects(service.authenticate(algorithm), (error) => error.status === 401)
  assert.equal(queries, 0)
})
