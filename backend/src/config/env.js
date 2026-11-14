import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { z } from 'zod'
import { loadDatabaseConfig } from './database.js'
import { loadAuthConfig } from './auth.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const developmentOrigins = 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173'
const origin = z.string().url().refine((value) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === value
  } catch { return false }
})
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().transform((value) => value.split(',').map((item) => item.trim())).pipe(z.array(origin).min(1)),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(120),
  DEMO_DATA_PATH: z.string().trim().min(1).default('../mock/db.json'),
  CATALOG_SOURCE: z.enum(['demo', 'mysql']).default('demo'),
  AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
})

export function loadConfig(environment = process.env) {
  const parsed = schema.safeParse({ ...environment, CORS_ORIGINS: environment.CORS_ORIGINS ?? (environment.NODE_ENV === 'production' ? '' : developmentOrigins) })
  if (!parsed.success) throw new Error(`Configuración inválida: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}`)
  const value = parsed.data
  if (value.NODE_ENV === 'production' && value.CORS_ORIGINS.some((item) => !item.startsWith('https://'))) throw new Error('Configuración inválida: CORS_ORIGINS debe usar HTTPS en producción.')
  return Object.freeze({
    environment: value.NODE_ENV, host: value.HOST, port: value.PORT,
    origins: [...new Set(value.CORS_ORIGINS)],
    rateLimitWindowMs: value.RATE_LIMIT_WINDOW_MS, rateLimitMax: value.RATE_LIMIT_MAX,
    demoDataPath: resolve(backendRoot, value.DEMO_DATA_PATH),
    catalogSource: value.CATALOG_SOURCE,
    database: value.CATALOG_SOURCE === 'mysql' || value.AUTH_ENABLED === 'true' ? loadDatabaseConfig(environment) : null,
    auth: value.AUTH_ENABLED === 'true' ? loadAuthConfig(environment) : null,
  })
}
