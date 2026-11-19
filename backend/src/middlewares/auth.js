import { parseCookie } from 'cookie'
import HttpError from '../utils/HttpError.js'

export const cookieOptions = (config) => ({ httpOnly: true, secure: config.secure, sameSite: config.sameSite ?? 'lax', path: '/' })
export function readSessionCookie(request, config) {
  try { return parseCookie(request.headers.cookie || '')[config.cookieName] ?? null } catch { return null }
}
export const clearSessionCookie = (response, config) => response.clearCookie(config.cookieName, cookieOptions(config))

export const authenticate = (service, config) => async (request, _response, next) => {
  const token = readSessionCookie(request, config)
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
  request.auth = await service.authenticate(token)
  next()
}
export const authorize = (...roles) => (request, _response, next) => {
  if (!request.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
  if (!roles.includes(request.auth.user.role)) throw new HttpError(403, 'FORBIDDEN', 'No tienes permisos para acceder a este recurso.')
  next()
}
export const browserMutation = (origins) => (request, _response, next) => {
  if (!origins.includes(request.get('Origin'))) throw new HttpError(403, 'CSRF_ORIGIN_REJECTED', 'La solicitud no pudo verificarse.')
  if (!request.is('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Se requiere una solicitud JSON.')
  if (!request.get('X-OtakuZone-CSRF')) throw new HttpError(403, 'CSRF_REJECTED', 'La solicitud no pudo verificarse.')
  next()
}
export const sessionCsrf = (service) => (request, _response, next) => { service.checkCsrf(request.auth.sessionId, request.get('X-OtakuZone-CSRF')); next() }
export function publicAuthMutation(request, _response, next) {
  if (request.get('X-OtakuZone-CSRF') !== '1') throw new HttpError(403, 'CSRF_REJECTED', 'La solicitud no pudo verificarse.')
  next()
}
