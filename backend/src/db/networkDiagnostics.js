import { lookup as dnsLookup } from 'node:dns/promises'
import { Socket } from 'node:net'
import { performance } from 'node:perf_hooks'

const safeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ENODATA', 'ECANCELED', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'EACCES', 'EADDRNOTAVAIL', 'EINVAL'])
const errorCode = error => safeCodes.has(error?.code) ? error.code : 'NETWORK_ERROR'

// One diagnostic batch per startup. No SQL, TLS changes, retries or HTTP entry.
// Results are advisory: normal database acquisition/preflight must still run.
export async function runDatabaseNetworkDiagnostics(database, environment = process.env, dependencies = {}) {
  if (environment.DB_NETWORK_DIAGNOSTICS !== 'true') return { enabled: false }
  const lookup = dependencies.lookup ?? dnsLookup
  const createSocket = dependencies.createSocket ?? (() => new Socket())
  const now = dependencies.now ?? (() => performance.now())
  const log = dependencies.log ?? (entry => console.log(JSON.stringify(entry)))
  const emit = entry => {
    // A logging failure cannot change the normal startup policy.
    try { log({ event: 'db_network_diagnostics', ...entry }) } catch { /* advisory only */ }
  }
  const duration = start => Math.max(0, Math.round(now() - start))
  const timeoutMs = Number(environment.DB_NETWORK_DIAGNOSTICS_TIMEOUT_MS ?? database?.connectTimeout ?? 5000)
  emit({ phase: 'start', status: 'started' })
  if (!database || typeof database.host !== 'string' || !database.host || !Number.isInteger(database.port) || database.port < 1 || database.port > 65535
    || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    emit({ phase: 'configuration', status: 'error', code: 'DIAGNOSTIC_CONFIG_INVALID' })
    return { enabled: true, status: 'configuration-error' }
  }

  const dnsStart = now()
  let dnsTimer, dns
  try {
    // lookup matches the OS resolver used by net/mysql2. It cannot be cancelled;
    // late resolution/rejection is consumed, never logged as a second result.
    const timeout = new Promise((_, reject) => { dnsTimer = setTimeout(() => reject({ code: 'ETIMEDOUT' }), timeoutMs) })
    const addresses = await Promise.race([Promise.resolve().then(() => lookup(database.host, { all: true })), timeout])
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(a => !a || ![4, 6].includes(a.family) || typeof a.address !== 'string' || !a.address)) {
      dns = { phase: 'dns', status: 'error', code: 'DNS_RESULT_INVALID', durationMs: duration(dnsStart) }
    } else dns = { phase: 'dns', status: 'success', addressCount: addresses.length, families: [...new Set(addresses.map(a => a.family))], durationMs: duration(dnsStart) }
  } catch (error) {
    dns = { phase: 'dns', status: error?.code === 'ETIMEDOUT' ? 'timeout' : 'error', code: errorCode(error), durationMs: duration(dnsStart) }
  } finally { clearTimeout(dnsTimer) }
  emit(dns)

  // Independent connection to the configured hostname: net performs its own DNS
  // lookup. A success here does not establish TLS or authenticate a SQL account.
  const tcpStart = now()
  const tcp = await new Promise(resolve => {
    const closeTimeoutMs = Math.min(timeoutMs, 1000)
    let socket, timer, closeTimer, outcome, settled = false, closing = false
    let destroying = false, closeObserved = false, lookupCompleted = false
    const cleanup = () => {
      clearTimeout(timer); clearTimeout(closeTimer)
      socket?.removeListener('connect', onConnect)
      socket?.removeListener('lookup', onLookup)
      socket?.removeListener('timeout', onTimeout)
      socket?.removeListener('error', onError)
      socket?.removeListener('close', onClose)
    }
    const settle = closeStatus => {
      if (settled) return
      settled = true
      cleanup()
      if (closeStatus === 'unconfirmed') {
        // The socket may still emit an error after a failed destroy/close wait.
        // Keep only necessary guards, with no logs or outcome mutations, until
        // its eventual close. The socket is unref'd by the close deadline.
        const consumeLateError = () => {}
        socket.on('error', consumeLateError)
        socket.once('close', () => socket.removeListener('error', consumeLateError))
      }
      resolve({ phase: 'tcp', ...outcome, lookupCompleted, closeStatus, durationMs: duration(tcpStart) })
    }
    const requestClose = (status, code) => {
      if (settled || closing) return
      outcome = { status, ...(code ? { code } : {}) }
      clearTimeout(timer)
      if (!socket) { settle('not-created'); return }
      closing = true
      closeTimer = setTimeout(() => {
        // A failed close is never reported as successful connectivity. Unref is
        // best-effort: an unconfirmed socket must not keep the process alive.
        try { socket.unref?.() } catch { /* no input/error details are logged */ }
        outcome = { status: 'error', code: outcome.code === 'TCP_DESTROY_FAILED' ? 'TCP_DESTROY_FAILED' : 'TCP_CLOSE_TIMEOUT', operationStatus: outcome.operationStatus ?? outcome.status, ...(outcome.operationCode ?? outcome.code ? { operationCode: outcome.operationCode ?? outcome.code } : {}) }
        settle('unconfirmed')
      }, closeTimeoutMs)
      destroying = true
      try { socket.destroy() }
      catch { outcome = { status: 'error', code: 'TCP_DESTROY_FAILED', operationStatus: status, ...(code ? { operationCode: code } : {}) } }
      finally { destroying = false }
      // A double (or implementation) can emit close synchronously from destroy.
      // Defer resolution until destroy has returned so a subsequent throw wins.
      if (closeObserved) settle('confirmed')
    }
    const onConnect = () => requestClose('success')
    const onLookup = error => { if (!closing && !error) lookupCompleted = true }
    const onTimeout = () => requestClose('timeout', 'ETIMEDOUT')
    const onError = error => {
      if (closing) {
        if (outcome.status === 'success') outcome = { status: 'error', code: errorCode(error) }
      } else requestClose(error?.code === 'ETIMEDOUT' ? 'timeout' : 'error', errorCode(error))
    }
    const onClose = () => {
      closeObserved = true
      if (!outcome) outcome = { status: 'error', code: 'TCP_CLOSED_BEFORE_CONNECT' }
      if (!destroying) settle('confirmed')
    }
    try {
      socket = createSocket()
      socket.on('connect', onConnect)
      socket.on('lookup', onLookup)
      socket.on('timeout', onTimeout)
      socket.on('error', onError)
      socket.on('close', onClose)
      timer = setTimeout(onTimeout, timeoutMs)
      socket.connect({ host: database.host, port: database.port })
    } catch (error) { requestClose('error', errorCode(error)) }
  })
  emit(tcp)
  emit({ phase: 'complete', status: dns.status === 'success' && tcp.status === 'success' ? 'success' : 'failed' })
  return { enabled: true, dns, tcp }
}
