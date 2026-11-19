import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { runDatabaseNetworkDiagnostics } from '../src/db/networkDiagnostics.js'

const originalConnect = net.Socket.prototype.connect
let connections = 0
net.Socket.prototype.connect = function () { connections++; throw new Error('Real network forbidden') }
test.after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(connections, 0) })
const database = Object.freeze({ host: 'fixture.example.invalid', port: 4000, connectTimeout: 1000, password: 'PRIVATE_PASSWORD', user: 'PRIVATE_USER', sslCa: 'PRIVATE_CERTIFICATE' })
const enabled = { DB_NETWORK_DIAGNOSTICS: 'true' }
const addresses = [{ address: '192.0.2.1', family: 4 }]

function fixture({ dnsError, tcp = 'success', tcpError = { code: 'ECONNREFUSED' }, lookup } = {}) {
  const logs = [], calls = []
  const socket = new EventEmitter()
  let destroyed = 0, time = 0
  socket.destroy = () => { destroyed++; queueMicrotask(() => socket.emit('close')) }
  socket.connect = options => {
    calls.push(['connect', options])
    if (tcp === 'throw') throw tcpError
    if (tcp !== 'timeout') queueMicrotask(() => {
      socket.emit('lookup', null, '192.0.2.1', 4, database.host)
      socket.emit(tcp === 'success' ? 'connect' : tcp === 'closed' ? 'close' : 'error', tcpError)
    })
  }
  const dependencies = {
    lookup: lookup ?? (async (host, options) => { calls.push(['dns', host, options]); if (dnsError) throw dnsError; return addresses }),
    createSocket: () => { calls.push(['socket']); return socket },
    now: () => ++time,
    log: entry => logs.push(entry),
  }
  return { dependencies, logs, calls, socket, destroyed: () => destroyed }
}

for (const value of [undefined, 'false', 'TRUE', '1']) test('disabled unless exactly true: ' + value, async () => {
  const f = fixture()
  assert.deepEqual(await runDatabaseNetworkDiagnostics(database, { DB_NETWORK_DIAGNOSTICS: value }, f.dependencies), { enabled: false })
  assert.equal(f.calls.length, 0); assert.equal(f.logs.length, 0)
})

test('DNS then independent TCP, configured target, structured durations and socket cleanup', async () => {
  const f = fixture()
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.dns.status, 'success'); assert.equal(result.tcp.status, 'success')
  assert.deepEqual(f.calls, [['dns', database.host, { all: true }], ['socket'], ['connect', { host: database.host, port: database.port }]])
  assert.equal(f.destroyed(), 1); assert.equal(f.socket.listenerCount('error'), 0)
  assert.deepEqual(f.logs.map(x => x.phase), ['start', 'dns', 'tcp', 'complete'])
  assert.ok(result.dns.durationMs >= 0); assert.ok(result.tcp.durationMs >= 0)
  assert.equal(result.tcp.lookupCompleted, true)
})

test('DNS failure is identified; independent TCP still runs without bypassing startup', async () => {
  const f = fixture({ dnsError: { code: 'ENOTFOUND', message: 'PRIVATE_PASSWORD' } })
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.dns.status, 'error'); assert.equal(result.dns.code, 'ENOTFOUND')
  assert.equal(result.tcp.status, 'success'); assert.equal(f.destroyed(), 1)
  assert.equal(f.logs.at(-1).status, 'failed')
})

test('TCP timeout is bounded and destroys the socket', async () => {
  const f = fixture({ tcp: 'timeout' })
  const result = await runDatabaseNetworkDiagnostics(database, { ...enabled, DB_NETWORK_DIAGNOSTICS_TIMEOUT_MS: '1000' }, f.dependencies)
  assert.equal(result.tcp.status, 'timeout'); assert.equal(result.tcp.code, 'ETIMEDOUT')
  assert.equal(f.destroyed(), 1)
  assert.equal(result.tcp.closeStatus, 'confirmed')
})

for (const tcp of ['error', 'throw', 'closed']) test('TCP failure closes the socket: ' + tcp, async () => {
  const f = fixture({ tcp })
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.tcp.status, 'error')
  assert.equal(result.tcp.code, tcp === 'closed' ? 'TCP_CLOSED_BEFORE_CONNECT' : 'ECONNREFUSED')
  assert.equal(f.destroyed(), tcp === 'closed' ? 0 : 1)
  assert.equal(result.tcp.closeStatus, 'confirmed')
})

