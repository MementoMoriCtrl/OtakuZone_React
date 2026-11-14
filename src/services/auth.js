export const AUTH_API_URL = (import.meta.env?.VITE_AUTH_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '')
let csrfToken = null
let sessionPending = null
let revision = 0

async function request(path, { method = 'GET', data, privateRequest = false } = {}) {
  let response
  try {
    response = await fetch(`${AUTH_API_URL}${path}`, {
      method, credentials: 'include', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': privateRequest ? csrfToken ?? '' : '1' } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })
  } catch { throw new Error('No se pudo conectar con tu cuenta. Comprueba tu conexión e inténtalo de nuevo.') }
  let body
  try { body = await response.json() } catch { throw new Error('El servicio de cuenta devolvió una respuesta inesperada.') }
  if (!response.ok || body?.success !== true) {
    if (response.status === 401 && privateRequest) { csrfToken = null; window.dispatchEvent(new Event('otakuzone:session-expired')) }
    throw new Error(typeof body?.error?.message === 'string' ? body.error.message : 'No se pudo completar la solicitud.')
  }
  return body.data
}

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
