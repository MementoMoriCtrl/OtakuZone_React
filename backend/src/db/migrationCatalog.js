import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const normalizeSql = sql => sql.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
export const sqlChecksum = sql => createHash('sha256').update(normalizeSql(sql)).digest('hex')
const mysqlRoot = new URL('../../database/migrations/', import.meta.url)
const tidbManifest = new URL('../../database/tidb/manifest.json', import.meta.url)

export async function readMigrationCatalog(engine = 'mysql') {
  if (!['mysql', 'tidb'].includes(engine)) throw new Error('Dialecto de migraciones no admitido.')
  if (engine === 'tidb') {
    const catalog = JSON.parse(await readFile(tidbManifest, 'utf8'))
    if (catalog.dialect !== 'tidb' || catalog.ledger !== 'schema_migrations_tidb' || catalog.status !== 'ready' || catalog.migrations.length !== 7) throw new Error('Catálogo TiDB inválido o no aprobado.')
    for (const source of catalog.sources) {
      if (!/^\d{3}_[a-z_]+\.sql$/.test(source.file) || sqlChecksum(await readFile(new URL(source.file, mysqlRoot), 'utf8')) !== source.sha256) throw new Error('La procedencia SQL del catálogo TiDB no coincide.')
    }
    const root = new URL('../../database/tidb/', import.meta.url)
    if (catalog.bootstrap.file !== 'ledger.sql') throw new Error('Bootstrap TiDB inválido.')
    const bootstrapSql = normalizeSql(await readFile(new URL(catalog.bootstrap.file, root), 'utf8'))
    if (sqlChecksum(bootstrapSql) !== catalog.bootstrap.sha256) throw new Error('Checksum bootstrap TiDB modificado.')
    const migrations = await Promise.all(catalog.migrations.map(async (item, index) => {
      const source = catalog.sources[index]
      if (!source || item.file !== source.file || item.source?.file !== source.file || item.source?.sha256 !== source.sha256) throw new Error('Procedencia TiDB inválida.')
      const sql = normalizeSql(await readFile(new URL(`migrations/${item.file}`, root), 'utf8'))
      if (sqlChecksum(sql) !== item.sha256) throw new Error('Checksum SQL TiDB modificado.')
      return { ...item, sql, checksum: item.sha256 }
    }))
    return { ...catalog, bootstrapSql, migrations }
  }
  const manifest = JSON.parse(await readFile(new URL('manifest.json', mysqlRoot), 'utf8'))
  const migrations = await Promise.all(manifest.map(async item => {
    if (!/^\d{3}_[a-z_]+\.sql$/.test(item.file)) throw new Error('Nombre de migración no válido.')
    const sql = normalizeSql(await readFile(new URL(item.file, mysqlRoot), 'utf8'))
    return { ...item, sql, checksum: sqlChecksum(sql) }
  }))
  return { dialect: 'mysql', ledger: 'schema_migrations', status: 'ready', migrations }
}

export function assertMigrationDialect(catalog, engine, tableNames = []) {
  const ledger = engine === 'mysql' ? 'schema_migrations' : engine === 'tidb' ? 'schema_migrations_tidb' : null
  if (!ledger || catalog.dialect !== engine || catalog.ledger !== ledger ||
      tableNames.includes(engine === 'mysql' ? 'schema_migrations_tidb' : 'schema_migrations')) throw new Error('No se permite mezclar historiales MySQL y TiDB.')
  if (catalog.status !== 'ready') throw new Error('Migraciones TiDB bloqueadas: contrato de email y SQL adaptado pendientes de aprobación. No se abre conexión.')
}

export function validateAppliedMigrations(catalog, applied) {
  if (applied.some(row => !catalog.migrations.some(item => item.file === row.version))) throw new Error('Historial contiene migraciones desconocidas para el dialecto.')
  if (new Set(applied.map(row => row.version)).size !== applied.length) throw new Error('Historial de migraciones duplicado.')
  for (const row of applied) if (catalog.migrations.find(item => item.file === row.version).checksum !== row.checksum) throw new Error(`Checksum modificado: ${row.version}. No reescribir migraciones aplicadas.`)
  if (catalog.dialect === 'tidb' && applied.some(row => row.status !== 'applied')) throw new Error('Migración TiDB parcial: conciliar antes de reintentar.')
  const order = catalog.migrations.map(item => item.file)
  const present = new Set(applied.map(row => row.version))
  if (order.slice(0, applied.length).some(file => !present.has(file))) throw new Error('Historial no es un prefijo continuo del catálogo.')
}

export async function expectedIntegrityConstraints(engine = 'mysql') {
  const { migrations } = await readMigrationCatalog(engine)
  return migrations.flatMap(item => [...item.sql.matchAll(/CONSTRAINT\s+(\w+)\s+(CHECK|FOREIGN KEY)\b/g)].map(match => ({ name: match[1], type: match[2] })))
}
