// Solo SQL estático; importes DECIMAL calculados en MySQL, nunca en el cliente.
export const commerceSql = Object.freeze({
  lockUser: 'SELECT id FROM usuarios WHERE id = ? AND estado = \'activo\' FOR UPDATE',
  cart: "SELECT id FROM carritos WHERE usuario_id = ? AND estado = 'activo'",
  createCart: 'INSERT INTO carritos (usuario_id) VALUES (?)',
  cartRows: `SELECT d.producto_id AS productId, p.nombre AS name, p.precio AS price,
    d.cantidad AS quantity, CAST(p.precio * d.cantidad AS DECIMAL(14,2)) AS subtotal,
    COALESCE(i.cantidad_disponible,0) AS available, (p.activo AND c.activa) AS active
    FROM detalles_carrito d JOIN productos p ON p.id = d.producto_id
    JOIN categorias c ON c.id = p.categoria_id LEFT JOIN inventario i ON i.producto_id = p.id
    WHERE d.carrito_id = ? ORDER BY d.producto_id`,
  cartTotal: 'SELECT CAST(COALESCE(SUM(p.precio * d.cantidad),0) AS DECIMAL(16,2)) AS total FROM detalles_carrito d JOIN productos p ON p.id=d.producto_id WHERE d.carrito_id=?',
  product: `SELECT p.id, p.precio AS price, p.nombre AS name, p.activo AS active, c.activa AS categoryActive,
    i.cantidad_disponible AS available FROM productos p JOIN categorias c ON c.id=p.categoria_id
    JOIN inventario i ON i.producto_id=p.id WHERE p.id=? FOR UPDATE`,
  quantity: 'SELECT cantidad AS quantity FROM detalles_carrito WHERE carrito_id=? AND producto_id=?',
  putItem: 'INSERT INTO detalles_carrito (carrito_id,producto_id,cantidad) VALUES (?,?,?) ON DUPLICATE KEY UPDATE cantidad=?',
  removeItem: 'DELETE FROM detalles_carrito WHERE carrito_id=? AND producto_id=?',
  existingOrder: 'SELECT id,carrito_origen_id AS cartId FROM pedidos WHERE usuario_id=? AND clave_solicitud=?',
  createOrder: "INSERT INTO pedidos (usuario_id,estado,carrito_origen_id,clave_solicitud) VALUES (?,'confirmado',?,?)",
  insertLine: 'INSERT INTO detalles_pedido (pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) SELECT ?,id,nombre,precio,? FROM productos WHERE id=?',
  consumeStock: 'UPDATE inventario SET cantidad_total=cantidad_total-? WHERE producto_id=? AND cantidad_disponible>=?',
  convertCart: "UPDATE carritos SET estado='convertido' WHERE id=? AND usuario_id=? AND estado='activo'",
  insertHistory: "INSERT INTO historial_pedidos (pedido_id,estado) VALUES (?,'confirmado')",
  order: `SELECT p.id,p.estado AS status,p.moneda AS currency,p.costo_envio AS shipping,p.creado_en AS createdAt,
    CAST(COALESCE(SUM(d.subtotal),0) AS DECIMAL(16,2)) AS subtotal,
    CAST(COALESCE(SUM(d.subtotal),0)+p.costo_envio AS DECIMAL(16,2)) AS total
    FROM pedidos p LEFT JOIN detalles_pedido d ON d.pedido_id=p.id WHERE p.usuario_id=? AND p.id=? GROUP BY p.id`,
  orders: `SELECT p.id,p.estado AS status,p.moneda AS currency,p.creado_en AS createdAt,
    CAST(COALESCE(SUM(d.subtotal),0)+p.costo_envio AS DECIMAL(16,2)) AS total
    FROM pedidos p LEFT JOIN detalles_pedido d ON d.pedido_id=p.id WHERE p.usuario_id=? GROUP BY p.id ORDER BY p.id DESC LIMIT 100`,
  orderLines: 'SELECT producto_id AS productId,nombre_producto AS name,precio_unitario AS price,cantidad AS quantity,subtotal FROM detalles_pedido WHERE pedido_id=? ORDER BY producto_id',
  history: 'SELECT estado AS status,creado_en AS createdAt FROM historial_pedidos WHERE pedido_id=? ORDER BY creado_en,id',
  plans: 'SELECT codigo AS code,nombre AS name,precio_mensual AS price FROM suscripciones WHERE activa=1 ORDER BY precio_mensual,id',
  plan: 'SELECT id FROM suscripciones WHERE codigo=? AND activa=1',
  currentPlan: `SELECT s.codigo AS code,s.nombre AS name,h.estado AS status,h.fecha_inicio AS startedAt,h.precio_contratado AS price
    FROM historial_suscripciones h JOIN suscripciones s ON s.id=h.suscripcion_id WHERE h.usuario_id=? AND h.estado='activa'`,
  endPlan: "UPDATE historial_suscripciones SET estado='finalizada',fecha_fin=GREATEST(UTC_TIMESTAMP(3),TIMESTAMPADD(MICROSECOND,1000,fecha_inicio)) WHERE usuario_id=? AND estado='activa'",
  startPlan: `INSERT INTO historial_suscripciones (usuario_id,suscripcion_id,estado,fecha_inicio,precio_contratado)
    SELECT ?,s.id,'activa',GREATEST(UTC_TIMESTAMP(3),COALESCE((SELECT MAX(h.fecha_fin) FROM historial_suscripciones h WHERE h.usuario_id=?),UTC_TIMESTAMP(3))),s.precio_mensual FROM suscripciones s WHERE s.codigo=? AND s.activa=1`,
  planHistory: 'SELECT s.codigo AS code,h.estado AS status,h.fecha_inicio AS startedAt,h.fecha_fin AS endedAt,h.precio_contratado AS price FROM historial_suscripciones h JOIN suscripciones s ON s.id=h.suscripcion_id WHERE h.usuario_id=? ORDER BY h.id DESC LIMIT 100',
})
