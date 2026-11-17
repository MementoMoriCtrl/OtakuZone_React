import { resolveApiUrls } from '../config/api.js'
export const AUTH_API_URL = resolveApiUrls(import.meta.env).auth
let csrfToken = null
let sessionPending = null
let revision = 0

export async function accountRequest(path, { method = 'GET', data, privateRequest = false, signal } = {}) {
  let response
  try {
    response = await fetch(`${AUTH_API_URL}${path}`, {
      method, credentials: 'include', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': privateRequest ? csrfToken ?? '' : '1' } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })
  } catch (error) { if (signal?.aborted) throw error; throw new Error('No se pudo conectar con OtakuZone. Comprueba tu conexión e inténtalo de nuevo.') }
  let body
  try { body = await response.json() } catch { throw new Error('El servicio de cuenta devolvió una respuesta inesperada.') }
  if (!response.ok || body?.success !== true) {
    if (response.status === 401 && privateRequest) { csrfToken = null; window.dispatchEvent(new Event('otakuzone:session-expired')) }
    throw new Error(typeof body?.error?.message === 'string' ? body.error.message : 'No se pudo completar la solicitud.')
  }
  return body.data
}
const request = accountRequest

export function loadSession() {
  if (!sessionPending) {
    const started = revision
    sessionPending = request('/auth/session').then((data) => {
      if (!data || !('user' in data)) throw new Error('No se pudo comprobar la sesión.')
      if (started === revision) csrfToken = data.csrfToken
      return data
    }).finally(() => { sessionPending = null })
  }
  return sessionPending
}
async function enter(path, data) {
  revision++
  const session = await request(path, { method: 'POST', data })
  csrfToken = session.csrfToken
  return session
}
export const registerAccount = (data) => enter('/auth/register', data)
export const loginAccount = (data) => enter('/auth/login', data)
export async function logoutAccount() {
  revision++
  await request('/auth/logout', { method: 'POST', data: {}, privateRequest: true })
  csrfToken = null
}
export const updateAccount = (data) => request('/auth/me', { method: 'PATCH', data, privateRequest: true })
export const getAdminOverview = () => request('/admin/overview', { privateRequest: true })
