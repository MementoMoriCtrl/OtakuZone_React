// SQL estático: todos los valores variables se enlazan con execute y ?.
const productFields = 'p.id, p.nombre AS name, p.categoria_id AS categoryId, p.precio AS price, p.image_key AS imageKey, p.alt_imagen AS imageAlt, p.descripcion AS description, COALESCE((SELECT i.cantidad_disponible FROM inventario i WHERE i.producto_id=p.id),0) AS available'
export const catalogSql = Object.freeze({
  products: `SELECT ${productFields} FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.activo = 1 AND c.activa = 1 AND (? IS NULL OR p.categoria_id = ?) AND (? IS NULL OR LOCATE(LOWER(?), LOWER(p.nombre)) > 0) ORDER BY p.orden, p.id`,
  product: `SELECT ${productFields} FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.activo = 1 AND c.activa = 1 AND p.id = ?`,
  categories: 'SELECT id, nombre AS name FROM categorias WHERE activa = 1 ORDER BY orden, id',
  category: 'SELECT id, nombre AS name FROM categorias WHERE activa = 1 AND id = ?',
  promotions: 'SELECT id, titulo AS title, descripcion AS description, destino AS `to` FROM promociones WHERE activa = 1 ORDER BY orden, id',
  insertProduct: 'INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, image_key, alt_imagen) VALUES (?, ?, ?, ?, ?, ?, ?)',
  insertInventory: 'INSERT INTO inventario (producto_id, cantidad_total, cantidad_reservada) VALUES (?, ?, 0)',
})
