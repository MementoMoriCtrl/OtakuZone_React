import { z } from 'zod'

export function loadAuthConfig(environment = process.env) {
  const parsed = z.object({
    JWT_SECRET: z.string().min(64),
    JWT_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(1800),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    AUTH_RATE_MAX: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_RATE_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(900000),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'none']).default('lax'),
  }).safeParse(environment)
  if (!parsed.success) throw new Error(`Configuración de autenticación inválida: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}`)
  const value = parsed.data
  if (value.AUTH_COOKIE_SAME_SITE === 'none') {
    const origins = String(environment.CORS_ORIGINS ?? '').split(',').map(v => v.trim())
    if (environment.NODE_ENV !== 'production' || origins.some(v => {
      try { const u = new URL(v); return u.protocol !== 'https:' || u.origin !== v || !!u.username || !!u.password }
      catch { return true }
    })) throw new Error('SameSite=None requiere producción, Secure y orígenes CORS HTTPS explícitos.')
  }
  return Object.freeze({ secret: value.JWT_SECRET, ttl: value.JWT_TTL_SECONDS, rounds: value.BCRYPT_ROUNDS, rateMax: value.AUTH_RATE_MAX, rateWindowMs: value.AUTH_RATE_WINDOW_MS, sameSite: value.AUTH_COOKIE_SAME_SITE, issuer: 'otakuzone-api', audience: 'otakuzone-web', secure: environment.NODE_ENV === 'production', cookieName: environment.NODE_ENV === 'production' ? '__Host-otakuzone_session' : 'otakuzone_session' })
}