test('DNS timeout consumes late rejection and records only one DNS result', async () => {
  let reject
  const f = fixture({ lookup: () => new Promise((_, fail) => { reject = fail }) })
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.dns.status, 'timeout'); assert.equal(result.tcp.status, 'success')
  reject(new Error('PRIVATE_PASSWORD')); await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.logs.filter(x => x.phase === 'dns').length, 1)
})

test('invalid diagnostic timeout never connects or logs its raw value', async () => {
  for (const timeout of ['0', '999', '30001', 'NaN', 'PRIVATE_PASSWORD']) {
    const f = fixture()
    const result = await runDatabaseNetworkDiagnostics(database, { ...enabled, DB_NETWORK_DIAGNOSTICS_TIMEOUT_MS: timeout }, f.dependencies)
    assert.equal(result.status, 'configuration-error'); assert.equal(f.calls.length, 0)
    assert.ok(!JSON.stringify(f.logs).includes('PRIVATE_PASSWORD'))
  }
})

test('logs omit credentials, CA, host, IP, SQL and arbitrary error fields/codes', async () => {
  const f = fixture({ dnsError: { code: 'PRIVATE_PASSWORD', message: 'PRIVATE_CERTIFICATE' }, tcp: 'error', tcpError: { code: 'PRIVATE_USER', message: 'PRIVATE_PASSWORD', sql: 'SELECT secret', stack: 'PRIVATE_CERTIFICATE' } })
  await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  const text = JSON.stringify(f.logs)
  assert.doesNotMatch(text, /PRIVATE_|SELECT|fixture.example|192\.0\.2\.1/)
  assert.equal(f.logs.find(x => x.phase === 'dns').code, 'NETWORK_ERROR')
  assert.equal(f.logs.find(x => x.phase === 'tcp').code, 'NETWORK_ERROR')
})

test('logging failure does not replace the normal database startup policy', async () => {
  const f = fixture()
  assert.equal((await runDatabaseNetworkDiagnostics(database, enabled, { ...f.dependencies, log: () => { throw new Error('fixture logging failure') } })).tcp.status, 'success')
})

test('server invokes optional diagnostics before unchanged normal connection/preflight and listen', async () => {
  const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  assert.match(source, /if \(process\.env\.DB_NETWORK_DIAGNOSTICS === 'true'\) await runDatabaseNetworkDiagnostics\(config.database\)/)
  assert.ok(source.indexOf('await runDatabaseNetworkDiagnostics') < source.indexOf('source = createCatalogSource'))
  assert.ok(source.indexOf('await checkDatabaseConnection(source.pool)') < source.indexOf('.listen('))
  assert.ok(!source.includes('runtimeApproved = true'))
})

test('successful TCP waits for delayed close before logging or returning success', async () => {
  const f = fixture()
  let releaseDestroy
  const destroyStarted = new Promise(resolve => { releaseDestroy = resolve })
  f.socket.destroy = () => { releaseDestroy() }
  let completed = false
  const pending = runDatabaseNetworkDiagnostics(database, enabled, f.dependencies).then(result => { completed = true; return result })
  await destroyStarted
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(completed, false)
  assert.equal(f.logs.filter(x => x.phase === 'tcp').length, 0)
  f.socket.emit('connect') // duplicate success must not trigger another destroy.
  f.socket.emit('close')
  const result = await pending
  assert.equal(result.tcp.status, 'success'); assert.equal(result.tcp.closeStatus, 'confirmed')
  assert.equal(f.socket.eventNames().length, 0)
  assert.equal(f.logs.filter(x => x.phase === 'tcp').length, 1)
})

test('destroy exception never reports success and close waiting remains bounded', async () => {
  const f = fixture()
  let unrefs = 0
  f.socket.destroy = () => { throw new Error('PRIVATE_PASSWORD') }
  f.socket.unref = () => { unrefs++ }
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.tcp.status, 'error'); assert.equal(result.tcp.code, 'TCP_DESTROY_FAILED')
  assert.equal(result.tcp.closeStatus, 'unconfirmed'); assert.equal(unrefs, 1)
  assert.equal(result.tcp.operationStatus, 'success')
  f.socket.emit('error', { code: 'ECONNRESET' }); f.socket.emit('close')
  assert.equal(f.socket.eventNames().length, 0)
  assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE_PASSWORD/)
})

