import { z } from 'zod'

export function loadAuthConfig(environment = process.env) {
  const parsed = z.object({
    JWT_SECRET: z.string().min(64),
    JWT_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(1800),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    AUTH_RATE_MAX: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_RATE_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(900000),
  }).safeParse(environment)
  if (!parsed.success) throw new Error(`Configuración de autenticación inválida: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}`)
  const value = parsed.data
  return Object.freeze({ secret: value.JWT_SECRET, ttl: value.JWT_TTL_SECONDS, rounds: value.BCRYPT_ROUNDS, rateMax: value.AUTH_RATE_MAX, rateWindowMs: value.AUTH_RATE_WINDOW_MS, issuer: 'otakuzone-api', audience: 'otakuzone-web', secure: environment.NODE_ENV === 'production', cookieName: environment.NODE_ENV === 'production' ? '__Host-otakuzone_session' : 'otakuzone_session' })
}
