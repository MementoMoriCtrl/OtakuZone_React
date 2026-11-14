import { sanitizeFavorites } from '../domain/favorites.js'

export const FAVORITES_KEY = 'otakuzone.favorites.v1'
export const PROFILE_KEY = 'otakuzone.profile.v1'
const emptyProfile = { name: '', email: '', bio: '' }

function read(key, fallback, parse, storage) {
  try {
    const adapter = storage ?? globalThis.localStorage
    const raw = adapter.getItem(key)
    if (!raw) return { data: fallback, error: '' }
    const body = JSON.parse(raw)
    if (body?.version !== 1) throw new Error('Versión no reconocida')
    return { data: parse(body), error: '' }
  } catch { return { data: fallback, error: 'No se pudieron leer los datos locales. Se usará esta sesión; puedes volver a guardarlos.' } }
}
function write(key, value, storage) {
  try { (storage ?? globalThis.localStorage).setItem(key, JSON.stringify({ version: 1, ...value })); return '' }
  catch { return 'No se pudo guardar en este navegador. Los cambios siguen disponibles en esta sesión, pero pueden perderse al recargar.' }
}

export const readFavorites = (storage) => read(FAVORITES_KEY, [], (body) => sanitizeFavorites(body.items), storage)
export const saveFavorites = (items, storage) => write(FAVORITES_KEY, { items: sanitizeFavorites(items) }, storage)
export function profileSnapshot(profile) {
  if (!profile || typeof profile.name !== 'string' || typeof profile.email !== 'string' || typeof profile.bio !== 'string') throw new Error('Perfil local inválido')
  // Lista permitida explícita: nunca persistir contraseñas u otros campos.
  return { name: profile.name.trim().slice(0, 60), email: profile.email.trim().slice(0, 254), bio: profile.bio.trim().slice(0, 300) }
}
export const readProfile = (storage) => read(PROFILE_KEY, emptyProfile, (body) => profileSnapshot(body.profile), storage)
export const saveProfile = (profile, storage) => write(PROFILE_KEY, { profile: profileSnapshot(profile) }, storage)
