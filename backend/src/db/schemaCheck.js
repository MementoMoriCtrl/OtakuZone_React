import { checkDatabaseConnection, databasePoolEngine } from './pool.js'
import { readFile } from 'node:fs/promises'
import { readMigrationCatalog } from './migrationCatalog.js'

export const expectedTables = ['roles', 'usuarios', 'categorias', 'productos', 'inventario', 'favoritos', 'carritos', 'detalles_carrito', 'pedidos', 'detalles_pedido', 'historial_pedidos', 'suscripciones', 'historial_suscripciones', 'promociones', 'auth_sesiones', 'schema_migrations', 'movimientos_inventario']
export async function checkDatabaseSchema(pool, { allowPendingAdmin = false } = {}) {
  const executor = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool
  try {
    const connection = await checkDatabaseConnection(executor, { expectedEngine: databasePoolEngine(pool) })
    const tidb = connection.identity.engine === 'tidb'
    const catalog = tidb ? await readMigrationCatalog('tidb') : null
    const [tables] = await executor.execute('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [connection.databaseName])
    const tableNames = tidb ? expectedTables.map(name => name === 'schema_migrations' ? catalog.ledger : name) : expectedTables
    const required = allowPendingAdmin && !tidb && !tables.some(t => t.name === 'movimientos_inventario') ? tableNames.filter(t => t !== 'movimientos_inventario') : tableNames
    for (const name of required) if (!tables.some((table) => table.name === name && table.engine === 'InnoDB')) throw new Error(`Tabla InnoDB ausente: ${name}`)
    const [constraints] = tidb ? [connection.preflight.constraints.map(c => ({ name: c.restrictionName, type: c.restrictionType }))] : await executor.execute('SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type, ENFORCED AS enforced FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [connection.databaseName])
    if (constraints.filter((row) => row.type === 'FOREIGN KEY').length < (required.length===17?18:15) || constraints.filter((row) => row.type === 'CHECK').length < (required.length===17?20:19)) throw new Error('Faltan restricciones de integridad esperadas.')
    if (!tidb && constraints.some((row) => row.type === 'CHECK' && row.enforced !== 'YES')) throw new Error('Hay restricciones CHECK declaradas pero no aplicadas.')
    const [money] = await executor.execute("SELECT TABLE_NAME AS name, COLUMN_NAME AS field, DATA_TYPE AS type, NUMERIC_SCALE AS scale FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME IN ('precio', 'precio_unitario', 'subtotal', 'costo_envio', 'precio_mensual', 'precio_contratado')", [connection.databaseName])
    if (money.length !== 6 || money.some((column) => column.type !== 'decimal' || Number(column.scale) !== 2)) throw new Error('Los importes no tienen el contrato DECIMAL esperado.')
    const [versions] = await executor.execute(tidb ? 'SELECT version FROM schema_migrations_tidb ORDER BY version' : 'SELECT version FROM schema_migrations ORDER BY version')
    const manifest = tidb ? catalog.migrations : JSON.parse(await readFile(new URL('../../database/migrations/manifest.json', import.meta.url), 'utf8'))
    const requiredMigrations = allowPendingAdmin && required.length === 16 ? manifest.filter(m => m.file !== '007_admin_inventory.sql') : manifest
    if (versions.length !== requiredMigrations.length || requiredMigrations.some((item) => !versions.some((row) => row.version === item.file))) throw new Error('Aplicar todas las migraciones versionadas antes de validar el esquema.')
    return { version: connection.version, tables: required.length, foreignKeys: constraints.filter((row) => row.type === 'FOREIGN KEY').length, checks: constraints.filter((row) => row.type === 'CHECK').length, migrations: versions.length }
  } finally { if (executor !== pool) executor.release() }
}
