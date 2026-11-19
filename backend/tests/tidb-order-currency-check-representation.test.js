import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { inspectConstraintDeclaration } from '../src/db/tidbEnforcementEvidence.js'
import { runtimeConstraintContract } from '../src/db/tidbRuntimeIntegrity.js'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

const observed = "CONSTRAINT `ck_pedidos_moneda` CHECK ((`moneda` = _utf8mb4'PEN'))"
const expected = (await runtimeConstraintContract('otakuzone_prod')).find(c => c.name === 'ck_pedidos_moneda')
const identity = { ...expected, database: 'otakuzone_prod', engineVersion: '8.5.3', declarationMode: 'runtime-v1' }
const ddl = clause => `CREATE TABLE pedidos (moneda char(3), ${clause}) ENGINE=InnoDB`
const originalConnect = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('Real network forbidden') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })

test('exact observed currency clause and original representation are accepted', () => {
  for (const clause of [observed, observed.replace('_utf8mb4', ''), observed.replace('_utf8mb4', '_UTF8MB4')]) {
    assert.equal(inspectConstraintDeclaration(ddl(clause), identity), true)
  }
})
for (const [label, clause] of [
  ['other currency', observed.replace('PEN', 'USD')],
  ['lowercase literal', observed.replace('PEN', 'pen')],
  ['trailing space', observed.replace('PEN', 'PEN ')],
  ['different field', observed.replace('`moneda`', '`estado`')],
  ['different operator', observed.replace(' = ', ' <> ')],
  ['different introducer', observed.replace('_utf8mb4', '_ascii')],
  ['collation', observed.replace("'PEN'", "'PEN' COLLATE utf8mb4_general_ci")],
  ['weakened predicate', observed.replace("'PEN'))", "'PEN' OR 1=1))")],
]) test('currency clause rejects ' + label, () => {
  assert.equal(inspectConstraintDeclaration(ddl(clause), identity), 'unknown')
})
test('absent, duplicate, truncated and disabled currency checks remain blocked', () => {
  assert.equal(inspectConstraintDeclaration(ddl(observed.replace('ck_pedidos_moneda', 'other_check')), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ', ' + observed), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed).slice(0, -20), identity), 'unknown')
  for (const marker of [' NOT ENFORCED', ' /*!80016 NOT ENFORCED */']) {
    assert.equal(inspectConstraintDeclaration(ddl(observed + marker), identity), false)
  }
})
test('currency alternative requires exact runtime identity, version and expected predicate', () => {
  for (const context of [
    { ...identity, declarationMode: undefined }, { ...identity, database: 'otakuzone_db' },
    { ...identity, tableName: 'other' }, { ...identity, name: 'other_check' },
    { ...identity, engineVersion: '8.5.4' }, { ...identity, definition: { clause: "moneda = 'USD'" } },
  ]) assert.equal(inspectConstraintDeclaration(ddl(observed), context), 'unknown')
})
const liveFixture = clause => preflightFixture({ transformDdl: (text, table) => table !== 'pedidos' ? text : text.replace(/CONSTRAINT `ck_pedidos_moneda` CHECK \([\s\S]*?\)(?=, CONSTRAINT)/, () => clause) })
test('preflight verifies all 39 constraints with observed currency clause', async () => {
  const result = await preflightTidb(liveFixture(observed), 'otakuzone_prod')
  assert.equal(result.runtimeApproved, true)
  assert.equal(result.constraints.length, 39)
})
test('preflight blocks changed, absent, duplicate and disabled currency checks', async () => {
  for (const clause of [observed.replace('PEN', 'USD'), observed + ', ' + observed, observed + ' NOT ENFORCED']) {
    await assert.rejects(preflightTidb(liveFixture(clause), 'otakuzone_prod'))
  }
  await assert.rejects(preflightTidb(preflightFixture({ absentDdl: expected.name }), 'otakuzone_prod'))
})
