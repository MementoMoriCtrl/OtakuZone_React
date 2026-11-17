import mysql from 'mysql2/promise'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { databaseTlsOptions } from '../src/db/pool.js'
import { inspectDatabaseEngine } from '../src/db/engine.js'
import { auditEmailData } from '../src/db/emailAudit.js'

// Existing LOCAL credentials only. No command-line credential arguments, writes,
// password hashes, personal identifiers or raw email values in output.
loadEnvironment()
let connection
try {
  const config = loadDatabaseConfig()
  if (config.engine !== 'mysql' || !['127.0.0.1', 'localhost', '::1'].includes(config.host)) throw new Error('Solo se permite el MySQL local previsto.')
  connection = await mysql.createConnection({
    host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password, connectTimeout: config.connectTimeout,
    multipleStatements: false, ...databaseTlsOptions(config),
  })
  const server = await inspectDatabaseEngine(connection)
  if (server.identity.engine !== 'mysql') throw new Error('Motor local inesperado.')
  const [[session]] = await connection.execute('SELECT @@transaction_isolation AS isolationLevel')
  if (session.isolationLevel !== 'REPEATABLE-READ') throw new Error('Se requiere REPEATABLE-READ para un snapshot consistente; no se cambia la sesión.')
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
  const audit = await auditEmailData(connection)
  await connection.rollback()
  console.log(JSON.stringify({ audit: 'mysql-local-read-only', completed: true, version: server.identity.version, ...audit }))
} catch (error) {
  // Even configuration/driver errors must not reflect private values or SQL.
  console.error(JSON.stringify({ audit: 'mysql-local-read-only', completed: false, code: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'READ_ONLY_AUDIT_FAILED' }))
  process.exitCode = 1
} finally {
  if (connection) { try { await connection.rollback() } catch { /* No data changes to recover. */ } await connection.end() }
}
