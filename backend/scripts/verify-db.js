import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { verifyDatabase } from '../src/db/verifyDatabase.js'

loadEnvironment()
let pool
try {
  if (process.env.NODE_ENV === 'production') throw new Error('La prueba de escrituras temporales solo se ejecuta en desarrollo, no en producción.')
  pool = createDatabasePool(loadDatabaseConfig())
  await verifyDatabase(pool)
} catch (error) { console.error('Verificación MySQL no completada:', error.code ?? error.message); process.exitCode = 1 }
finally { if (pool) await pool.end() }
