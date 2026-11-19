import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { inspectConstraintDeclaration } from '../src/db/tidbEnforcementEvidence.js'
import { runtimeConstraintContract } from '../src/db/tidbRuntimeIntegrity.js'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

// Literal clause supplied by the user from SHOW CREATE TABLE, not generated
// from the expected expression. The trailing table-clause comma is omitted.
const observed = "CONSTRAINT `ck_usuarios_email_canonical` CHECK ((`email` is not null and octet_length(`email`) between 1 and 254 and not regexp_like(`email`, _utf8mb4'[^a-z0-9_''+@.-]', _utf8mb4'c') and regexp_like(`email`, _utf8mb4'^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$', _utf8mb4'c')))"
const expected = (await runtimeConstraintContract('otakuzone_prod')).find(c => c.name === 'ck_usuarios_email_canonical')
const identity = { name: expected.name, type: expected.type, tableName: 'usuarios', database: 'otakuzone_prod', engineVersion: '8.5.3', declarationMode: 'runtime-v1', definition: expected.definition }
const ddl = clause => `CREATE TABLE \`usuarios\` (\`email\` varchar(254) COLLATE utf8mb4_0900_bin NOT NULL, ${clause}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
const originalConnect = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('Real network forbidden') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })

test('exact observed TiDB email CHECK is accepted, including doubled quotes and wrapper parentheses', () => {
  assert.equal(inspectConstraintDeclaration(ddl(observed), identity), true)
  assert.equal(inspectConstraintDeclaration(ddl(observed.replaceAll('_utf8mb4', '_UTF8MB4')), identity), true)
})

test('previous catalog representation is still accepted', () => {
  assert.equal(inspectConstraintDeclaration(ddl(`CONSTRAINT \`${expected.name}\` CHECK (${expected.definition.clause})`), identity), true)
})

for (const [label, change] of [
  ['different flags', s => s.replaceAll("_utf8mb4'c'", "_utf8mb4'i'")],
  ['changed pattern', s => s.replace('[^a-z0-9_', '[^A-Za-z0-9_')],
  ['different bound', s => s.replace('between 1 and 254', 'between 1 and 255')],
  ['different boolean operator', s => s.replace(' and not regexp_like', ' or not regexp_like')],
  ['different column', s => s.replace('`email` is not null', '`nombre` is not null')],
  ['different charset', s => s.replaceAll('_utf8mb4', '_ascii')],
  ['binary introducer', s => s.replaceAll('_utf8mb4', '_binary')],
  ['explicit collation', s => s.replace("_utf8mb4'c'", "_utf8mb4'c' COLLATE utf8mb4_general_ci")],
  ['mixed representation', s => s.replace("_utf8mb4'c'", "'c'")],
  ['weakened expression', () => 'CONSTRAINT `ck_usuarios_email_canonical` CHECK (email IS NOT NULL)'],
]) test('observed email CHECK still rejects: ' + label, () => {
  assert.equal(inspectConstraintDeclaration(ddl(change(observed)), identity), 'unknown')
})

test('absent, duplicate, truncated and disabled constraints remain rejected', () => {
  assert.equal(inspectConstraintDeclaration(ddl('CONSTRAINT other_check CHECK (email IS NOT NULL)'), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ', ' + observed), identity), 'unknown')
  const complete = ddl(observed)
  assert.equal(inspectConstraintDeclaration(complete.slice(0, complete.indexOf(') ENGINE')), identity), 'unknown')
  assert.equal(inspectConstraintDeclaration(ddl(observed + ' /*!80016 NOT ENFORCED */'), identity), false)
})

test('representation rule does not apply to other identities, versions, predicates or offline evidence', () => {
  for (const context of [
    { ...identity, declarationMode: undefined },
    { ...identity, database: 'otakuzone_db' },
    { ...identity, engineVersion: '8.5.4' },
    { ...identity, name: 'other_check' },
    { ...identity, definition: { ...expected.definition, clause: 'email IS NOT NULL' } },
  ]) assert.equal(inspectConstraintDeclaration(ddl(observed), context), 'unknown')
  const other = { ...identity, tableName: 'pedidos', name: 'ck_pedidos_moneda', definition: { clause: "moneda = 'PEN'" } }
  assert.equal(inspectConstraintDeclaration("CREATE TABLE pedidos (CONSTRAINT ck_pedidos_moneda CHECK (moneda = _utf8mb4'PEN')) ENGINE=InnoDB", other), 'unknown')
})

const liveFixture = clause => preflightFixture({ transformDdl: (text, table) => table !== 'usuarios' ? text : text.replace(/CONSTRAINT `ck_usuarios_email_canonical` CHECK \([\s\S]*?\)(?=, CONSTRAINT)/, () => clause) })

test('runtime fixture verifies all 39 constraints with the exact observed email clause', async () => {
  const result = await preflightTidb(liveFixture(observed), 'otakuzone_prod')
  assert.equal(result.runtimeApproved, true)
  assert.equal(result.constraints.length, 39)
})

test('runtime still blocks changed or absent observed email CHECK', async () => {
  await assert.rejects(preflightTidb(liveFixture(observed.replace('between 1 and 254', 'between 1 and 255')), 'otakuzone_prod'), e => e.reason === 'constraint-definition-unknown-or-different' && e.diagnostic.restrictionName === expected.name)
  await assert.rejects(preflightTidb(preflightFixture({ absentDdl: expected.name }), 'otakuzone_prod'), e => e.reason === 'constraint-inventory-absent' && e.diagnostic.restrictionName === expected.name)
})
