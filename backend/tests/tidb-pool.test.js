import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { loadDatabaseConfig } from '../src/config/database.js'
import { databasePoolOptions, createDatabasePool, executeRows } from '../src/db/pool.js'
import { installConnectionLifetime } from '../src/db/connectionLifecycle.js'
import { withTransaction } from '../src/db/transaction.js'
import { databaseHttpError } from '../src/db/errors.js'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'

const tidbConfig = overrides => loadDatabaseConfig({ DB_ENGINE: 'tidb', DB_HOST: 'db.fixture.test', DB_SSL: 'true', DB_USER: 'fixture.runtime', DB_PASSWORD: 'fixture-only-not-a-credential', ...overrides })
function clockFixture() {
  let time = 0, id = 0
  const timers = new Map(), pool = new EventEmitter(), connection = new EventEmitter()
  let destroyed = 0
  connection.destroy = () => { destroyed++; connection.emit('end') }
  const dispose = installConnectionLifetime(pool, {
    maxLifetimeMs: 300000, now: () => time,
    schedule: (callback, delay) => { timers.set(++id, { callback, at: time + delay }); return id },
    cancel: key => timers.delete(key),
  })
  pool.emit('connection', connection)
  return { pool, connection, dispose, timers, destroyed: () => destroyed, advance: ms => {
    time += ms
    for (const [key, timer] of [...timers]) if (timer.at <= time && timers.delete(key)) timer.callback()
  } }
}
test('config local MySQL preservada; TiDB exige TLS, hostname, pool pequeño e identidad runtime', () => {
  const local = loadDatabaseConfig({ DB_USER: 'unit', DB_PASSWORD: 'unit-only' })
  assert.equal(local.engine, 'mysql'); assert.equal(local.host, '127.0.0.1'); assert.equal(local.ssl, false)
  assert.equal(local.connectionLimit, 5)
  for (const overrides of [{ DB_ENGINE: 'unknown' }, { DB_SSL: 'false' }, { DB_HOST: '127.0.0.1' }, { DB_POOL_SIZE: '20' }, { DB_POOL_SIZE: '1' }, { DB_USER: 'fixture.root' }, { DB_USER: 'runtime' }, { DB_USER: 'p'.repeat(25) + '.runtime' }]) assert.throws(() => tidbConfig(overrides))
  assert.doesNotThrow(() => tidbConfig({ DB_POOL_SIZE: '2' }))
})
test('opciones mysql2 activan retiro de inactivas y TLS verificado sin modificar MySQL', async () => {
  const config = tidbConfig(), options = databasePoolOptions(config)
  assert.ok(options.maxIdle < options.connectionLimit)
  assert.equal(options.idleTimeout, 60000); assert.equal(options.queueLimit, 20)
  assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.multipleStatements, false)
  assert.equal(options.host, 'db.fixture.test')
  const mysql = databasePoolOptions({ ...config, engine: 'mysql' })
  assert.equal(mysql.maxIdle, undefined); assert.equal(mysql.idleTimeout, undefined)
  // mysql2 pools are lazy: constructing and closing without a query opens no socket.
  const pool = createDatabasePool(config)
  await pool.end()
})
test('una conexión libre se retira por edad y los timers se limpian al cerrar', () => {
  const f = clockFixture()
  f.pool.emit('acquire', f.connection); f.pool.emit('release', f.connection)
  f.advance(299999); assert.equal(f.destroyed(), 0)
  f.advance(1); assert.equal(f.destroyed(), 1); assert.equal(f.timers.size, 0)
  f.dispose()
  assert.equal(f.pool.listenerCount('release'), 0)
})
test('no retira conexiones adquiridas ni transferidas a la cola hasta liberación final', () => {
  const f = clockFixture()
  f.pool.emit('acquire', f.connection); f.pool.emit('release', f.connection)
  f.advance(1000); f.pool.emit('acquire', f.connection)
  f.advance(400000); assert.equal(f.destroyed(), 0)
  // mysql2 does not emit release when directly handing off to a queued borrower.
  f.advance(400000); assert.equal(f.destroyed(), 0)
  f.pool.emit('release', f.connection); assert.equal(f.destroyed(), 1)
  f.dispose()
})
test('el retiro por edad ocurre después del commit y release, nunca durante transacción', async () => {
  const f = clockFixture(), events = []
  Object.assign(f.connection, {
    query: async () => events.push('utc'), beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'), rollback: async () => events.push('rollback'),
    release: () => { events.push('release'); f.pool.emit('release', f.connection) },
  })
  const pool = { getConnection: async () => { f.pool.emit('acquire', f.connection); return f.connection } }
  await withTransaction(pool, async () => { f.advance(400000); assert.equal(f.destroyed(), 0); events.push('work') })
  assert.deepEqual(events, ['utc', 'begin', 'work', 'commit', 'release'])
  assert.equal(f.destroyed(), 1); f.dispose()
})
test('desconexión durante commit no se reintenta ni devuelve conexión al pool', async () => {
  let work = 0, destroyed = 0, released = 0, rollback = 0
  const failure = Object.assign(new Error('private-driver-detail'), { code: 'ECONNRESET' })
  const connection = { query: async () => {}, beginTransaction: async () => {}, commit: async () => { throw failure }, rollback: async () => rollback++, release: () => released++, destroy: () => destroyed++ }
  await assert.rejects(withTransaction({ getConnection: async () => connection }, async () => work++), error => error === failure)
  assert.equal(work, 1); assert.equal(destroyed, 1); assert.equal(released, 0); assert.equal(rollback, 0)
  const http = databaseHttpError(failure)
  assert.equal(http.status, 503); assert.ok(!http.message.includes('private'))
})
test('desconexión de lecturas y límite de conexiones producen 503 sin fallback', async () => {
  for (const code of ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']) {
    let calls = 0
    await assert.rejects(executeRows({ execute: async () => { calls++; throw Object.assign(new Error('sensitive SQL'), { code }) } }, 'fixture'), error => error.status === 503 && !error.message.includes('sensitive'))
    assert.equal(calls, 1)
  }
  const conflict = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' })
  assert.equal(databaseHttpError(conflict), conflict)
})
test('HTTP local oculta detalles de desconexión sin devolver catálogo demo', async context => {
  const repository = { findProducts: async () => { throw Object.assign(new Error('private-query-with-credentials'), { code: 'ECONNRESET' }) } }
  const app = createApp({ config: loadConfig({ NODE_ENV: 'test' }), repository })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/products`)
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.success, false); assert.equal(body.error.code, 'DATABASE_UNAVAILABLE')
  assert.ok(!JSON.stringify(body).includes('private')); assert.equal(body.data, undefined)
})
