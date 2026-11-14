import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema } from '../src/db/schemaCheck.js'

loadEnvironment()
let pool
try {
  pool = createDatabasePool(loadDatabaseConfig())
  const result = await checkDatabaseSchema(pool)
  console.log('Conexión y esquema MySQL reales:', JSON.stringify(result))
} catch (error) { console.error('Comprobación MySQL fallida:', error.code ?? error.message); process.exitCode = 1 }
finally { if (pool) await pool.end() }
