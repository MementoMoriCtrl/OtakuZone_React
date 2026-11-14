import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDatabaseConfig } from '../src/config/database.js'
import { loadConfig } from '../src/config/env.js'
import { withTransaction } from '../src/db/transaction.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createProductMaintenanceService } from '../src/services/productMaintenanceService.js'
import { assertMysqlVersion } from '../src/db/pool.js'

// Dobles solo para contratos unitarios. No prueban conexión a MySQL.
test('configuración MySQL exige credenciales y no las refleja en errores', () => {
  assert.throws(() => loadDatabaseConfig({}), /DB_USER/)
  assert.throws(() => loadDatabaseConfig({ DB_USER: 'unit-test', DB_PASSWORD: '' }), /DB_PASSWORD/)
  const config = loadConfig({ CATALOG_SOURCE: 'mysql', DB_USER: 'unit-test', DB_PASSWORD: 'unit-test-value' })
  assert.equal(config.catalogSource, 'mysql')
  assert.equal(config.database.database, 'otakuzone_db')
  assert.equal(loadConfig({}).catalogSource, 'demo')
  assert.throws(() => loadDatabaseConfig({ DB_NAME: 'invalid;sql', DB_USER: 'unit-test', DB_PASSWORD: 'unit-test-value' }), (error) => !error.message.includes('unit-test-value'))
  assert.throws(() => assertMysqlVersion('8.0.15'))
  assert.throws(() => assertMysqlVersion('10.11.0-MariaDB'))
  assert.doesNotThrow(() => assertMysqlVersion('8.0.45'))
})

function transactionDouble({ rollbackFails = false } = {}) {
  const events = []
  const connection = {
    query: async () => events.push('session'),
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => { events.push('rollback'); if (rollbackFails) throw new Error('rollback falló') },
    release: () => events.push('release'), destroy: () => events.push('destroy'),
  }
  return { pool: { getConnection: async () => connection }, events }
}
test('transacción confirma éxito y libera la conexión', async () => {
  const { pool, events } = transactionDouble()
  assert.equal(await withTransaction(pool, async () => 42), 42)
  assert.deepEqual(events, ['session', 'begin', 'commit', 'release'])
})
test('transacción revierte fallos y conserva el error original', async () => {
  const { pool, events } = transactionDouble()
  const failure = new Error('segunda operación falló')
  await assert.rejects(withTransaction(pool, async () => { throw failure }), (error) => error === failure)
  assert.deepEqual(events, ['session', 'begin', 'rollback', 'release'])
})
test('una conexión cuyo rollback falla se destruye, no vuelve al pool', async () => {
  const { pool, events } = transactionDouble({ rollbackFails: true })
  await assert.rejects(withTransaction(pool, async () => { throw new Error('falló') }))
  assert.deepEqual(events, ['session', 'begin', 'rollback', 'destroy'])
})
test('repositorio enlaza entradas a parámetros y adapta DECIMAL solo al DTO', async () => {
  const calls = []
  const executor = { execute: async (sql, parameters) => { calls.push({ sql, parameters }); return [[{ id: 'polo', price: '59.90' }]] } }
  const repository = createMysqlCatalogRepository(executor)
  const query = "' OR 1=1 --"
  assert.equal((await repository.findProducts({ q: query, categoryId: 'polos' }))[0].price, 59.9)
  assert.ok(!calls[0].sql.includes(query))
  assert.deepEqual(calls[0].parameters, ['polos', 'polos', query, query])
})
test('mantenimiento valida dinero/stock antes de solicitar una escritura', async () => {
  let writes = 0
  const service = createProductMaintenanceService({ createProductWithInventory: async (product) => { writes++; return product } })
  const product = { id: 'polo-unit', categoryId: 'polos', name: 'Polo', description: 'Demo', price: 10.25, imageKey: 'polo', imageAlt: 'Polo' }
  assert.throws(() => service.createWithInventory({ product, initialQuantity: -1 }))
  assert.throws(() => service.createWithInventory({ product: { ...product, price: 10.255 }, initialQuantity: 1 }))
  assert.equal(writes, 0)
  await service.createWithInventory({ product, initialQuantity: 1 })
  assert.equal(writes, 1)
})
