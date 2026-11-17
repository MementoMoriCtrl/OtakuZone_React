import test from 'node:test'
import assert from 'node:assert/strict'
import { preflightTidb, assertEmailCollation, requiredEmailCollation } from '../src/db/tidbPreflight.js'
import { expectedIntegrityConstraints, readMigrationCatalog } from '../src/db/migrationCatalog.js'
import { emailCheckSql } from '../src/db/emailContract.js'

const rows = values => Object.entries(values).map(([Variable_name, Value]) => ({ Variable_name, Value }))
function fixture(overrides = {}) {
  const global = { tidb_enable_check_constraint: 'ON', tidb_enable_foreign_key: 'ON', ...overrides.global }
  const session = { foreign_key_checks: 'ON', sql_mode: 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY', time_zone: '+00:00', system_time_zone: 'UTC', tidb_txn_mode: 'pessimistic', tidb_constraint_check_in_place_pessimistic: 'ON', autocommit: 'ON', ...overrides.session }
  const calls = []
  return { calls, execute: async sql => {
    calls.push(sql)
    if (overrides.unavailable) throw new Error('private details must never leak')
    if (sql.startsWith('SHOW GLOBAL')) return [rows(global)]
    if (sql.startsWith('SHOW SESSION')) return [rows(session)]
    if (sql === 'SHOW COLLATION') return [(overrides.collations ?? [requiredEmailCollation]).map(Collation => ({ Collation, Pad_attribute: 'NO PAD' }))]
    if (sql.includes('information_schema.TABLES')) return [(overrides.tables ?? ['schema_migrations_tidb']).map(name => ({ name }))]
    if (sql.includes('information_schema.COLUMNS')) return [[{ collation: overrides.actualCollation ?? requiredEmailCollation, dataType: 'varchar', maxLength: 254, nullable: overrides.nullable ?? 'NO' }]]
    if (sql.startsWith('SHOW INDEX')) return [overrides.indexes ?? [{ Key_name: 'uq_usuarios_email', Non_unique: 0, Column_name: 'email', Seq_in_index: 1, Sub_part: null }]]
    if (sql.includes('TABLE_CONSTRAINTS')) return [(overrides.constraints ?? await expectedIntegrityConstraints('tidb')).map(item => ({ enforced: 'YES', ...item }))]
    if (sql.includes('CHECK_CONSTRAINTS')) return [[{ clause: overrides.clause ?? emailCheckSql }]]
    if (sql.includes('FROM schema_migrations_tidb')) return [overrides.history ?? (await readMigrationCatalog('tidb')).migrations.map(item => ({ version: item.file, checksum: item.checksum, status: 'applied' }))]
    throw new Error('Unexpected SQL')
  } }
}
test('preflight bootstrap solo observa capacidades y no aprueba runtime', async () => {
  const executor = fixture()
  const result = await preflightTidb(executor, null, { phase: 'bootstrap' })
  assert.equal(result.capabilitiesObserved, true); assert.equal(result.runtimeApproved, false)
  assert.ok(executor.calls.every(sql => /^(SHOW|SELECT) /.test(sql)))
})
test('rechaza capacidades ausentes, desactivadas o no observables', async () => {
  for (const overrides of [
    { global: { tidb_enable_check_constraint: 'OFF' } }, { global: { tidb_enable_foreign_key: undefined } },
    { session: { foreign_key_checks: 'OFF' } }, { session: { tidb_txn_mode: 'optimistic' } },
    { session: { sql_mode: 'STRICT_TRANS_TABLES' } }, { session: { time_zone: 'SYSTEM', system_time_zone: 'EST' } },
    { unavailable: true },
  ]) await assert.rejects(preflightTidb(fixture(overrides), 'fixture', { phase: 'bootstrap' }), error => error.message.startsWith('Preflight TiDB:') && !error.message.includes('private'))
})
test('no sustituye collation de email por una alternativa no equivalente', () => {
  for (const collation of ['utf8mb4_bin', 'utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci']) assert.throws(() => assertEmailCollation([collation]), /email/)
  assert.throws(() => assertEmailCollation([requiredEmailCollation], 'utf8mb4_bin'))
  assert.doesNotThrow(() => assertEmailCollation([requiredEmailCollation]))
})
test('runtime rechaza historial MySQL, esquema vacío y restricciones faltantes', async () => {
  await assert.rejects(preflightTidb(fixture({ tables: ['schema_migrations'] }), 'fixture'), /historial MySQL/)
  await assert.rejects(preflightTidb(fixture({ tables: [] }), 'fixture'), /historial TiDB/)
  await assert.rejects(preflightTidb(fixture({ constraints: [] }), 'fixture'), /restricciones/)
  const constraints = await expectedIntegrityConstraints()
  await assert.rejects(preflightTidb(fixture({ constraints: constraints.map(c => ({ ...c, enforced: 'NO' })) }), 'fixture'), /enforcement/)
  assert.equal(constraints.filter(c => c.type === 'CHECK').length, 20)
  assert.equal(constraints.filter(c => c.type === 'FOREIGN KEY').length, 18)
})
test('runtime exige ledger completo, CHECK exacto y UNIQUE completo', async () => {
  assert.equal((await preflightTidb(fixture(), 'fixture')).runtimeApproved, true)
  for (const overrides of [{ history: [] }, { clause: 'email IS NOT NULL' }, { nullable: 'YES' }, { indexes: [{ Key_name: 'uq_usuarios_email', Non_unique: 0, Column_name: 'email', Seq_in_index: 1, Sub_part: 20 }] }]) await assert.rejects(preflightTidb(fixture(overrides), 'fixture'))
})
