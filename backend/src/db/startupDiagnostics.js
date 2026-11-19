import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

const context = new AsyncLocalStorage()
const operations = Object.freeze({
  'mysql2-acquire': 'connection', 'tidb-session': 'session',
  'engine-identification': 'metadata', preflight: 'integrity',
  'auth-sessions-check': 'schema-check', 'order-history-check': 'schema-check',
  'inventory-movements-check': 'schema-check', 'order-columns-check': 'schema-check',
})
const codes = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'HANDSHAKE_SSL_ERROR', 'HANDSHAKE_NO_SSL_SUPPORT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_CON_COUNT_ERROR', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT'])
const syscalls = new Set(['connect', 'read', 'write', 'getaddrinfo'])

export function withStartupDiagnostics(action, { emit = record => console.info(JSON.stringify(record)), now = () => performance.now() } = {}) {
  return context.run({ emit, now }, action)
}

export async function startupStage(stage, action) {
  const scope = context.getStore()
  if (!scope || !Object.hasOwn(operations, stage)) return action()
  const started = scope.now()
  const check = operations[stage] === 'schema-check' ? stage : scope.check
  const report = (status, error) => {
    const record = { event: 'db_startup', stage, operation: operations[stage], status, durationMs: Math.max(0, Math.round(scope.now() - started)) }
    if (check) record.check = check
    if (codes.has(error?.code)) record.code = error.code
    if (Number.isSafeInteger(error?.errno)) record.errno = error.errno
    if (syscalls.has(error?.syscall)) record.syscall = error.syscall
    // Logging must never replace the original outcome or serialize error/cause objects.
    try { scope.emit(record) } catch { /* Diagnostic sink failure is nonfunctional. */ }
  }
  report('start')
  try {
    const result = await (operations[stage] === 'schema-check' ? context.run({ ...scope, check }, action) : action())
    report('success')
    return result
  } catch (error) {
    report('failure', error)
    throw error
  }
}
