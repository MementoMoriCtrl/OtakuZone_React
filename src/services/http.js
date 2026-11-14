export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Un inicio por segundo, compartido por todos los endpoints de Jikan.
export function createRateGate(interval = 1100) {
  let queue = Promise.resolve()
  let lastStart = 0
  return (signal) => {
    const next = queue.catch(() => {}).then(async () => {
      await wait(Math.max(0, lastStart + interval - Date.now()), signal)
      signal?.throwIfAborted()
      lastStart = Date.now()
    })
    queue = next
    return next
  }
}

export async function fetchJSON(url, { signal, gate, fetcher = fetch } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted()
    if (gate) await gate(signal)
    let response
    try {
      response = await fetcher(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]), headers: { Accept: 'application/json' } })
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (!attempt) { await wait(1000, signal); continue }
      throw new ApiError(error.name === 'TimeoutError' ? 'El servicio tardó demasiado. Inténtalo de nuevo.' : 'No se pudo conectar con el servicio. Comprueba tu conexión y que la API esté disponible.')
    }
    if (!response.ok) {
      if (!attempt && (response.status === 429 || response.status >= 500)) {
        const retry = response.headers.get('Retry-After')
        const seconds = Number(retry)
        const delay = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 2000
        // No ignorar un Retry-After largo: ofrecer reintento manual en ese caso.
        if (Number.isFinite(delay) && delay <= 10000) { await wait(Math.max(1000, delay), signal); continue }
      }
      throw new ApiError(response.status === 429 ? 'Límite de solicitudes alcanzado. Espera un momento antes de reintentar.' : `El servicio respondió con un error HTTP ${response.status}. Inténtalo de nuevo.`, response.status)
    }
    try { return await response.json() } catch { throw new ApiError('El servicio devolvió una respuesta JSON inválida.') }
  }
}

// Cada consumidor puede cancelar sin interrumpir a otros. La microtarea permite
// que StrictMode vuelva a suscribirse sin duplicar la solicitud de transporte.
export function createClient({ gate, ttl = 60000, fetcher } = {}) {
  const entries = new Map()
  return function get(url, { signal, transform = (data) => data } = {}) {
    signal?.throwIfAborted()
    let entry = entries.get(url)
    if (entry?.done && entry.expires <= Date.now()) { entries.delete(url); entry = null }
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, users: 0, done: false }
      entries.set(url, entry)
      const current = entry
      current.promise = fetchJSON(url, { signal: controller.signal, gate, fetcher }).then((data) => {
        const parsed = transform(data)
        current.done = true
        current.expires = Date.now() + ttl
        // Mantener acotada la caché incluso al recorrer muchas búsquedas.
        if (entries.size > 80) for (const [key, value] of entries) { if (value.done && key !== url) { entries.delete(key); break } }
        return parsed
      }).catch((error) => { if (entries.get(url) === current) entries.delete(url); throw error })
    }
    const current = entry
    current.users++
    return new Promise((resolve, reject) => {
      let finished = false
      const release = () => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', onAbort)
        current.users--
        queueMicrotask(() => {
          if (!current.users && !current.done) {
            if (entries.get(url) === current) entries.delete(url)
            current.controller.abort()
          }
        })
      }
      const onAbort = () => { release(); reject(signal.reason) }
      signal?.addEventListener('abort', onAbort, { once: true })
      current.promise.then((data) => { if (!finished) { release(); resolve(data) } }, (error) => { if (!finished) { release(); reject(error) } })
    })
  }
}

export function requireList(value) {
  if (!Array.isArray(value)) throw new ApiError('El servicio devolvió un formato de lista inesperado.')
  return value
}

export function safeImage(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null
}
