import mysql from 'mysql2/promise'
import { readFile } from 'node:fs/promises'
import { checkDatabaseConnection, databaseTlsOptions } from './pool.js'
import { readMigrationCatalog, assertMigrationDialect, validateAppliedMigrations } from './migrationCatalog.js'
import { migrateTidb } from './tidbMigrate.js'

export async function migrateDatabase(config, log = console.log, { connect = mysql.createConnection } = {}) {
  const engine = config.engine ?? 'mysql'
  const catalog = await readMigrationCatalog(engine)
  assertMigrationDialect(catalog, engine)
  if (config.database !== 'otakuzone_db') throw new Error('Las migraciones versionadas están destinadas únicamente a otakuzone_db.')
  // multipleStatements solo para archivos SQL versionados, nunca para el pool HTTP.
  const connection = await connect({ host: config.host, port: config.port, user: config.user, password: config.password, connectTimeout: config.connectTimeout, charset: 'utf8mb4', multipleStatements: true, ...databaseTlsOptions(config) })
  if (engine === 'tidb') {
    try { return await migrateTidb(connection, catalog, checkDatabaseConnection, log) }
    finally { await connection.end() }
  }
  let locked = false
  let transaction = false
  try {
    await checkDatabaseConnection(connection, { expectedEngine: engine, phase: 'bootstrap' })
    const [lock] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', ['otakuzone_db:migrations'])
    if (Number(lock[0].acquired) !== 1) throw new Error('Otro proceso está ejecutando migraciones.')
    locked = true
    const [existing] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.database])
    assertMigrationDialect(catalog, engine, existing.map(table => table.name))
    if (existing.length && !existing.some((table) => table.name === 'schema_migrations')) throw new Error('La base ya contiene tablas sin historial de migraciones. Se requiere auditarla antes; no se ha adoptado ni eliminado ninguna tabla.')
    const migrations = catalog.migrations
    if (existing.some(table => table.name === 'schema_migrations')) {
      const [history] = await connection.execute('SELECT version, checksum FROM otakuzone_db.schema_migrations')
      validateAppliedMigrations(catalog, history)
    }
    await connection.query(migrations[0].sql)
    await connection.query('USE otakuzone_db')
    await connection.query("SET SESSION time_zone = '+00:00'")
    await connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY'")
    await connection.query(await readFile(new URL('../../database/bootstrap/ledger.sql', import.meta.url), 'utf8'))
    const [applied] = await connection.execute('SELECT version, checksum FROM schema_migrations')
    const known = new Map(applied.map((row) => [row.version, row.checksum]))
    validateAppliedMigrations(catalog, applied)
    for (const item of migrations) {
      if (known.has(item.file)) { log(`SKIP ${item.file}`); continue }
      log(`APPLY ${item.file}`)
      if (item.transactional) { await connection.beginTransaction(); transaction = true }
      await connection.query(item.sql)
      await connection.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [item.file, item.checksum])
      if (transaction) { await connection.commit(); transaction = false }
    }
    log('Migraciones completadas y verificadas por checksum.')
  } catch (error) {
    if (transaction) await connection.rollback()
    throw error
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', ['otakuzone_db:migrations']) }
    finally { await connection.end() }
  }
}
