import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { inspectConstraintDeclaration } from '../src/db/tidbEnforcementEvidence.js'
import { runtimeConstraintContract } from '../src/db/tidbRuntimeIntegrity.js'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

// Literal clause supplied from TiDB, independent of catalog formatting.
const observed = "CONSTRAINT `ck_promociones_destino` CHECK ((`destino` in (_utf8mb4'/animes',_utf8mb4'/tienda')))"
const expected = (await runtimeConstraintContract('otakuzone_prod')).find(c => c.name === 'ck_promociones_destino')
const identity = { ...expected, database: 'otakuzone_prod', engineVersion: '8.5.3', declarationMode: 'runtime-v1' }
const ddl = clause => `CREATE TABLE promociones (destino varchar(80), ${clause}) ENGINE=InnoDB`
const originalConnect = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('Real network forbidden') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })

test('exact observed destinations and original representation are accepted', () => {
  for (const clause of [observed, observed.replaceAll('_utf8mb4', ''), observed.replaceAll('_utf8mb4', '_UTF8MB4')]) {
    assert.equal(inspectConstraintDeclaration(ddl(clause), identity), true)
  }
  assert.equal(inspectConstraintDeclaration(ddl(observed), { ...identity, engineVersion: '8.0.11-TiDB-v8.5.3-serverless' }), true)
})
for (const [label, clause] of [
  ['additional value', observed.replace("'/tienda'", "'/tienda',_utf8mb4'/otro'")],
  ['missing value', observed.replace(",_utf8mb4'/tienda'", '')],
  ['altered value', observed.replace('/animes', '/Animes')],
  ['trailing space', observed.replace('/tienda', '/tienda ')],
  ['duplicate replacing value', observed.replace('/tienda', '/animes')],
  ['additional duplicate', observed.replace("'/tienda'", "'/tienda',_utf8mb4'/animes'")],
  ['different field', observed.replace('`destino`', '`nombre`')],
  ['NOT IN', observed.replace(' in (', ' not in (')],
  ['different charset', observed.replaceAll('_utf8mb4', '_ascii')],
  ['mixed representation', observed.replace("_utf8mb4'/tienda'", "'/tienda'")],
  ['collation', observed.replace("'/tienda'", "'/tienda' COLLATE utf8mb4_general_ci")],
  ['weakened predicate', observed.replace("'/tienda')))", "'/tienda')) OR 1=1)")],
]) test('promotion destinations reject ' + label, () => {
  assert.equal(inspectConstraintDeclaration(ddl(clause), identity), 'unknown')
})
test('absent, duplicate, truncated and disabled destination checks remain blocked', () => {
  assert.equal(inspectConstraintDeclaration(ddl(observed.replace('ck_promociones_destino', 'other_check')), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ', ' + observed), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed).slice(0, -20), identity), 'unknown')
  for (const marker of [' NOT ENFORCED', ' /*!80016 NOT ENFORCED */']) {
    assert.equal(inspectConstraintDeclaration(ddl(observed + marker), identity), false)
  }
})
test('destination alternative requires exact runtime identity, version and expected predicate', () => {
  for (const context of [
    { ...identity, declarationMode: undefined }, { ...identity, database: 'otakuzone_db' },
    { ...identity, tableName: 'other' }, { ...identity, name: 'other_check' },
    { ...identity, engineVersion: '8.5.4' }, { ...identity, definition: { clause: "destino IN ('/animes','/otro')" } },
  ]) assert.equal(inspectConstraintDeclaration(ddl(observed), context), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed.replaceAll('ck_promociones_destino', 'other_check')), { ...identity, name: 'other_check' }), 'unknown')
})
const liveFixture = clause => preflightFixture({ transformDdl: (text, table) => table !== 'promociones' ? text : text.replace(/CONSTRAINT `ck_promociones_destino` CHECK \([\s\S]*?\)(?=, CONSTRAINT|\) ENGINE)/, () => clause) })
test('preflight verifies all 39 constraints with observed destination clause', async () => {
  const result = await preflightTidb(liveFixture(observed), 'otakuzone_prod')
  assert.equal(result.runtimeApproved, true)
  assert.equal(result.constraints.length, 39)
})
test('preflight blocks changed, absent, duplicate and disabled destination checks', async () => {
  for (const clause of [observed.replace('/tienda', '/otro'), observed + ', ' + observed, observed + ' NOT ENFORCED']) {
    await assert.rejects(preflightTidb(liveFixture(clause), 'otakuzone_prod'))
  }
  await assert.rejects(preflightTidb(preflightFixture({ absentDdl: expected.name }), 'otakuzone_prod'))
})
