import mysql from 'mysql2/promise'
import { inspectDatabaseEngine, identifyDatabaseEngine, assertEngineVersion } from './engine.js'
import { preflightTidb } from './tidbPreflight.js'
import { installConnectionLifetime } from './connectionLifecycle.js'
import { databaseHttpError } from './errors.js'
import { installTidbSessionGuard } from './tidbSession.js'

const poolEngines = new WeakMap()
export const databasePoolEngine = pool => poolEngines.get(pool) ?? 'mysql'

export function databasePoolOptions(config) {
  return {
    host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password,
    connectionLimit: config.connectionLimit, connectTimeout: config.connectTimeout,
    waitForConnections: true, queueLimit: 20,
    enableKeepAlive: true, charset: 'utf8mb4', timezone: 'Z',
    decimalNumbers: false, supportBigNumbers: true, bigNumberStrings: true,
    multipleStatements: false,
    ...(config.engine === 'tidb' ? { maxIdle: Math.max(0, config.connectionLimit - 1), idleTimeout: config.idleTimeout ?? 60000 } : {}),
    ...databaseTlsOptions(config),
  }
}

export function createDatabasePool(config) {
  const pool = mysql.createPool(databasePoolOptions(config))
  poolEngines.set(pool, config.engine ?? 'mysql')
  if (config.engine === 'tidb') {
    installTidbSessionGuard(pool)
    const dispose = installConnectionLifetime(pool, { maxLifetimeMs: config.maxLifetime ?? 300000 })
    const end = pool.end.bind(pool)
    pool.end = async () => { dispose(); return end() }
  }
  return pool
}

export function databaseTlsOptions(config) {
  return config.ssl ? { ssl: { rejectUnauthorized: true, ...(config.sslCa ? { ca: config.sslCa } : {}) } } : {}
}

export function assertMysqlVersion(version) {
  const identity = identifyDatabaseEngine({ version, versionComment: 'MySQL Community Server' })
  if (identity.engine !== 'mysql') throw new Error('Se requiere MySQL; TiDB tiene identificación y preflight separados.')
  assertEngineVersion(identity)
}
export async function checkDatabaseConnection(pool, { expectedEngine = poolEngines.get(pool) ?? 'mysql', phase = 'runtime' } = {}) {
  // Pin all observations to the same physical session.
  const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool
  try {
    const result = await inspectDatabaseEngine(connection)
    if (result.identity.engine !== expectedEngine) throw new Error('El motor detectado no coincide con DB_ENGINE; no se permite fallback de dialecto.')
    if (expectedEngine === 'tidb') result.preflight = await preflightTidb(connection, result.databaseName, { phase })
    return result
  } finally { if (connection !== pool) connection.release() }
}

export async function executeRows(executor, sql, parameters = []) {
  try { return (await executor.execute(sql, parameters))[0] }
  catch (error) { throw databaseHttpError(error) }
}
