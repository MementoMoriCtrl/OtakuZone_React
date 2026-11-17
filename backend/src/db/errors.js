import HttpError from '../utils/HttpError.js'

const disconnected = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'POOL_CLOSED'])
export const isConnectionFailure = error => disconnected.has(error?.code) || error?.fatal === true
export function databaseHttpError(error) {
  if (error instanceof HttpError) return error
  if (isConnectionFailure(error) || ['ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_CON_COUNT_ERROR', 'ER_TOO_MANY_USER_CONNECTIONS'].includes(error?.code)) {
    return new HttpError(503, 'DATABASE_UNAVAILABLE', 'La fuente de datos no está disponible. Inténtalo más tarde.')
  }
  return error
}
