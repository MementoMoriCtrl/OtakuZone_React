import { withTransaction } from '../db/transaction.js'
import HttpError from '../utils/HttpError.js'
const rows = async (c, sql, params = []) => (await c.execute(sql, params))[0]
const missing = () => { throw new HttpError(404, 'ADMIN_NOT_FOUND', 'El registro no existe.') }
const conflict = message => { throw new HttpError(409, 'ADMIN_CONFLICT', message) }
export const allowedTransitions = Object.freeze({ pendiente: ['cancelado'], confirmado: ['cancelado', 'completado'], cancelado: [], completado: [] })
export function createAdminRepository(pool) {
  const write = operation => withTransaction(pool, async c => {
    try { return await operation(c) } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') conflict('El identificador ya existe.')
      if (['ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2','ER_NO_REFERENCED_ROW','ER_ROW_IS_REFERENCED'].includes(e.code) || [1216,1217,1451,1452].includes(e.errno)) conflict('El registro tiene relaciones que impiden esta operación.')
      throw e
    }
  })
  const movement = (c, product, actor, before, after, reason, order = null) => rows(c, 'INSERT INTO movimientos_inventario (producto_id,actor_id,pedido_id,delta,cantidad_anterior,cantidad_nueva,motivo) VALUES (?,?,?,?,?,?,?)', [product, actor, order, after - before, before, after, reason])
  const category = async (c, id) => {
    const [item] = await rows(c, 'SELECT id,activa FROM categorias WHERE id=? FOR UPDATE', [id])
    if (!item?.activa) conflict('Selecciona una categoría activa.')
  }
  return {
    async dashboard() {
      const [data] = await rows(pool, `SELECT (SELECT COUNT(*) FROM usuarios) AS users, (SELECT COUNT(*) FROM productos) AS products,
        (SELECT COUNT(*) FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id WHERE p.activo=1 AND COALESCE(i.cantidad_disponible,0)<=5) AS lowStock,
        (SELECT COUNT(*) FROM pedidos) AS orders, (SELECT COUNT(*) FROM pedidos WHERE estado='pendiente') AS pendingOrders,
        (SELECT COUNT(*) FROM historial_suscripciones WHERE estado='activa') AS activeSubscriptions`)
      return Object.fromEntries(Object.entries(data).map(([k,v]) => [k, Number(v)]))
    },
    async list(kind, page) {
      const queries = {
        products: 'SELECT p.id,p.nombre AS name,p.categoria_id AS categoryId,p.precio AS price,p.descripcion AS description,p.image_key AS imageKey,p.alt_imagen AS imageAlt,p.activo AS active,i.cantidad_total AS quantity,i.cantidad_reservada AS reserved,i.cantidad_disponible AS available FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id ORDER BY p.id',
        categories: 'SELECT id,nombre AS name,activa AS active,(SELECT COUNT(*) FROM productos p WHERE p.categoria_id=c.id) AS products FROM categorias c ORDER BY id',
        inventory: 'SELECT p.id,p.nombre AS name,i.cantidad_total AS quantity,i.cantidad_reservada AS reserved,i.cantidad_disponible AS available FROM productos p JOIN inventario i ON i.producto_id=p.id ORDER BY i.cantidad_disponible,p.id',
        movements: 'SELECT m.id,m.producto_id AS productId,m.actor_id AS actorId,m.pedido_id AS orderId,m.delta,m.cantidad_anterior AS beforeQuantity,m.cantidad_nueva AS afterQuantity,m.motivo AS reason,m.creado_en AS createdAt FROM movimientos_inventario m ORDER BY m.id DESC',
        orders: 'SELECT p.id,p.estado AS status,p.usuario_id AS userId,u.nombre AS customer,u.email,p.creado_en AS createdAt,CAST(COALESCE((SELECT SUM(d.subtotal) FROM detalles_pedido d WHERE d.pedido_id=p.id),0)+p.costo_envio AS DECIMAL(16,2)) AS total FROM pedidos p JOIN usuarios u ON u.id=p.usuario_id ORDER BY p.id DESC',
        users: 'SELECT u.id,u.nombre AS name,u.email,u.estado AS status,CASE WHEN r.codigo=\'administrador\' THEN \'ADMIN\' ELSE \'CLIENTE\' END AS role,u.creado_en AS createdAt FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.id DESC',
      }
      const items = await rows(pool, queries[kind] + ' LIMIT 51 OFFSET ' + String((page - 1) * 50))
      return { items: items.slice(0,50), page, hasMore: items.length > 50 }
    },
    createProduct: (b, actor) => write(async c => {
      await category(c, b.categoryId)
      await rows(c, 'INSERT INTO productos (id,nombre,categoria_id,precio,descripcion,image_key,alt_imagen,activo) VALUES (?,?,?,?,?,?,?,?)', [b.id,b.name,b.categoryId,b.price.toFixed(2),b.description,b.imageKey,b.imageAlt,b.active])
      await rows(c, 'INSERT INTO inventario (producto_id,cantidad_total) VALUES (?,?)', [b.id,b.quantity])
      await movement(c,b.id,actor,0,b.quantity,'Alta de producto')
      return { id: b.id }
    }),
    updateProduct: (id,b) => write(async c => {
      await category(c,b.categoryId)
      if (!(await rows(c,'SELECT id FROM productos WHERE id=? FOR UPDATE',[id])).length) missing()
      await rows(c,'UPDATE productos SET nombre=?,categoria_id=?,precio=?,descripcion=?,image_key=?,alt_imagen=?,activo=? WHERE id=?',[b.name,b.categoryId,b.price.toFixed(2),b.description,b.imageKey,b.imageAlt,b.active,id])
      return { id }
    }),
    deactivateProduct: id => write(async c => {
      if (!(await rows(c,'SELECT id FROM productos WHERE id=? FOR UPDATE',[id])).length) missing()
      await rows(c,'UPDATE productos SET activo=0 WHERE id=?',[id]); return { id }
    }),
    createCategory: b => write(async c => { await rows(c,'INSERT INTO categorias (id,nombre,activa) VALUES (?,?,?)',[b.id,b.name,b.active]); return {id:b.id} }),
    updateCategory: (id,b) => write(async c => {
      if (!(await rows(c,'SELECT id FROM categorias WHERE id=? FOR UPDATE',[id])).length) missing()
      await rows(c,'UPDATE categorias SET nombre=?,activa=? WHERE id=?',[b.name,b.active,id]); return {id}
    }),
    updateInventory: (id,b,actor) => write(async c => {
      const [item] = await rows(c,'SELECT cantidad_total AS quantity,cantidad_reservada AS reserved FROM inventario WHERE producto_id=? FOR UPDATE',[id])
      if (!item) missing()
      if (item.quantity !== b.expectedQuantity) conflict('El inventario cambió. Recarga antes de guardar.')
      if (b.quantity < item.reserved) conflict('Las existencias no pueden ser inferiores a las unidades reservadas.')
      await rows(c,'UPDATE inventario SET cantidad_total=? WHERE producto_id=?',[b.quantity,id])
      await movement(c,id,actor,item.quantity,b.quantity,b.reason); return {id}
    }),
    order: id => withTransaction(pool, async c => {
      const [order] = await rows(c,'SELECT p.id,p.estado AS status,p.usuario_id AS userId,u.nombre AS customer,u.email,p.costo_envio AS shipping,CAST(COALESCE((SELECT SUM(d.subtotal) FROM detalles_pedido d WHERE d.pedido_id=p.id),0)+p.costo_envio AS DECIMAL(16,2)) AS total FROM pedidos p JOIN usuarios u ON u.id=p.usuario_id WHERE p.id=?',[id])
      if (!order) missing()
      return {...order,items:await rows(c,'SELECT producto_id AS productId,nombre_producto AS name,cantidad AS quantity,precio_unitario AS price,subtotal FROM detalles_pedido WHERE pedido_id=? ORDER BY producto_id',[id]),history:await rows(c,'SELECT estado AS status,creado_en AS createdAt FROM historial_pedidos WHERE pedido_id=? ORDER BY id',[id]),allowedTransitions:allowedTransitions[order.status]}
    }),
    updateOrder: (id,b,actor) => write(async c => {
      const [order] = await rows(c,'SELECT estado AS status,carrito_origen_id AS cartId FROM pedidos WHERE id=? FOR UPDATE',[id])
      if (!order) missing()
      if (order.status !== b.expectedStatus || !allowedTransitions[order.status].includes(b.status)) conflict('La transición no está permitida o el pedido cambió.')
      if (order.status === 'confirmado' && b.status === 'cancelado') {
        if (!order.cartId) conflict('Pedido histórico sin origen verificable: requiere conciliación de inventario.')
        const items = await rows(c,'SELECT producto_id AS productId,cantidad AS quantity FROM detalles_pedido WHERE pedido_id=? ORDER BY producto_id',[id])
        for (const item of items) {
          const [stock] = await rows(c,'SELECT cantidad_total AS quantity FROM inventario WHERE producto_id=? FOR UPDATE',[item.productId])
          if (!stock) conflict('Falta inventario para restituir este pedido.')
          await rows(c,'UPDATE inventario SET cantidad_total=cantidad_total+? WHERE producto_id=?',[item.quantity,item.productId])
          await movement(c,item.productId,actor,stock.quantity,stock.quantity+item.quantity,'Cancelación de pedido',id)
        }
      }
      await rows(c,'UPDATE pedidos SET estado=? WHERE id=?',[b.status,id])
      await rows(c,'INSERT INTO historial_pedidos (pedido_id,estado) VALUES (?,?)',[id,b.status]); return {id,status:b.status}
    }),
  }
}
