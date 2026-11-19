import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { declaredConstraintNames, inspectConstraintDeclaration } from '../src/db/tidbEnforcementEvidence.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

const original = net.Socket.prototype.connect
let connections = 0
net.Socket.prototype.connect = function () { connections++; throw new Error('Network forbidden') }
test.after(() => { net.Socket.prototype.connect = original; assert.equal(connections, 0) })
const secret = 'PRIVATE_PASSWORD_TOKEN_person@example.invalid'
const run = transformDdl => preflightTidb(preflightFixture({ transformDdl }), 'otakuzone_prod')
const onlyPedidos = transform => (ddl, table) => table === 'pedidos' ? transform(ddl) : ddl
const inspectError = (reason, stage, tableName, restrictionName, detailReason) => e => {
  assert.equal(e.dimension, 'declarative'); assert.equal(e.reason, reason)
  assert.equal(e.source, 'SHOW CREATE TABLE')
  assert.equal(e.diagnostic.stage, stage); assert.equal(e.diagnostic.tableName, tableName)
  if (restrictionName) assert.equal(e.diagnostic.restrictionName, restrictionName)
  if (detailReason) assert.equal(e.diagnostic.detailReason, detailReason)
  const serialized = JSON.stringify({ message: e.message, stack: e.stack, ...e })
  assert.doesNotMatch(serialized, /CREATE TABLE [`(]|PRIVATE_PASSWORD_TOKEN|person@example|AUTO_ID_CACHE|_ascii/)
  assert.ok(e.message.includes(tableName)) // server.js logs message, not custom fields.
  return true
}

test('unsupported table suffix identifies table/parse stage and does not accept TiDB comments', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl + ' /*T![auto_id_cache] AUTO_ID_CACHE=1 */')),
    inspectError('ddl-uninterpretable', 'ddl-parse', 'pedidos', undefined, 'table-option-unsupported'))
})

test('truncated DDL identifies table, without claiming a missing constraint', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.slice(0, ddl.indexOf(') ENGINE')))),
    inspectError('ddl-uninterpretable', 'ddl-parse', 'pedidos', undefined, 'table-body-or-engine-invalid'))
})

for (const [label, replacement] of [['charset introducer', "_ascii'PEN'"], ['different value', `'${secret}'`]]) {
  test('unknown individual CHECK identifies restriction and stays blocked: ' + label, async () => {
    await assert.rejects(run(onlyPedidos(ddl => ddl.replace("'PEN'", replacement))),
      inspectError('constraint-definition-unknown-or-different', 'constraint-definition', 'pedidos', 'ck_pedidos_moneda', 'check-expression-unknown-or-different'))
  })
}

test('absent inventory identifies the known missing constraint', async () => {
  await assert.rejects(preflightTidb(preflightFixture({ absentDdl: 'ck_pedidos_moneda' }), 'otakuzone_prod'),
    inspectError('constraint-inventory-absent', 'constraint-inventory', 'pedidos', 'ck_pedidos_moneda'))
})

test('additional inventory never exposes an unknown remote restriction name', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.replace(') ENGINE', `, CONSTRAINT \`${secret}\` CHECK (id > 0)) ENGINE`))), e => {
    inspectError('constraint-inventory-additional', 'constraint-inventory', 'pedidos')(e)
    assert.equal(e.diagnostic.additionalCount, 1)
    assert.equal(e.diagnostic.restrictionName, undefined)
    return true
  })
})

test('duplicate inventory identifies the known duplicate constraint', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.replace(') ENGINE', ", CONSTRAINT `ck_pedidos_moneda` CHECK (moneda = 'PEN')) ENGINE"))),
    inspectError('constraint-inventory-duplicate', 'constraint-inventory', 'pedidos', 'ck_pedidos_moneda'))
})

test('mixed inventory preserves missing/additional counts without exposing names', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.replace('`ck_pedidos_moneda`', '`' + secret + '`'))), e => {
    inspectError('constraint-inventory-different', 'constraint-inventory', 'pedidos', 'ck_pedidos_moneda')(e)
    assert.equal(e.diagnostic.missingCount, 1); assert.equal(e.diagnostic.additionalCount, 1)
    return true
  })
})

test('disabled marker still blocks with individual context', async () => {
  await assert.rejects(preflightTidb(preflightFixture({ disabledCheck: 'ck_pedidos_envio' }), 'otakuzone_prod'),
    inspectError('enforcement-declaratively-disabled', 'constraint-definition', 'pedidos', 'ck_pedidos_envio'))
})

test('SHOW failure identifies table and never propagates driver details', async () => {
  await assert.rejects(preflightTidb(preflightFixture({ errorAt: 'SHOW CREATE TABLE' }), 'otakuzone_prod'),
    inspectError('metadata-query-unavailable', 'ddl-read', 'usuarios'))
})

test('missing SHOW result is distinguished from uninterpretable DDL', async () => {
  const base = preflightFixture()
  const connection = { execute: (sql, params) => sql.startsWith('SHOW CREATE') ? Promise.resolve([[]]) : base.execute(sql, params) }
  await assert.rejects(preflightTidb(connection, 'otakuzone_prod'),
    inspectError('definition-unknown', 'ddl-read', 'usuarios', undefined, 'show-create-result-invalid'))
})

test('individual unknown FK identifies the constraint without printing its definition', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.replace('REFERENCES `usuarios`', 'REFERENCES `' + secret + '`'))),
    inspectError('constraint-definition-unknown-or-different', 'constraint-definition', 'pedidos', 'fk_pedidos_usuario', 'fk-definition-unknown-or-different'))
})

test('sensitive text in an unsupported clause comment is not logged', async () => {
  await assert.rejects(run(onlyPedidos(ddl => ddl.replace('CONSTRAINT', `/* ${secret} */ CONSTRAINT`))),
    inspectError('ddl-uninterpretable', 'ddl-parse', 'pedidos', undefined, 'clause-comment-unsupported-or-ambiguous'))
})

test('optional diagnostics preserve pure interpreter true/false/unknown and inventory results', () => {
  const identity = { name: 'ck_pedidos_moneda', type: 'CHECK', database: 'otakuzone_prod', tableName: 'pedidos', engineVersion: '8.5.3', declarationMode: 'runtime-v1', definition: { clause: "moneda = 'PEN'" } }
  for (const [expression, marker, expected] of [["moneda = 'PEN'", '', true], ["moneda = 'PEN'", ' /*!80016 NOT ENFORCED */', false], ["moneda = _ascii'PEN'", '', 'unknown'], ["moneda = 'USD'", '', 'unknown']]) {
    const ddl = `CREATE TABLE pedidos (CONSTRAINT ck_pedidos_moneda CHECK (${expression})${marker}) ENGINE=InnoDB`
    assert.equal(inspectConstraintDeclaration(ddl, identity), expected)
    assert.equal(inspectConstraintDeclaration(ddl, identity, {}), expected)
    assert.deepEqual(declaredConstraintNames(ddl, identity, {}), declaredConstraintNames(ddl, identity))
  }
})
