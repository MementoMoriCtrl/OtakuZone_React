import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import net from 'node:net'
import { captureMetadata, queries, privateSink } from '../scripts/capture-tidb-metadata-readonly.js'

const environment = { TIDB_METADATA_CAPTURE_ENABLED: 'true', DB_ENGINE: 'tidb', DB_NAME: 'otakuzone_db', DB_HOST: 'fixture.example.invalid', DB_USER: 'fixture.reader', DB_PASSWORD: 'fixture-secret', DB_SSL: 'true', DB_POOL_SIZE: '2' }
function fixtures() {
  const identity = [{ session_id: '1234567890123456789', version: '8.0.11-TiDB-v8.5.3-serverless', tidb_version: 'Release Version: v8.5.3', selected_database: 'otakuzone_db', captured_at_utc: '2026-11-17 12:00:00.000' }]
  const global = ['tidb_enable_check_constraint', 'tidb_enable_foreign_key'].map(Variable_name => ({ Variable_name, Value: 'ON' }))
  const session = Object.entries({ foreign_key_checks: 'ON', sql_mode: 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY', time_zone: '+00:00', system_time_zone: 'UTC', tidb_txn_mode: 'pessimistic', tidb_constraint_check_in_place_pessimistic: 'ON', autocommit: 'ON' }).map(([Variable_name, Value]) => ({ Variable_name, Value }))
  const columns = ['usuario_id', 'estado', 'moneda', 'costo_envio', 'creado_en'].map(COLUMN_NAME => ({ TABLE_NAME: 'pedidos', COLUMN_NAME, COLUMN_DEFAULT: null, default_is_null: 1, default_octets: null, default_hex: null, EXTRA: '', extra_is_null: 0, extra_octets: 0, extra_hex: '' }))
  const ddl = Table => [{ Table, 'Create Table': 'CREATE TABLE `' + Table + '` (`id` bigint, CONSTRAINT `fk_' + Table + '_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)' + (Table === 'pedidos' ? ", CONSTRAINT `ck_pedidos_moneda` CHECK (`moneda` = 'PEN'), CONSTRAINT `ck_pedidos_envio` CHECK (`costo_envio` >= 0)" : '') + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' }]
  const fk = ['pedidos', 'carritos'].map(TABLE_NAME => ({ TABLE_NAME, CONSTRAINT_NAME: 'fk_' + TABLE_NAME + '_usuario', ORDINAL_POSITION: 1, COLUMN_NAME: 'usuario_id', REFERENCED_TABLE_SCHEMA: 'otakuzone_db', REFERENCED_TABLE_NAME: 'usuarios', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'RESTRICT', UPDATE_RULE: 'RESTRICT' }))
  return [identity, global, session, columns, ddl('pedidos'), ddl('carritos'), fk, identity, global, session].map(r => structuredClone(r))
}
async function run({ env = environment, rows = fixtures(), failAt = -1, closeFails = false, sinkFails = false } = {}) {
  const calls = [], saved = {}; let acquired = 0, closed = 0, destroyed = 0, options
  const result = await captureMetadata({ environment: env, createConnection: async config => {
    acquired++; options = config
    return { query: async sql => { const i = calls.length; calls.push(sql); if (i === failAt) throw Object.assign(new Error('fixture-secret PRIVATE_SQL'), { code: 'ER_ACCESS_DENIED_ERROR', sqlMessage: 'fixture-secret' }); return [rows[i], [{ name: 'test', columnType: 253 }]] }, end: async () => { closed++; if (closeFails) throw new Error('fixture-secret') }, destroy: () => { destroyed++ } }
  }, save: async (name, value) => { if (sinkFails && name === 'Q2-intent.json') throw new Error('fixture-secret'); saved[name] = structuredClone(value) } })
  return { result, calls, saved, acquired, closed, destroyed, options }
}
// Network guard ensures a mistaken live driver call cannot reach a server.
const originalConnect = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('NETWORK_FORBIDDEN') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(attempts, 0) })

for (const [label, changes] of [ ['disabled', { TIDB_METADATA_CAPTURE_ENABLED: 'false' }], ['TLS off', { DB_SSL: 'false' }], ['verification bypass', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }], ['wrong database', { DB_NAME: 'other' }], ['missing password', { DB_PASSWORD: '' }], ['wrong engine', { DB_ENGINE: 'mysql' }] ]) {
  test('rejects before connecting: ' + label, async () => {
    let calls = 0
    await assert.rejects(captureMetadata({ environment: { ...environment, ...changes }, createConnection: async () => { calls++ }, save: async () => {} }))
    assert.equal(calls, 0)
  })
}
test('fixed statements equal the 5.0 block, no arbitrary or write statements', async () => {
  const doc = await readFile(new URL('../../docs/DESPLIEGUE_ETAPA_5_0_PREPARACION_VERIFICACION_TIDB.md', import.meta.url), 'utf8')
  const expected = doc.match(/```sql\n([\s\S]*?)```/)[1].replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean).map(s => s + ';')
  assert.deepEqual(queries, expected)
  assert.equal(queries.length, 10)
  for (const sql of queries) { assert.match(sql, /^(SELECT|SHOW) /); assert.doesNotMatch(sql, /^(SET|USE|BEGIN|INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\s+(TABLE|SESSION|GLOBAL|INTO|FROM)/i) }
  assert.ok(Object.isFrozen(queries))
})
test('one dedicated connection, exact order, full outputs and TLS verification', async () => {
  const r = await run()
  assert.equal(r.result.status, 'captured-awaiting-review')
  assert.deepEqual(r.calls, queries); assert.equal(r.acquired, 1); assert.equal(r.closed, 1)
  assert.equal(r.options.ssl.rejectUnauthorized, true); assert.equal(r.options.ssl.verifyIdentity, true); assert.equal(r.options.multipleStatements, false)
  assert.deepEqual(r.saved['Q4.json'].rows, fixtures()[3]); assert.deepEqual(r.saved['Q5.json'].rows, fixtures()[4])
  for (const k of ['readyForRemoteExecution', 'ledgerTransitionAllowed', 'allow007']) assert.equal(r.result[k], false)
  assert.doesNotMatch(JSON.stringify(r.saved), /fixture-secret|fixture\.reader|fixture\.example/)
})
test('query failure preserved safely, stops without retry and closes', async () => {
  const r = await run({ failAt: 3 })
  assert.equal(r.calls.length, 4); assert.equal(r.closed, 1)
  assert.equal(r.result.status, 'partial'); assert.equal(r.saved['Q4-error.json'].error.driverCode, 'ER_ACCESS_DENIED_ERROR')
  assert.doesNotMatch(JSON.stringify(r.saved), /fixture-secret|PRIVATE_SQL|sqlMessage/)
})
for (const [label, mutate, count] of [
  ['identity drift', r => { r[7][0].session_id = '99' }, 8],
  ['global drift', r => { r[8][0].Value = 'OFF' }, 9],
  ['session drift', r => { r[9][0].Value = 'OFF' }, 10],
  ['missing column', r => { r[3].pop() }, 4],
  ['null indicator mismatch', r => { r[3][0].default_is_null = 0 }, 4],
  ['DDL truncated', r => { r[4][0]['Create Table'] = 'CREATE TABLE `pedidos` (' }, 5],
  ['wrong FK destination', r => { r[6][0].REFERENCED_TABLE_SCHEMA = 'other' }, 7],
  ['duplicate controls', r => { r[1][1] = r[1][0] }, 2],
  ['clock regression', r => { r[7][0].captured_at_utc = '2026-11-17 11:00:00.000' }, 8],
  ['DDL missing constraint', r => { r[4][0]['Create Table'] = 'CREATE TABLE `pedidos` (`id` bigint) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' }, 5],
]) test('stops and retains evidence: ' + label, async () => {
  const rows = fixtures(); mutate(rows)
  const r = await run({ rows }); assert.equal(r.result.status, 'partial'); assert.equal(r.calls.length, count); assert.equal(r.closed, 1)
  assert.ok(r.saved['Q' + count + '.json']); assert.ok(r.result.error)
})
test('sink failure prevents next query and closes', async () => { const r = await run({ sinkFails: true }); assert.equal(r.calls.length, 1); assert.equal(r.closed, 1); assert.equal(r.result.status, 'partial') })
test('close failure destroys without replay', async () => { const r = await run({ closeFails: true }); assert.equal(r.destroyed, 1); assert.equal(r.calls.length, 10); assert.equal(r.result.status, 'partial') })
test('private sink preserves bytes and SHA-256, refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tidb-synthetic-test-'))
  try {
    const save = await privateSink(root); await save('opening.json', { empty: '', sqlNull: null })
    await assert.rejects(save('opening.json', {}))
    const [directory] = await readdir(root)
    const bytes = await readFile(join(root, directory, 'opening.json'))
    const hash = await readFile(join(root, directory, 'opening.json.sha256'), 'utf8')
    assert.equal(hash.trim(), createHash('sha256').update(bytes).digest('hex'))
    assert.deepEqual(JSON.parse(bytes), { empty: '', sqlNull: null })
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('tidb-synthetic-test-'))
    await rm(root, { recursive: true, force: true })
  }
})

test('connection failure is recorded without private messages or retries', async () => {
  const saved = {}; let attempts = 0
  const report = await captureMetadata({ environment, createConnection: async () => { attempts++; throw new Error('fixture-secret private-host') }, save: async (name, value) => { saved[name] = structuredClone(value) } })
  assert.equal(attempts, 1); assert.equal(report.results.length, 0); assert.equal(report.status, 'partial')
  assert.ok(saved['report.json'].error); assert.doesNotMatch(JSON.stringify(saved), /fixture-secret|private-host/)
})
test('missing private sink blocks before connection', async () => {
  let calls = 0
  await assert.rejects(captureMetadata({ environment, createConnection: async () => { calls++ } }), /PRIVATE_SINK_REQUIRED/)
  assert.equal(calls, 0)
})
