import { checkDatabaseConnection } from './pool.js'

export const expectedTables = ['roles', 'usuarios', 'categorias', 'productos', 'inventario', 'favoritos', 'carritos', 'detalles_carrito', 'pedidos', 'detalles_pedido', 'suscripciones', 'historial_suscripciones', 'promociones', 'schema_migrations']
export async function checkDatabaseSchema(pool) {
  const connection = await checkDatabaseConnection(pool)
  const [tables] = await pool.execute('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [connection.databaseName])
  for (const name of expectedTables) if (!tables.some((table) => table.name === name && table.engine === 'InnoDB')) throw new Error(`Tabla InnoDB ausente: ${name}`)
  const [constraints] = await pool.execute('SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type, ENFORCED AS enforced FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [connection.databaseName])
  if (constraints.filter((row) => row.type === 'FOREIGN KEY').length < 12 || constraints.filter((row) => row.type === 'CHECK').length < 18) throw new Error('Faltan restricciones de integridad esperadas.')
  if (constraints.some((row) => row.type === 'CHECK' && row.enforced !== 'YES')) throw new Error('Hay restricciones CHECK declaradas pero no aplicadas.')
  const [money] = await pool.execute("SELECT TABLE_NAME AS name, COLUMN_NAME AS field, DATA_TYPE AS type, NUMERIC_SCALE AS scale FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME IN ('precio', 'precio_unitario', 'subtotal', 'costo_envio', 'precio_mensual', 'precio_contratado')", [connection.databaseName])
  if (money.length !== 6 || money.some((column) => column.type !== 'decimal' || Number(column.scale) !== 2)) throw new Error('Los importes no tienen el contrato DECIMAL esperado.')
  const [versions] = await pool.execute('SELECT version FROM schema_migrations ORDER BY version')
  if (versions.length !== 4) throw new Error('Aplicar las cuatro migraciones versionadas antes de validar el catálogo.')
  return { version: connection.version, tables: expectedTables.length, foreignKeys: constraints.filter((row) => row.type === 'FOREIGN KEY').length, checks: constraints.filter((row) => row.type === 'CHECK').length, migrations: versions.length }
}
