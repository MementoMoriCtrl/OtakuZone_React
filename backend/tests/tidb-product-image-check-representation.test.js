import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { inspectConstraintDeclaration } from '../src/db/tidbEnforcementEvidence.js'
import { runtimeConstraintContract } from '../src/db/tidbRuntimeIntegrity.js'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

// Exact user-supplied TiDB SHOW CREATE clause, independent of catalog rendering.
const observed = "CONSTRAINT `ck_productos_image` CHECK ((`image_key` in (_utf8mb4'figura',_utf8mb4'manga',_utf8mb4'polo',_utf8mb4'llavero')))"
const expected = (await runtimeConstraintContract('otakuzone_prod')).find(c => c.name === 'ck_productos_image')
const identity = { name: expected.name, type: expected.type, tableName: 'productos', database: 'otakuzone_prod', engineVersion: '8.5.3', declarationMode: 'runtime-v1', definition: expected.definition }
const ddl = clause => `CREATE TABLE \`productos\` (\`image_key\` varchar(80), ${clause}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
const originalConnect = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('Real network forbidden') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })

test('exact observed product image CHECK and previous representation are accepted', () => {
  assert.equal(inspectConstraintDeclaration(ddl(observed), identity), true)
  assert.equal(inspectConstraintDeclaration(ddl(observed.replaceAll('_utf8mb4', '_UTF8MB4')), identity), true)
  assert.equal(inspectConstraintDeclaration(ddl(observed.replaceAll('_utf8mb4', '')), identity), true)
})

for (const [label, change] of [
  ['additional value', s => s.replace("_utf8mb4'llavero'", "_utf8mb4'llavero',_utf8mb4'otro'")],
  ['missing value', s => s.replace(",_utf8mb4'llavero'", '')],
  ['altered value', s => s.replace("'polo'", "'POLO'")],
  ['duplicate replacing value', s => s.replace("'llavero'", "'figura'")],
  ['additional duplicate', s => s.replace("_utf8mb4'llavero'", "_utf8mb4'llavero',_utf8mb4'figura'")],
  ['different field', s => s.replace('`image_key`', '`nombre`')],
  ['NOT IN', s => s.replace(' in (', ' not in (')],
  ['weakened OR', s => s.replace("_utf8mb4'llavero')))", "_utf8mb4'llavero')) OR 1=1)")],
  ['different charset', s => s.replaceAll('_utf8mb4', '_ascii')],
  ['explicit collation', s => s.replace("_utf8mb4'polo'", "_utf8mb4'polo' COLLATE utf8mb4_general_ci")],
  ['mixed representation', s => s.replace("_utf8mb4'polo'", "'polo'")],
]) test('product image CHECK rejects: ' + label, () => {
  assert.equal(inspectConstraintDeclaration(ddl(change(observed)), identity), 'unknown')
})

test('absent, duplicate, truncated and disabled product image CHECK remain rejected', () => {
  assert.equal(inspectConstraintDeclaration(ddl('CONSTRAINT other_check CHECK (image_key IS NOT NULL)'), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ', ' + observed), identity), 'unknown')
  const complete = ddl(observed)
  assert.equal(inspectConstraintDeclaration(complete.slice(0, complete.indexOf(') ENGINE')), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ' /*!80016 NOT ENFORCED */'), identity), false)
  assert.equal(inspectConstraintDeclaration(ddl(observed + ' NOT ENFORCED'), identity), false)
})

test('alternative is restricted to this runtime identity, version, database and predicate', () => {
  for (const context of [
    { ...identity, declarationMode: undefined }, { ...identity, database: 'otakuzone_db' },
    { ...identity, engineVersion: '8.5.4' }, { ...identity, name: 'other_check' },
    { ...identity, definition: { clause: "image_key IN ('figura','manga','polo','llavero','otro')" } },
  ]) assert.equal(inspectConstraintDeclaration(ddl(observed), context), 'unknown')
  const other = { ...identity, tableName: 'pedidos', name: 'other_check', definition: { clause: "moneda = 'PEN'" } }
  assert.equal(inspectConstraintDeclaration("CREATE TABLE pedidos (CONSTRAINT other_check CHECK (moneda = _utf8mb4'PEN')) ENGINE=InnoDB", other), 'unknown')
})

const liveFixture = clause => preflightFixture({ transformDdl: (text, table) => table !== 'productos' ? text : text.replace(/CONSTRAINT `ck_productos_image` CHECK \([\s\S]*?\)(?=\) ENGINE)/, () => clause) })
test('preflight fixture verifies 39 constraints with the exact observed product clause', async () => {
  const result = await preflightTidb(liveFixture(observed), 'otakuzone_prod')
  assert.equal(result.runtimeApproved, true); assert.equal(result.constraints.length, 39)
})

test('preflight blocks a different, absent or disabled product image CHECK', async () => {
  await assert.rejects(preflightTidb(liveFixture(observed.replace("'polo'", "'otro'")), 'otakuzone_prod'), e => e.reason === 'constraint-definition-unknown-or-different' && e.diagnostic.restrictionName === expected.name)
  await assert.rejects(preflightTidb(preflightFixture({ absentDdl: expected.name }), 'otakuzone_prod'), e => e.reason === 'constraint-inventory-absent' && e.diagnostic.restrictionName === expected.name)
  await assert.rejects(preflightTidb(liveFixture(observed + ' /*!80016 NOT ENFORCED */'), 'otakuzone_prod'), e => e.reason === 'enforcement-declaratively-disabled' && e.diagnostic.restrictionName === expected.name)
})
