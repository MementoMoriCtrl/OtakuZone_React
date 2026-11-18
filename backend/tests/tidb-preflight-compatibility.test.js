import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { runtimeConstraintContract } from '../src/db/tidbRuntimeIntegrity.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'
import { checkDatabaseConnection, createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema, expectedTables } from '../src/db/schemaCheck.js'

const originalConnect = net.Socket.prototype.connect
let attempts = 0
before(() => { net.Socket.prototype.connect = function () { attempts++; throw new Error('Network forbidden in compatibility tests') } })
after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })
const run = overrides => preflightTidb(preflightFixture(overrides), 'otakuzone_db')

test('Serverless sin ENFORCED: verifica 21 CHECK y 18 FK, funcional unknown', async () => {
  const c = preflightFixture({ omitCheckRows: true }), r = await preflightTidb(c, 'otakuzone_db')
  assert.equal(r.runtimeApproved, true)
  assert.equal(r.constraints.filter(x => x.restrictionType === 'CHECK').length, 21)
  assert.equal(r.constraints.filter(x => x.restrictionType === 'FOREIGN KEY').length, 18)
  assert.ok(r.constraints.every(x => x.declarative && x.configuration && x.functional === 'unknown'))
  assert.ok(c.calls.every(sql => /^(SELECT|SHOW) /.test(sql)))
  assert.ok(!c.calls.some(sql => /ENFORCED\s+AS\s+enforced/i.test(sql)))
  assert.equal(r.configuration.global.scope, 'global'); assert.equal(r.configuration.session.scope, 'session')
  assert.equal(r.configuration.session.values.foreign_key_checks, 'ON')
  assert.equal(r.configuration.global.engineVersion, '8.5.3')
  assert.ok(r.constraints.every(x => x.connectionId === r.connectionId && x.integrity === 'live-query-unattested'))
})
for (const [name, overrides] of [
  ['CHECK global OFF', { global: { tidb_enable_check_constraint: 'OFF' } }],
  ['FK global OFF', { global: { tidb_enable_foreign_key: 'OFF' } }],
  ['FK global ON no sustituye sesión OFF', { session: { foreign_key_checks: 'OFF' } }],
  ['sesión desconocida', { session: { foreign_key_checks: undefined } }],
  ['global desconocida', { global: { tidb_enable_check_constraint: undefined } }],
]) test(`controles obligatorios bloquean: ${name}`, async () => { await assert.rejects(run(overrides), e => e.message.startsWith('Preflight TiDB:') && ['session', 'global'].includes(e.dimension)) })
for (const [name, overrides] of [
  ['CHECK ausente', { absentDdl: 'ck_pedidos_moneda' }],
  ['CHECK no habilitado', { disabledCheck: 'ck_pedidos_envio' }],
  ['FK legacy inválida', { invalidFk: 'fk_pedidos_usuario' }],
  ['FK con destino contradictorio', { wrongFk: true }],
  ['definición truncada', { truncatedDdl: true }],
  ['versión no interpretada', { version: '8.5.4' }],
]) test(`declaración inválida/desconocida bloquea: ${name}`, async () => { await assert.rejects(run(overrides), e => e.dimension === (overrides.version ? 'identity' : 'declarative')) })
test('metadatos duplicados o contradictorios nunca se eligen por mayoría', async () => {
  const c = await runtimeConstraintContract()
  await assert.rejects(run({ constraints: [...c, c[0]] }), e => e.reason === 'contradictory-metadata')
  await assert.rejects(run({ duplicateGlobal: true }), e => e.reason === 'contradictory-or-duplicate-variable')
  await assert.rejects(run({ drift: true }), e => e.reason === 'contradictory-observations')
})
for (const source of ['SHOW CREATE TABLE', 'TABLE_CONSTRAINTS', 'KEY_COLUMN_USAGE']) {
  test(`fuente obligatoria no disponible se identifica y no filtra driver: ${source}`, async () => {
    await assert.rejects(run({ errorAt: source }), e => e.dimension === 'declarative' && e.reason === 'metadata-query-unavailable' && !e.message.includes('private'))
  })
}
test('una conexión correcta no presta su aprobación a otra con FK OFF', async () => {
  const a = preflightFixture({ connectionId: 101 }), b = preflightFixture({ connectionId: 202, session: { foreign_key_checks: 'OFF' } })
  let count = 0
  const pool = { getConnection: async () => count++ === 0 ? a : b }
  assert.equal((await preflightTidb(pool, 'otakuzone_db')).connectionId, '101')
  await assert.rejects(preflightTidb(pool, 'otakuzone_db'), /foreign_key_checks/)
  assert.equal(a.calls.at(-1), 'release'); assert.equal(b.calls.at(-1), 'release')
})
test('identidad de sesión diferente al final bloquea aunque controles coincidan', async () => {
  await assert.rejects(run({ changedConnection: true }), e => e.reason === 'connection-changed')
})
test('overrides de restricciones no permiten omitir el catálogo real', async () => {
  await assert.rejects(preflightTidb(preflightFixture({ constraints: [] }), 'otakuzone_db', { expectedConstraints: [] }), /restricciones/)
})
test('schemaCheck TiDB mantiene una sola conexión y no consulta ENFORCED', async () => {
  // mysql2 creates no network connection until acquisition. Replace acquisition with
  // the fixture before use; the socket guard above forbids accidental connections.
  const pool = createDatabasePool({ engine: 'tidb', host: 'fixture.invalid', user: 'fixture', password: 'synthetic', database: 'otakuzone_db', connectionLimit: 2, ssl: true })
  const c = preflightFixture({ tables: expectedTables.map(n => n === 'schema_migrations' ? 'schema_migrations_tidb' : n) })
  let acquisitions = 0; pool.getConnection = async () => { acquisitions++; return c }
  try {
    const result = await checkDatabaseSchema(pool)
    assert.equal(acquisitions, 1); assert.equal(result.checks, 21); assert.equal(result.foreignKeys, 18)
    assert.equal(c.calls.at(-1), 'release')
    assert.ok(!c.calls.some(sql => /ENFORCED\s+AS\s+enforced/i.test(sql)))
  } finally { await pool.end() }
})
test('checkDatabaseConnection comunica evidencia solo de la conexión examinada', async () => {
  const r = await checkDatabaseConnection(preflightFixture(), { expectedEngine: 'tidb' })
  assert.equal(r.preflight.connectionId, '11'); assert.equal(r.preflight.functional, 'unknown')
})
test('restricción adicional sin contrato no se adopta aunque no aparezca en la vista', async () => {
  await assert.rejects(run({ extraCheck: true, omitCheckRows: true }), e => e.dimension === 'declarative')
})
test('FK sin acción explícita conserva defaults RESTRICT; no elimina validación', async () => {
  assert.equal((await run({ omitFkDefaults: true })).runtimeApproved, true)
  await assert.rejects(run({ omitFkDefaults: true, wrongFk: true }), e => e.reason === 'contradictory-FK-definition')
})