test('synchronous close followed by destroy exception is still an error', async () => {
  const f = fixture()
  f.socket.destroy = () => { f.socket.emit('close'); throw new Error('PRIVATE_PASSWORD') }
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.tcp.status, 'error'); assert.equal(result.tcp.code, 'TCP_DESTROY_FAILED')
  assert.equal(result.tcp.closeStatus, 'confirmed'); assert.equal(f.socket.eventNames().length, 0)
})

test('duplicate errors and close events produce one result and no leftover listeners', async () => {
  const f = fixture()
  f.socket.destroy = () => queueMicrotask(() => {
    f.socket.emit('error', { code: 'ECONNRESET', message: 'PRIVATE_PASSWORD' })
    f.socket.emit('error', { code: 'ECONNRESET' })
    f.socket.emit('close'); f.socket.emit('close')
  })
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.tcp.status, 'error'); assert.equal(result.tcp.code, 'ECONNRESET')
  assert.equal(result.tcp.closeStatus, 'confirmed')
  assert.equal(f.logs.filter(x => x.phase === 'tcp').length, 1)
  assert.equal(f.socket.eventNames().length, 0)
})

test('DNS success after its timeout cannot change the finalized result or logs', async () => {
  let finishDns
  const f = fixture({ lookup: () => new Promise(resolve => { finishDns = resolve }) })
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.dns.status, 'timeout')
  const before = JSON.stringify({ result, logs: f.logs })
  finishDns([{ address: '192.0.2.99', family: 4 }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(JSON.stringify({ result, logs: f.logs }), before)
})

test('socket timeout event waits for close and keeps the timeout outcome', async () => {
  const f = fixture({ tcp: 'timeout' })
  let releaseDestroy
  const destroyStarted = new Promise(resolve => { releaseDestroy = resolve })
  f.socket.connect = () => queueMicrotask(() => { f.socket.emit('timeout'); f.socket.emit('timeout') })
  f.socket.destroy = () => { releaseDestroy() }
  let completed = false
  const pending = runDatabaseNetworkDiagnostics(database, enabled, f.dependencies).then(result => { completed = true; return result })
  await destroyStarted
  assert.equal(completed, false)
  f.socket.emit('error', { code: 'ECONNRESET' }); f.socket.emit('close')
  const result = await pending
  assert.equal(result.tcp.status, 'timeout'); assert.equal(result.tcp.code, 'ETIMEDOUT')
  assert.equal(result.tcp.closeStatus, 'confirmed'); assert.equal(f.socket.eventNames().length, 0)
})

test('socket without close reports a bounded close failure instead of success', async () => {
  const f = fixture()
  let unrefs = 0
  f.socket.destroy = () => {}
  f.socket.unref = () => { unrefs++ }
  const result = await runDatabaseNetworkDiagnostics(database, enabled, f.dependencies)
  assert.equal(result.tcp.status, 'error'); assert.equal(result.tcp.code, 'TCP_CLOSE_TIMEOUT')
  assert.equal(result.tcp.operationStatus, 'success'); assert.equal(result.tcp.closeStatus, 'unconfirmed')
  assert.equal(unrefs, 1)
  assert.deepEqual(f.socket.eventNames().sort(), ['close', 'error'])
  const before = JSON.stringify({ result, logs: f.logs })
  f.socket.emit('error', { code: 'ECONNRESET' }); f.socket.emit('error', { code: 'ECONNRESET' })
  f.socket.emit('close'); f.socket.emit('close')
  assert.equal(f.socket.eventNames().length, 0)
  assert.equal(JSON.stringify({ result, logs: f.logs }), before)
})

test('socket constructor exception is safe and does not wait for an impossible close', async () => {
  const f = fixture()
  const result = await runDatabaseNetworkDiagnostics(database, enabled, { ...f.dependencies, createSocket: () => { throw { code: 'EACCES', message: 'PRIVATE_PASSWORD' } } })
  assert.equal(result.tcp.status, 'error'); assert.equal(result.tcp.code, 'EACCES')
  assert.equal(result.tcp.closeStatus, 'not-created')
  assert.equal(f.logs.filter(x => x.phase === 'tcp').length, 1)
  assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE_PASSWORD/)
})
