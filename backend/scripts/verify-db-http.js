import { assertTestIsolation } from './test-isolation.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { withTransaction } from '../src/db/transaction.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createProductMaintenanceService } from '../src/services/productMaintenanceService.js'

loadEnvironment()
await assertTestIsolation(loadDatabaseConfig())
const base = (process.env.API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '')
const id = `http-verify-${randomUUID()}`
let pool
try {
  if (process.env.NODE_ENV === 'production') throw new Error('La verificación con escrituras temporales no se ejecuta en producción.')
  pool = createDatabasePool(loadDatabaseConfig())
  const service = createProductMaintenanceService(createMysqlCatalogRepository(pool))
  await service.createWithInventory({ product: { id, categoryId: 'mangas', name: 'Prueba temporal SQL a HTTP', description: 'Registro técnico eliminado al finalizar.', price: 21.25, imageKey: 'manga', imageAlt: 'Verificación SQL' }, initialQuantity: 1 })
  const first = await fetch(`${base}/products/${id}`, { signal: AbortSignal.timeout(10000) })
  assert.equal(first.status, 200, 'Express debe leer la fila recién insertada en MySQL, no el fixture')
  assert.equal((await first.json()).data.price, 21.25)
  await pool.execute('UPDATE productos SET precio = ? WHERE id = ?', ['22.50', id])
  const updated = await fetch(`${base}/products/${id}`, { signal: AbortSignal.timeout(10000) })
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).data.price, 22.5)
  console.log('PASS: Express leyó la inserción y la actualización reales de MySQL; no procede del JSON de demostración')
} catch (error) { console.error('Comprobación SQL–HTTP fallida:', error.code ?? error.message); process.exitCode = 1 }
finally {
  if (pool) {
    try {
      await withTransaction(pool, async (connection) => {
        await connection.execute('DELETE FROM inventario WHERE producto_id = ?', [id])
        await connection.execute('DELETE FROM productos WHERE id = ?', [id])
      })
      const deleted = await fetch(`${base}/products/${id}`, { signal: AbortSignal.timeout(10000) })
      assert.equal(deleted.status, 404)
      console.log('PASS: eliminación técnica confirmada en MySQL y respuesta HTTP 404 posterior')
    } catch (error) { console.error('Limpieza/verificación SQL–HTTP fallida:', error.code ?? error.message); process.exitCode = 1 }
    finally { await pool.end() }
  }
}
