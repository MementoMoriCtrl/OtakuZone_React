import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { checkDatabaseSchema } from './schemaCheck.js'
import { withTransaction } from './transaction.js'
import { createMysqlCatalogRepository } from '../repositories/mysqlCatalogRepository.js'
import { createProductMaintenanceService } from '../services/productMaintenanceService.js'

export async function verifyDatabase(pool, log = console.log) {
  const schema = await checkDatabaseSchema(pool)
  log(`MySQL real: ${JSON.stringify(schema)}`)
  const repository = createMysqlCatalogRepository(pool)
  const service = createProductMaintenanceService(repository)
  const token = randomUUID()
  const id = `verify-${token}`
  const rollbackId = `${id}-rollback`
  const email = `${token}@example.test`
  const product = { id, categoryId: 'mangas', name: 'Producto temporal de verificación', description: 'Registro técnico de prueba, eliminado al finalizar.', price: 10.25, imageKey: 'manga', imageAlt: 'Prueba de integridad' }
  const rejected = (promise, ...codes) => assert.rejects(promise, (error) => codes.includes(error.code))
  try {
    assert.ok((await repository.findProducts()).length >= 12)
    assert.equal((await repository.findCategories()).length, 5)
    assert.equal((await repository.findPromotions()).length, 2)
    assert.deepEqual(await repository.findProducts({ q: "' OR 1=1 --" }), [])
    assert.equal(await repository.findProductById("'; DROP TABLE productos; --"), null)
    log('PASS consultas parametrizadas, catálogo y entradas literales de prueba')

    await service.createWithInventory({ product, initialQuantity: 3 })
    assert.equal((await repository.findProductById(id)).price, 10.25)
    await pool.execute('UPDATE inventario SET cantidad_reservada = ? WHERE producto_id = ?', [1, id])
    const [stock] = await pool.execute('SELECT cantidad_total, cantidad_reservada, cantidad_disponible FROM inventario WHERE producto_id = ?', [id])
    assert.equal(Number(stock[0].cantidad_disponible), 2)
    await rejected(pool.execute('UPDATE productos SET precio = ? WHERE id = ?', ['-1.00', id]), 'ER_CHECK_CONSTRAINT_VIOLATED')
    await rejected(pool.execute('UPDATE productos SET categoria_id = ? WHERE id = ?', [rollbackId, id]), 'ER_NO_REFERENCED_ROW_2')
    await rejected(pool.execute('UPDATE inventario SET cantidad_reservada = ? WHERE producto_id = ?', [4, id]), 'ER_CHECK_CONSTRAINT_VIOLATED')
    await rejected(pool.execute('DELETE FROM productos WHERE id = ?', [id]), 'ER_ROW_IS_REFERENCED_2')
    // Se omite deliberadamente el validador del servicio para comprobar que un
    // fallo de la SEGUNDA inserción revierte también la primera en MySQL real.
    await rejected(repository.createProductWithInventory({ ...product, id: rollbackId }, -1), 'ER_CHECK_CONSTRAINT_VIOLATED')
    assert.equal(await repository.findProductById(rollbackId), null)
    log('PASS commit de producto+inventario, actualización, CHECK, RESTRICT y rollback multitabla')

    const expectedRollback = new Error('ROLLBACK_PLANIFICADO_DE_VERIFICACION')
    try {
      await withTransaction(pool, async (connection) => {
        const [roles] = await connection.execute('SELECT id FROM roles WHERE codigo = ?', ['cliente'])
        assert.equal(roles.length, 1)
        const [insert] = await connection.execute('INSERT INTO usuarios (rol_id, nombre, email, estado) VALUES (?, ?, ?, ?)', [roles[0].id, 'Usuario de verificación', email, 'demostrativo'])
        const userId = insert.insertId
        await rejected(connection.execute('INSERT INTO usuarios (rol_id, nombre, email) VALUES (?, ?, ?)', [roles[0].id, 'Duplicado', email]), 'ER_DUP_ENTRY')
        await rejected(connection.execute('INSERT INTO usuarios (rol_id, nombre, email) VALUES (?, ?, ?)', [roles[0].id, 'Duplicado por mayúsculas', email.toUpperCase()]), 'ER_DUP_ENTRY')
        await connection.execute('INSERT INTO favoritos (usuario_id, jikan_anime_id) VALUES (?, ?)', [userId, 1])
        await rejected(connection.execute('INSERT INTO favoritos (usuario_id, jikan_anime_id) VALUES (?, ?)', [userId, 1]), 'ER_DUP_ENTRY')
        await rejected(connection.execute('INSERT INTO favoritos (usuario_id, jikan_anime_id) VALUES (?, ?)', [userId, 0]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        await rejected(connection.execute('INSERT INTO favoritos (usuario_id, jikan_anime_id) VALUES (?, ?)', [0, 1]), 'ER_NO_REFERENCED_ROW_2')

        const [cart] = await connection.execute('INSERT INTO carritos (usuario_id) VALUES (?)', [userId])
        await rejected(connection.execute('INSERT INTO carritos (usuario_id) VALUES (?)', [userId]), 'ER_DUP_ENTRY')
        await connection.execute('INSERT INTO detalles_carrito (carrito_id, producto_id, cantidad) VALUES (?, ?, ?)', [cart.insertId, id, 2])
        await rejected(connection.execute('UPDATE detalles_carrito SET cantidad = ? WHERE carrito_id = ? AND producto_id = ?', [0, cart.insertId, id]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        await rejected(connection.execute('INSERT INTO detalles_carrito (carrito_id, producto_id, cantidad) VALUES (?, ?, ?)', [cart.insertId, id, 1]), 'ER_DUP_ENTRY')
        await connection.execute('UPDATE carritos SET estado = ? WHERE id = ?', ['abandonado', cart.insertId])
        await connection.execute('INSERT INTO carritos (usuario_id) VALUES (?)', [userId])
        await connection.execute('DELETE FROM carritos WHERE id = ?', [cart.insertId])
        assert.equal(Number((await connection.execute('SELECT COUNT(*) AS n FROM detalles_carrito WHERE carrito_id = ?', [cart.insertId]))[0][0].n), 0)

        const [order] = await connection.execute('INSERT INTO pedidos (usuario_id, costo_envio) VALUES (?, ?)', [userId, '1.50'])
        await rejected(connection.execute('UPDATE pedidos SET costo_envio = ? WHERE id = ?', ['-1.00', order.insertId]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        await rejected(connection.execute('UPDATE pedidos SET moneda = ? WHERE id = ?', ['USD', order.insertId]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        await connection.execute('INSERT INTO detalles_pedido (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad) VALUES (?, ?, ?, ?, ?)', [order.insertId, id, product.name, '10.25', 3])
        await rejected(connection.execute('UPDATE detalles_pedido SET precio_unitario = ? WHERE pedido_id = ?', ['-1.00', order.insertId]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        const [details] = await connection.execute('SELECT subtotal FROM detalles_pedido WHERE pedido_id = ?', [order.insertId])
        assert.equal(details[0].subtotal, '30.75')
        await connection.execute('UPDATE productos SET precio = ? WHERE id = ?', ['12.50', id])
        assert.equal((await connection.execute('SELECT precio_unitario FROM detalles_pedido WHERE pedido_id = ?', [order.insertId]))[0][0].precio_unitario, '10.25')
        await rejected(connection.execute('DELETE FROM usuarios WHERE id = ?', [userId]), 'ER_ROW_IS_REFERENCED_2')

        const [plans] = await connection.execute('SELECT id FROM suscripciones WHERE codigo = ?', ['free'])
        const [history] = await connection.execute('INSERT INTO historial_suscripciones (usuario_id, suscripcion_id, estado, fecha_inicio, fecha_fin, precio_contratado) VALUES (?, ?, ?, ?, ?, ?)', [userId, plans[0].id, 'activa', '2026-01-01 00:00:00', '2026-02-01 00:00:00', '0.00'])
        await rejected(connection.execute('INSERT INTO historial_suscripciones (usuario_id, suscripcion_id, estado, fecha_inicio, precio_contratado) VALUES (?, ?, ?, ?, ?)', [userId, plans[0].id, 'activa', '2026-02-01 00:00:00', '0.00']), 'ER_DUP_ENTRY')
        await rejected(connection.execute('UPDATE historial_suscripciones SET fecha_fin = ? WHERE id = ?', ['2025-01-01 00:00:00', history.insertId]), 'ER_CHECK_CONSTRAINT_VIOLATED')
        await connection.execute('UPDATE historial_suscripciones SET estado = ? WHERE id = ?', ['finalizada', history.insertId])
        await connection.execute('INSERT INTO historial_suscripciones (usuario_id, suscripcion_id, estado, fecha_inicio, precio_contratado) VALUES (?, ?, ?, ?, ?)', [userId, plans[0].id, 'activa', '2026-02-01 00:00:00', '0.00'])

        await connection.execute('DELETE FROM detalles_pedido WHERE pedido_id = ?', [order.insertId])
        await connection.execute('DELETE FROM pedidos WHERE id = ?', [order.insertId])
        await connection.execute('DELETE FROM historial_suscripciones WHERE usuario_id = ?', [userId])
        await connection.execute('DELETE FROM carritos WHERE usuario_id = ?', [userId])
        await connection.execute('DELETE FROM usuarios WHERE id = ?', [userId])
        assert.equal(Number((await connection.execute('SELECT COUNT(*) AS n FROM favoritos WHERE usuario_id = ?', [userId]))[0][0].n), 0)
        assert.equal(Number((await connection.execute('SELECT COUNT(*) AS n FROM carritos WHERE usuario_id = ?', [userId]))[0][0].n), 0)
        throw expectedRollback
      })
    } catch (error) { if (error !== expectedRollback) throw error }
    assert.equal(Number((await pool.execute('SELECT COUNT(*) AS n FROM usuarios WHERE email = ?', [email]))[0][0].n), 0)
    assert.equal((await repository.findProductById(id)).price, 10.25, 'el cambio de precio interno se revirtió')
    log('PASS relaciones, únicos, carritos, pedidos, DECIMAL, historial, CASCADE y rollback de fixtures temporales')
  } finally {
    await withTransaction(pool, async (connection) => {
      for (const productId of [id, rollbackId]) {
        await connection.execute('DELETE FROM inventario WHERE producto_id = ?', [productId])
        await connection.execute('DELETE FROM productos WHERE id = ?', [productId])
      }
    })
  }
  assert.equal(await repository.findProductById(id), null)
  log('PASS eliminación controlada y limpieza; no se modificaron usuarios ni productos previos')
}
