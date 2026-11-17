import HttpError from '../utils/HttpError.js'
import { failure } from '../utils/responses.js'
import { databaseHttpError } from '../db/errors.js'

export function notFound(_request, _response, next) {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', 'La ruta solicitada no existe.'))
}
export function methodNotAllowed(_request, response, next) {
  response.set('Allow', 'GET, HEAD, OPTIONS')
  next(new HttpError(405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite consultas.'))
}
export function errorHandler(error, _request, response, next) {
  error = databaseHttpError(error)
  if (response.headersSent) return next(error)
  if (error instanceof HttpError) return failure(response, error.status, error.code, error.message, error.details)
  if (error.type === 'entity.parse.failed') return failure(response, 400, 'INVALID_JSON', 'El cuerpo de la solicitud no contiene JSON válido.')
  if (error.type === 'entity.too.large') return failure(response, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud supera el límite permitido.')
  if (error instanceof URIError) return failure(response, 400, 'INVALID_PATH', 'La ruta contiene una codificación inválida.')
  // El detalle queda solo en el servidor; no se devuelve ni siquiera en desarrollo.
  console.error('[otakuzone-api] Error interno:', error.code ?? error.name ?? 'ERROR')
  return failure(response, 500, 'INTERNAL_ERROR', 'No se pudo completar la solicitud.')
}
