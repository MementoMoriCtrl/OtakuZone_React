import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { normalizeEmail } from '../src/validators/email.js'
import { registerBody, loginBody } from '../src/validators/auth.js'
import { createAuthRepository } from '../src/repositories/authRepository.js'
import { authSql } from '../src/db/authSql.js'
import { summarizeEmailRows } from '../src/db/emailAudit.js'
import { readMigrationCatalog, assertMigrationDialect } from '../src/db/migrationCatalog.js'

const accepted = ['USER@example.com', 'user@example.com', ' user@example.com ', '\tUSER@example.com\r\n', 'user+tag@example.com', 'first.last@example.com', 'user@xn--xample-9ua.com']
const rejected = ['josé@example.com', 'user@éxample.com', '用户@example.com', 'user name@example.com', 'user@ example.com', 'invalid', 'a@@example.com', '\u00a0user@example.com', 'user@example.com\u00a0', '\u212Auser@example.com', 'user\u0000@example.com']

test('ASCII: matriz aprobada normaliza case/espacios y conserva el formato Zod existente', () => {
  const old = z.string().trim().max(254).email().transform(value => value.toLowerCase())
  for (const email of accepted) {
    assert.equal(normalizeEmail(email), old.parse(email))
    assert.equal(registerBody.parse({ name: 'User Test', email, password: 'Clave12345' }).email, normalizeEmail(email))
    assert.equal(loginBody.parse({ email, password: 'Clave12345' }).email, normalizeEmail(email))
  }
  assert.equal(normalizeEmail('USER@example.com'), normalizeEmail(' user@example.com '))
})
test('ASCII: rechaza Unicode original antes de trim/lowercase, sin transliteración', () => {
  for (const email of [...rejected, undefined, null, 42, {}]) {
    assert.throws(() => normalizeEmail(email))
    assert.equal(registerBody.safeParse({ name: 'User Test', email, password: 'Clave12345' }).success, false)
    assert.equal(loginBody.safeParse({ email, password: 'Clave12345' }).success, false)
  }
})
test('repositorio busca por la representación canónica y rechaza entradas inválidas antes de SQL', async () => {
  const calls = []
  const pool = { execute: async (sql, params) => { calls.push({ sql, params }); return [[{ id: '1' }]] } }
  const repository = createAuthRepository(pool)
  assert.equal((await repository.findByEmail(' USER@EXAMPLE.COM ')).id, '1')
  assert.equal((await repository.findByEmail('user@example.com')).id, '1')
  assert.ok(calls.every(call => call.sql === authSql.byEmail && call.params[0] === 'user@example.com'))
  for (const email of rejected) await assert.rejects(repository.findByEmail(email))
  assert.equal(calls.length, 2)
})
test('registro inválido no adquiere una conexión ni inicia transacciones', async () => {
  let acquired = 0
  const repository = createAuthRepository({ getConnection: async () => { acquired++; throw new Error('Must not reach SQL') } })
  await assert.rejects(repository.registerWithSession({ email: 'josé@example.com' }, {}))
  assert.equal(acquired, 0)
})
test('auditoría detecta problemas históricos y colisiones sin devolver datos personales', () => {
  const values = ['USER@example.com', 'user@example.com', ' user@example.com ', 'josé@example.com', 'bad email', '\u00a0user@example.com', 'other@example.com']
  const summary = summarizeEmailRows(values.map(email => ({ email })))
  assert.deepEqual(summary, { total: 7, nonAscii: 2, uppercase: 1, outerWhitespace: 2, invalidAsciiContract: 3, canonicalChanged: 2, canonicalDuplicateGroups: 1, canonicalDuplicateRows: 3, lowercaseCollisionGroups: 1 })
  assert.ok(!JSON.stringify(summary).includes('@'))
})
test('catálogo TiDB preparado conserva separación del historial MySQL', async () => {
  const catalog = await readMigrationCatalog('tidb')
  assert.equal(catalog.status, 'ready'); assert.equal(catalog.migrations.length, 7)
  assert.throws(() => assertMigrationDialect(catalog, 'tidb', ['schema_migrations']), /mezclar/)
})
