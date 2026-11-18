import test from 'node:test'
import assert from 'node:assert/strict'
import { preflightTidb, assertEmailCollation, requiredEmailCollation } from '../src/db/tidbPreflight.js'
import { expectedIntegrityConstraints } from '../src/db/migrationCatalog.js'

import { preflightFixture as fixture } from './helpers/tidbPreflightFixture.js'

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
  ]) await assert.rejects(preflightTidb(fixture(overrides), 'otakuzone_db', { phase: 'bootstrap' }), error => error.message.startsWith('Preflight TiDB:') && !error.message.includes('private'))
})
test('no sustituye collation de email por una alternativa no equivalente', () => {
  for (const collation of ['utf8mb4_bin', 'utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci']) assert.throws(() => assertEmailCollation([collation]), /email/)
  assert.throws(() => assertEmailCollation([requiredEmailCollation], 'utf8mb4_bin'))
  assert.doesNotThrow(() => assertEmailCollation([requiredEmailCollation]))
})
test('runtime rechaza historial MySQL, esquema vacío y restricciones faltantes', async () => {
  await assert.rejects(preflightTidb(fixture({ tables: ['schema_migrations'] }), 'otakuzone_db'), /historial MySQL/)
  await assert.rejects(preflightTidb(fixture({ tables: [] }), 'otakuzone_db'), /historial TiDB/)
  await assert.rejects(preflightTidb(fixture({ constraints: [] }), 'otakuzone_db'), /restricciones/)
  const constraints = await expectedIntegrityConstraints()
  await assert.rejects(preflightTidb(fixture({ constraints: constraints.map(c => ({ ...c, enforced: 'NO' })) }), 'otakuzone_db'), /enforcement/)
  assert.equal(constraints.filter(c => c.type === 'CHECK').length, 20)
  assert.equal(constraints.filter(c => c.type === 'FOREIGN KEY').length, 18)
})
test('runtime exige ledger completo, CHECK exacto y UNIQUE completo', async () => {
  assert.equal((await preflightTidb(fixture(), 'otakuzone_db')).runtimeApproved, true)
  for (const overrides of [{ history: [] }, { clause: 'email IS NOT NULL' }, { nullable: 'YES' }, { indexes: [{ Key_name: 'uq_usuarios_email', Non_unique: 0, Column_name: 'email', Seq_in_index: 1, Sub_part: 20 }] }]) await assert.rejects(preflightTidb(fixture(overrides), 'otakuzone_db'))
})
