import test from 'node:test'
import assert from 'node:assert/strict'
import { identifyDatabaseEngine, assertEngineVersion, inspectDatabaseEngine } from '../src/db/engine.js'
import { checkDatabaseConnection } from '../src/db/pool.js'
import { databaseHttpError } from '../src/db/errors.js'

function corroborationExecutor({ failing, error, details = [[{ tidbVersion: tidb('8.5.0').tidbVersion }]], modes = [[{ Variable_name: 'tidb_txn_mode', Value: 'pessimistic' }]] } = {}) {
  return { execute: async sql => {
    if (sql.startsWith('SELECT VERSION()')) return [[{ version: '8.0.11-TiDB-v8.5.0' }]]
    const operation = sql.startsWith('SELECT TIDB_VERSION()') ? 'details' : 'modes'
    if (operation === failing) throw error
    return operation === 'details' ? details : modes
  } }
}

for (const failing of ['details', 'modes']) test(`corroboration ${failing} preserves transport type, code and cause`, async () => {
  const cause = new Error('private original cause')
  const error = Object.assign(new TypeError('private query'), { code: 'ETIMEDOUT', errno: -1, syscall: 'connect', cause })
  await assert.rejects(inspectDatabaseEngine(corroborationExecutor({ failing, error })), e => e === error && e instanceof TypeError && e.code === 'ETIMEDOUT' && e.cause === cause)
  const publicError = databaseHttpError(error)
  assert.equal(publicError.status, 503)
  assert.equal(publicError.code, 'DATABASE_UNAVAILABLE')
  assert.equal(publicError.message.includes('private'), false)
})
for (const field of ['details', 'modes']) for (const value of [null, {}, [], [null], [[]], [[null]], [[{}]], [['private']]]) {
  test(`malformed ${field} response remains a controlled identity rejection: ${JSON.stringify(value)}`, async () => {
    await assert.rejects(inspectDatabaseEngine(corroborationExecutor({ [field]: value })), e => e instanceof Error && !(e instanceof TypeError) && e.message.startsWith('Motor de base de datos no admitido:') && !e.message.includes('private'))
  })
}
test('divergent corroboration and incompatible versions remain rejected by inspection', async () => {
  await assert.rejects(inspectDatabaseEngine(corroborationExecutor({ details: [[{ tidbVersion: tidb('7.5.1').tidbVersion }]] })), /identidad TiDB/)
  const executor = corroborationExecutor({ details: [[{ tidbVersion: tidb('7.1.0').tidbVersion }]] })
  const execute = executor.execute
  executor.execute = sql => sql.startsWith('SELECT VERSION()') ? Promise.resolve([[{ version: '8.0.11-TiDB-v7.1.0' }]]) : execute(sql)
  await assert.rejects(inspectDatabaseEngine(executor), /TiDB estable/)
})
test('MySQL inspection never issues TiDB corroboration queries', async () => {
  const calls = []
  const result = await inspectDatabaseEngine({ execute: async sql => { calls.push(sql); return [[{ version: '8.0.36', versionComment: 'MySQL Community Server' }]] } })
  assert.equal(result.identity.engine, 'mysql')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].startsWith('SELECT VERSION()'), true)
})

const tidb = version => ({ version: `8.0.11-TiDB-v${version}`, tidbVersion: `Release Version: v${version}\nEdition: Community\nGit Commit Hash: fixture`, tidbTxnMode: 'pessimistic' })
test('identifica MySQL estable y conserva mínimo 8.0.16', () => {
  for (const version of ['8.0.16', '8.0.46', '8.4.2', '9.0.0']) {
    const identity = identifyDatabaseEngine({ version, versionComment: 'MySQL Community Server - GPL' })
    assert.equal(identity.engine, 'mysql'); assert.doesNotThrow(() => assertEngineVersion(identity))
  }
  for (const version of ['5.7.44', '8.0.15']) assert.throws(() => assertEngineVersion(identifyDatabaseEngine({ version, versionComment: 'MySQL Community Server' })))
})
test('TiDB requiere banner exacto, release corroborado y variable propia', () => {
  for (const version of ['7.5.1', '8.5.0', '8.5.6']) {
    const identity = identifyDatabaseEngine(tidb(version))
    assert.equal(identity.engine, 'tidb'); assert.equal(identity.version, version)
    assert.doesNotThrow(() => assertEngineVersion(identity))
  }
  assert.throws(() => identifyDatabaseEngine({ ...tidb('8.5.0'), tidbVersion: 'Release Version: v7.5.1\nEdition: Community' }))
  assert.throws(() => identifyDatabaseEngine({ ...tidb('8.5.0'), tidbTxnMode: undefined }))
  assert.throws(() => assertEngineVersion(identifyDatabaseEngine(tidb('7.1.0'))))
})
test('rechaza forks, cadenas arbitrarias y versiones TiDB no verificables', () => {
  for (const version of ['10.11.0-MariaDB', '8.0.46-UnknownDB', '8.0.46-TiDB-fake', 'TiDB', '8.0.11-TiDB-v8.5.0-nightly', '', undefined]) {
    assert.throws(() => identifyDatabaseEngine({ version, versionComment: 'MySQL Community Server' }))
  }
  assert.throws(() => identifyDatabaseEngine({ version: '8.0.46', versionComment: 'Unknown Engine' }))
})
test('inspección y selección explícita de motor sin fallback ni DDL', async () => {
  const calls = []
  const executor = { execute: async sql => {
    calls.push(sql)
    if (sql.startsWith('SELECT VERSION()')) return [[{ version: '8.0.11-TiDB-v8.5.0', databaseName: 'fixture' }]]
    if (sql.includes('TIDB_VERSION()')) return [[{ tidbVersion: tidb('8.5.0').tidbVersion }]]
    if (sql.startsWith('SHOW SESSION')) return [[{ Variable_name: 'tidb_txn_mode', Value: 'pessimistic' }]]
    throw new Error('SQL de fixture no previsto')
  } }
  assert.equal((await inspectDatabaseEngine(executor)).identity.engine, 'tidb')
  await assert.rejects(checkDatabaseConnection(executor), /DB_ENGINE/)
  assert.ok(calls.every(sql => /^(SELECT|SHOW) /.test(sql)))
})
test('preflight mantiene una conexión física y la libera ante rechazo', async () => {
  let acquired = 0, released = 0
  const pool = { getConnection: async () => {
    acquired++
    return { execute: async () => [[{ version: '8.0.46', versionComment: 'MySQL Community Server', databaseName: 'fixture' }]], release: () => released++ }
  } }
  assert.equal((await checkDatabaseConnection(pool)).identity.engine, 'mysql')
  await assert.rejects(checkDatabaseConnection(pool, { expectedEngine: 'tidb' }), /DB_ENGINE/)
  assert.equal(acquired, 2); assert.equal(released, 2)
})
