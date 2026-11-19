import test from 'node:test'
import assert from 'node:assert/strict'
import { startupStage, withStartupDiagnostics } from '../src/db/startupDiagnostics.js'
import { installTidbSessionGuard } from '../src/db/tidbSession.js'
import { checkDatabaseConnection } from '../src/db/pool.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'
import { readFile } from 'node:fs/promises'

const checks = ['auth-sessions-check', 'order-history-check', 'inventory-movements-check', 'order-columns-check']
const checkSql = ['SELECT id FROM auth_sesiones LIMIT 0', 'SELECT id FROM historial_pedidos LIMIT 0', 'SELECT id FROM movimientos_inventario LIMIT 0', 'SELECT carrito_origen_id,clave_solicitud FROM pedidos LIMIT 0']

// Execute the actual server startup body with injected dependencies, never sockets or SQL.
async function startupDouble({ at = -1, phase = 'query' } = {}) {
  const sourceText = (await readFile(new URL('../src/server.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const logs = [], calls = []
  const error = Object.assign(new TypeError('private transport'), { code: 'ETIMEDOUT', cause: new Error('private cause') })
  let leases = 0, listening = 0, closed = 0, time = 0
  const pool = { getConnection: async () => {
    const index = leases++
    if (index === at && phase === 'acquire') throw error
    return {
      query: async () => { if (index === at && phase === 'session') throw error },
      execute: async (...args) => {
        if (args[0].startsWith('SHOW SESSION')) return [[
          { Variable_name: 'foreign_key_checks', Value: 'ON' }, { Variable_name: 'autocommit', Value: 'ON' },
          { Variable_name: 'tidb_txn_mode', Value: 'pessimistic' }, { Variable_name: 'sql_mode', Value: 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY' },
          { Variable_name: 'tidb_constraint_check_in_place_pessimistic', Value: 'ON' },
        ]]
        calls.push(args)
        if (index === at && phase === 'query') throw error
        return [[]]
      }, release() {}, destroy() {},
    }
  } }
  installTidbSessionGuard(pool)
  const processDouble = { env: {}, once() {}, exitCode: 0 }
  const dependencies = {
    loadEnvironment() {}, loadConfig: () => ({ auth: {}, database: {}, port: 0, host: 'fixture' }),
    createCatalogSource: () => ({ pool, repository: {}, close: async () => { closed++ } }),
    checkDatabaseConnection: async () => {}, createDatabasePool: () => { throw new Error('Unexpected second pool') },
    runDatabaseNetworkDiagnostics: () => { throw new Error('Unexpected network diagnostic') },
    withStartupDiagnostics: action => withStartupDiagnostics(action, { emit: r => logs.push(r), now: () => time += 1 }), startupStage,
    createApp: () => ({ listen: () => { listening++; return { on() {} } } }),
    console: { log() {}, error() {} }, process: processDouble,
  }
  await new AsyncFunction(...Object.keys(dependencies), sourceText)(...Object.values(dependencies))
  return { logs, calls, leases, listening, closed, exitCode: processDouble.exitCode }
}

test('actual startup executes the four checks once, in original order and with no added parameters', async () => {
  const result = await startupDouble()
  assert.deepEqual(result.calls, checkSql.map(sql => [sql]))
  assert.equal(result.listening, 1)
  assert.equal(result.leases, 4)
  assert.equal(result.exitCode, 0)
  for (const check of checks) {
    const records = result.logs.filter(r => r.check === check)
    assert.deepEqual(records.map(r => `${r.stage}:${r.status}`), [`${check}:start`, 'mysql2-acquire:start', 'mysql2-acquire:success', 'tidb-session:start', 'tidb-session:success', `${check}:success`])
    assert.ok(records.every(r => Number.isInteger(r.durationMs) && r.durationMs >= 0))
    assert.ok(records.at(-1).durationMs >= records[2].durationMs)
  }
})
for (let at = 0; at < checks.length; at++) for (const phase of ['query', 'acquire', 'session']) {
  test(`startup ${checks[at]} ${phase} failure blocks later checks and listen`, async () => {
    const result = await startupDouble({ at, phase })
    assert.equal(result.listening, 0)
    assert.equal(result.exitCode, 1)
    assert.equal(result.closed, 1)
    assert.deepEqual(result.calls, checkSql.slice(0, phase === 'query' ? at + 1 : at).map(sql => [sql]))
    assert.equal(result.logs.at(-1).stage, checks[at])
    assert.equal(result.logs.at(-1).status, 'failure')
    assert.equal(result.logs.at(-1).code, 'ETIMEDOUT')
    assert.equal(result.logs.some(r => checks.slice(at + 1).includes(r.stage)), false)
    assert.equal(JSON.stringify(result.logs).includes('private'), false)
  })
}

test('nested checks preserve the original error and cause while identifying their container', async () => {
  const error = Object.assign(new TypeError('private'), { code: 'ETIMEDOUT', cause: new Error('private cause') })
  const { logs, result } = capture(() => startupStage('auth-sessions-check', () => startupStage('mysql2-acquire', () => { throw error })))
  await assert.rejects(result, e => e === error && e instanceof TypeError && e.cause === error.cause)
  assert.ok(logs.every(r => r.check === 'auth-sessions-check'))
  assert.deepEqual(logs.map(r => r.status), ['start', 'start', 'failure', 'failure'])
  assert.equal(JSON.stringify(logs).includes('private'), false)
})

function capture(action) {
  const logs = []; let time = 0
  return { logs, result: withStartupDiagnostics(action, { emit: record => logs.push(record), now: () => time += 5 }) }
}
function poolDouble(failAt) {
  const connection = preflightFixture()
  const execute = connection.execute
  const error = Object.assign(new Error('private credentials CA cookie'), { code: 'ETIMEDOUT', errno: -1, syscall: 'connect', cause: new Error('private original cause') })
  let destroyed = 0
  connection.destroy = () => { destroyed++ }
  connection.query = async () => { if (failAt === 'tidb-session') throw error }
  connection.execute = async sql => {
    if (failAt === 'engine-identification' && sql.startsWith('SELECT VERSION()')) throw error
    return execute(sql)
  }
  const pool = { getConnection: async () => { if (failAt === 'mysql2-acquire') throw error; return connection } }
  installTidbSessionGuard(pool)
  return { pool, connection, error, destroyed: () => destroyed }
}
test('startup stages run in order with one terminal event each, bounded durations and release', async () => {
  const { pool, connection } = poolDouble()
  const { logs, result } = capture(() => checkDatabaseConnection(pool, { expectedEngine: 'tidb', expectedDatabase: 'otakuzone_prod' }))
  await result
  assert.deepEqual(logs.map(r => `${r.stage}:${r.status}`), ['mysql2-acquire:start', 'mysql2-acquire:success', 'tidb-session:start', 'tidb-session:success', 'engine-identification:start', 'engine-identification:success', 'preflight:start', 'preflight:success'])
  assert.ok(logs.every(r => Number.isInteger(r.durationMs) && r.durationMs >= 0))
  assert.ok(logs.filter(r => r.status === 'success').every(r => r.durationMs === 10))
  assert.equal(connection.calls.at(-1), 'release')
})
for (const stage of ['mysql2-acquire', 'tidb-session', 'engine-identification']) {
  test(`failure identifies ${stage}, preserves exact error and cause, and stops subsequent stages`, async () => {
    const fixture = poolDouble(stage)
    const cause = fixture.error.cause
    const { logs, result } = capture(() => checkDatabaseConnection(fixture.pool, { expectedEngine: 'tidb' }))
    await assert.rejects(result, e => e === fixture.error && e.cause === cause)
    assert.equal(logs.at(-1).stage, stage)
    assert.equal(logs.at(-1).status, 'failure')
    assert.equal(logs.at(-1).code, 'ETIMEDOUT')
    assert.equal(logs.at(-1).errno, -1)
    assert.equal(logs.at(-1).syscall, 'connect')
    assert.equal(logs.filter(r => r.status === 'failure').length, 1)
    assert.equal(JSON.stringify(logs).includes('private'), false)
    if (stage === 'tidb-session') assert.equal(fixture.destroyed(), 1)
  })
}
test('preflight rejection is tagged and the connection is still released', async () => {
  const fixture = poolDouble()
  const original = fixture.connection.execute
  fixture.connection.execute = sql => sql.startsWith('SHOW CREATE TABLE') ? Promise.resolve([[{ 'Create Table': 'uninterpretable' }]]) : original(sql)
  const { logs, result } = capture(() => checkDatabaseConnection(fixture.pool, { expectedEngine: 'tidb' }))
  await assert.rejects(result)
  assert.equal(logs.at(-1).stage, 'preflight')
  assert.equal(logs.at(-1).status, 'failure')
  assert.equal(fixture.connection.calls.at(-1), 'release')
})
test('unknown technical strings and errors never enter logs; sink failure preserves outcome', async () => {
  const error = Object.assign(new Error('private'), { code: 'SECRET_TOKEN', errno: 'private', syscall: 'private' })
  const { logs, result } = capture(() => startupStage('mysql2-acquire', () => { throw error }))
  await assert.rejects(result, e => e === error)
  assert.deepEqual(Object.keys(logs.at(-1)).sort(), ['durationMs', 'event', 'operation', 'stage', 'status'])
  await assert.rejects(withStartupDiagnostics(() => startupStage('preflight', () => { throw error }), { emit: () => { throw new Error('sink') } }), e => e === error)
  assert.equal(await withStartupDiagnostics(() => startupStage('preflight', () => 42), { emit: () => { throw new Error('sink') } }), 42)
})
test('outside startup scope the session guard and mysql path retain normal behavior', async () => {
  const fixture = poolDouble()
  await checkDatabaseConnection(fixture.pool, { expectedEngine: 'tidb' })
  const mysql = { getConnection: async () => ({ execute: async () => [[{ version: '8.0.36', versionComment: 'MySQL Community Server', ready: 1 }]], release() {} }) }
  const { logs, result } = capture(() => checkDatabaseConnection(mysql))
  await result
  assert.deepEqual(logs.filter(r => r.status === 'start').map(r => r.stage), ['mysql2-acquire', 'engine-identification'])
})
