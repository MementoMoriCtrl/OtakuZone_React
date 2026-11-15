import { ApiError, requireList } from './http.js'

// Una sola adaptación de UI: Express usa un sobre JSON; JSON Server devuelve
// arrays. El servidor se elige por URL, sin fallback ni peticiones duplicadas.
export function readStoreCollection(body) {
  if (Array.isArray(body)) return body
  if (body?.success !== true) throw new ApiError('No se pudo cargar la información de la tienda. Inténtalo de nuevo.')
  return requireList(body.data)
}
