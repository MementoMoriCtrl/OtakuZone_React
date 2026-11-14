import { z } from 'zod'

const schema = z.object({
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/).default('otakuzone_db'),
  DB_USER: z.string().min(1).max(32),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  DB_SSL: z.enum(['true', 'false']).default('false'),
})

export function loadDatabaseConfig(environment = process.env) {
  const parsed = schema.safeParse(environment)
  if (!parsed.success) throw new Error(`Configuración MySQL incompleta o inválida: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}`)
  const value = parsed.data
  return Object.freeze({ host: value.DB_HOST, port: value.DB_PORT, database: value.DB_NAME, user: value.DB_USER, password: value.DB_PASSWORD, connectionLimit: value.DB_POOL_SIZE, connectTimeout: value.DB_CONNECT_TIMEOUT_MS, ssl: value.DB_SSL === 'true' })
}
