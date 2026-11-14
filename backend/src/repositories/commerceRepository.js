import { commerceSql as sql } from '../db/commerceSql.js'
import { withTransaction } from '../db/transaction.js'
import HttpError from '../utils/HttpError.js'

const rows = async (connection, query, params = []) => (await connection.execute(query, params))[0]
const fail = (code, message) => { throw new HttpError(409, code, message) }
export function createCommerceRepository(pool) {
  const serialized = (userId, operation) => withTransaction(pool, async (connection) => {
    if (!(await rows(connection, sql.lockUser, [userId])).length) throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
    return operation(connection)
  })
  const cartId = async (connection, userId) => {
    const [cart] = await rows(connection, sql.cart, [userId])
    return cart?.id ?? String((await rows(connection, sql.createCart, [userId])).insertId)
  }
  const readCart = async (connection, id) => {
    const items = await rows(connection, sql.cartRows, [id])
    const [money] = await rows(connection, sql.cartTotal, [id])
    return { id: String(id), currency: 'PEN', items, subtotal: money.total, shipping: '0.00', total: money.total, demonstrative: true }
  }
  const readOrder = async (connection, userId, id) => {
    const [order] = await rows(connection, sql.order, [userId, id])
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'El pedido solicitado no existe.')
    return { ...order, items: await rows(connection, sql.orderLines, [id]), history: await rows(connection, sql.history, [id]), demonstrative: true }
  }
  return {
    getCart: (userId) => serialized(userId, async (c) => readCart(c, await cartId(c, userId))),
    changeItem: (userId, productId, quantity, mode) => serialized(userId, async (c) => {
      const id = await cartId(c, userId)
      if (mode === 'remove') { await rows(c, sql.removeItem, [id, productId]); return readCart(c, id) }
      const [product] = await rows(c, sql.product, [productId])
      if (!product?.active || !product.categoryActive) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no está disponible.')
      const [existing] = await rows(c, sql.quantity, [id, productId])
      if (mode === 'set' && !existing) throw new HttpError(404, 'ITEM_NOT_FOUND', 'El producto no está en tu carrito.')
      const count = quantity + (mode === 'add' ? existing?.quantity ?? 0 : 0)
      if (count > 99 || count > product.available) fail('INSUFFICIENT_STOCK', 'No hay existencias suficientes para esa cantidad (máximo 99).')
      if (!existing && (await rows(c, sql.cartRows, [id])).length >= 50) fail('CART_LIMIT', 'El carrito admite hasta 50 productos distintos.')
      await rows(c, sql.putItem, [id, productId, count, count])
      return readCart(c, id)
    }),
    checkout: (userId, requestedCart, key) => serialized(userId, async (c) => {
      const [previous] = await rows(c, sql.existingOrder, [userId, key])
      if (previous) {
        if (String(previous.cartId) !== requestedCart) fail('IDEMPOTENCY_CONFLICT', 'Esta clave ya corresponde a otro carrito.')
        return { ...await readOrder(c, userId, previous.id), replayed: true }
      }
      const [cart] = await rows(c, sql.cart, [userId])
      if (!cart || String(cart.id) !== requestedCart) fail('CART_CHANGED', 'El carrito ya se procesó o no está disponible. Actualízalo antes de continuar.')
      const items = await rows(c, sql.cartRows, [cart.id])
      if (!items.length) fail('EMPTY_CART', 'Agrega productos antes de crear un pedido.')
      // Orden estable de bloqueos de inventario, compartido por todos los compradores.
      for (const item of items) {
        const [product] = await rows(c, sql.product, [item.productId])
        if (!product?.active || !product.categoryActive || product.available < item.quantity) fail('INSUFFICIENT_STOCK', 'El stock cambió. Revisa las cantidades de tu carrito.')
      }
      const inserted = await rows(c, sql.createOrder, [userId, cart.id, key])
      const id = String(inserted.insertId)
      for (const item of items) {
        await rows(c, sql.insertLine, [id, item.quantity, item.productId])
        const result = await rows(c, sql.consumeStock, [item.quantity, item.productId, item.quantity])
        if (result.affectedRows !== 1) fail('INSUFFICIENT_STOCK', 'El stock cambió. Inténtalo de nuevo.')
        await rows(c, 'INSERT INTO movimientos_inventario (producto_id,actor_id,pedido_id,delta,cantidad_anterior,cantidad_nueva,motivo) SELECT producto_id,?,?,?,cantidad_total+?,cantidad_total,\'Compra demostrativa\' FROM inventario WHERE producto_id=?', [userId,id,-item.quantity,item.quantity,item.productId])
      }
      await rows(c, sql.insertHistory, [id])
      await rows(c, sql.convertCart, [cart.id, userId])
      return { ...await readOrder(c, userId, id), replayed: false }
    }),
    listOrders: (userId) => withTransaction(pool, (c) => rows(c, sql.orders, [userId])),
    getOrder: (userId, id) => withTransaction(pool, (c) => readOrder(c, userId, id)),
    plans: () => rows(pool, sql.plans),
    subscription: (userId, code) => serialized(userId, async (c) => {
      const [current] = await rows(c, sql.currentPlan, [userId])
      const desired = code ?? current?.code ?? 'free'
      if (!current || current.code !== desired) {
        if (!(await rows(c, sql.plan, [desired])).length) throw new HttpError(404, 'PLAN_NOT_FOUND', 'El plan no está disponible.')
        await rows(c, sql.endPlan, [userId])
        await rows(c, sql.startPlan, [userId, userId, desired])
      }
      const [active] = await rows(c, sql.currentPlan, [userId])
      return { ...active, demonstrative: true, history: await rows(c, sql.planHistory, [userId]) }
    }),
  }
}
