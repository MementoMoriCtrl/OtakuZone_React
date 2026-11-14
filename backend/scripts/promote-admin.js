import { z } from 'zod'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { withTransaction } from '../src/db/transaction.js'

// Herramienta del operador con acceso a MySQL, nunca una ruta pública.
loadEnvironment()
let pool
try {
  const email = z.string().email().max(254).parse(process.argv[2]).trim().toLowerCase()
  pool = createDatabasePool(loadDatabaseConfig())
  await withTransaction(pool, async (connection) => {
    const [rows] = await connection.execute("SELECT id FROM usuarios WHERE email = ? AND estado = 'activo' AND password_hash IS NOT NULL FOR UPDATE", [email])
    if (rows.length !== 1) throw new Error('Debe existir una cuenta registrada y activa.')
    await connection.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE id = ?', ['administrador', rows[0].id])
  })
  console.log('Rol ADMIN asignado por el operador. La próxima comprobación de sesión reflejará el permiso.')
} catch (error) { console.error('No se pudo asignar el rol:', error.code ?? (error.name === 'ZodError' ? 'Indica un correo válido como argumento.' : error.message)); process.exitCode = 1 }
finally { if (pool) await pool.end() }
