const keys = ['VITE_AUTH_API_URL', 'VITE_OTAKUZONE_API_URL', 'VITE_ANIME_API_URL']

// Shared by Vite's build validation and the browser. Never include values in errors.
export function validateProductionApi(environment) {
  const urls = keys.map((key) => {
    try {
      const url = new URL(environment[key])
      const host = url.hostname.toLowerCase()
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
          url.pathname.replace(/\/$/, '') !== '/api/v1' ||
          host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' ||
          host === '0.0.0.0' || host.startsWith('127.') || host.endsWith('.local')) throw new Error()
      return url.href.replace(/\/$/, '')
    } catch { throw new Error(`Configuración de producción inválida: ${key} requiere una API HTTPS pública con ruta /api/v1.`) }
  })
  if (new Set(urls).size !== 1) throw new Error('Las tres variables VITE de API deben apuntar a la misma API en producción.')
}

export function resolveApiUrls(environment = {}) {
  if (environment.PROD && environment.MODE !== 'local-preview') validateProductionApi(environment)
  return {
    auth: (environment.VITE_AUTH_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, ''),
    store: (environment.VITE_OTAKUZONE_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, ''),
    anime: (environment.VITE_ANIME_API_URL || environment.VITE_AUTH_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, ''),
  }
}
