import { z } from 'zod'
import { isIP } from 'node:net'

const schema = z.object({
  DB_ENGINE: z.enum(['mysql', 'tidb']).default('mysql'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/).default('otakuzone_db'),
  DB_USER: z.string().min(1).max(32),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_SSL_CA: z.string().optional(),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  DB_POOL_MAX_LIFETIME_MS: z.coerce.number().int().min(1000).max(300000).default(300000),
})

export function loadDatabaseConfig(environment = process.env, { context = 'runtime' } = {}) {
  if (!['runtime', 'migration'].includes(context)) throw new Error('Contexto de configuración de base de datos no admitido.')
  const parsed = schema.safeParse(environment)
  if (!parsed.success) throw new Error(`Configuración MySQL incompleta o inválida: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}`)
  const value = parsed.data
  const rootSuffix = value.DB_USER.split('.').at(-1).toLowerCase() === 'root'
  if (context === 'migration' && value.DB_ENGINE !== 'tidb' && value.DB_USER.includes('.') && rootSuffix) throw new Error('La excepción de usuario .root del migrador requiere DB_ENGINE=tidb.')
  if (value.DB_ENGINE === 'tidb') {
    if (value.DB_SSL !== 'true' || isIP(value.DB_HOST) || !environment.DB_HOST || !/^[a-zA-Z0-9.-]+$/.test(value.DB_HOST) || value.DB_HOST === 'localhost') throw new Error('Configuración TiDB inválida: DB_SSL=true y hostname explícito son obligatorios.')
    if (value.DB_POOL_SIZE < 2 || value.DB_POOL_SIZE > 5) throw new Error('Configuración TiDB inválida: DB_POOL_SIZE debe estar entre 2 y 5.')
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.DB_USER)) throw new Error('Configuración TiDB inválida: usuario con prefijo de instancia y máximo 32 caracteres completos.')
    if (context === 'runtime' && rootSuffix) throw new Error('Configuración TiDB inválida: usuario runtime sin root.')
  }
  if (environment.NODE_ENV === 'production' && (value.DB_SSL !== 'true' || !environment.DB_HOST)) throw new Error('Configuración MySQL de producción inválida: DB_HOST explícito y DB_SSL=true son obligatorios.')
  if (value.DB_SSL_CA && value.DB_SSL !== 'true') throw new Error('DB_SSL_CA requiere DB_SSL=true.')
  return Object.freeze({ engine: value.DB_ENGINE, host: value.DB_HOST, port: value.DB_PORT, database: value.DB_NAME, user: value.DB_USER, password: value.DB_PASSWORD, connectionLimit: value.DB_POOL_SIZE, connectTimeout: value.DB_CONNECT_TIMEOUT_MS, ssl: value.DB_SSL === 'true', sslCa: value.DB_SSL_CA?.replace(/\\n/g, '\n') || undefined, idleTimeout: value.DB_POOL_IDLE_TIMEOUT_MS, maxLifetime: value.DB_POOL_MAX_LIFETIME_MS })
}
