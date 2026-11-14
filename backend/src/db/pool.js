import mysql from 'mysql2/promise'
import HttpError from '../utils/HttpError.js'

export function createDatabasePool(config) {
  return mysql.createPool({
    host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password,
    connectionLimit: config.connectionLimit, connectTimeout: config.connectTimeout,
    waitForConnections: true, queueLimit: 20,
    enableKeepAlive: true, charset: 'utf8mb4', timezone: 'Z',
    decimalNumbers: false, supportBigNumbers: true, bigNumberStrings: true,
    multipleStatements: false,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  })
}

export function assertMysqlVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match || /mariadb/i.test(version) || Number(match[1]) < 8 || Number(match[1]) === 8 && Number(match[2]) === 0 && Number(match[3]) < 16) throw new Error('Se requiere MySQL 8.0.16 o posterior con CHECK aplicado; no MariaDB.')
}
export async function checkDatabaseConnection(pool) {
  const [rows] = await pool.execute('SELECT VERSION() AS version, DATABASE() AS databaseName, 1 AS ready')
  assertMysqlVersion(rows[0].version)
  return rows[0]
}

const unavailable = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'POOL_CLOSED'])
export async function executeRows(executor, sql, parameters = []) {
  try { return (await executor.execute(sql, parameters))[0] }
  catch (error) {
    if (unavailable.has(error.code)) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'La fuente de datos no está disponible. Inténtalo más tarde.')
    throw error
  }
}
