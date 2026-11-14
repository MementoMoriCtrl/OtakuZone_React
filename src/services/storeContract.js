import { ApiError, requireList } from './http.js'

// Una sola adaptación de UI: Express usa un sobre JSON; JSON Server devuelve
// arrays. El servidor se elige por URL, sin fallback ni peticiones duplicadas.
export function readStoreCollection(body) {
  if (Array.isArray(body)) return body
  if (body?.success !== true) throw new ApiError('La API de OtakuZone devolvió una respuesta inesperada.')
  return requireList(body.data)
}
