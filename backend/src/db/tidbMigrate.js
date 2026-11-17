import { assertMigrationDialect, validateAppliedMigrations } from './migrationCatalog.js'

// Explicit operator entry only. Never imported by the HTTP startup path.
export async function migrateTidb(connection, catalog, checkConnection, log) {
  let locked = false
  let transaction = false
  try {
    await connection.query("SET SESSION time_zone = '+00:00'")
    await checkConnection(connection, { expectedEngine: 'tidb', phase: 'bootstrap' })
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', ['otakuzone_db:tidb:migrations'])
    if (Number(lock.acquired) !== 1) throw new Error('Otro proceso está ejecutando migraciones.')
    locked = true
    const [tables] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', ['otakuzone_db'])
    assertMigrationDialect(catalog, 'tidb', tables.map(row => row.name))
    if (tables.length && !tables.some(row => row.name === catalog.ledger)) throw new Error('Destino contiene tablas sin historial TiDB; no se adopta ni elimina.')
    let history = []
    if (tables.some(row => row.name === catalog.ledger)) {
      const [rows] = await connection.execute('SELECT version, checksum, status FROM otakuzone_db.schema_migrations_tidb ORDER BY version')
      history = rows
      validateAppliedMigrations(catalog, history)
      if (history.length < 2 && tables.some(row => row.name !== catalog.ledger)) throw new Error('Destino parcial sin esquema versionado; requiere conciliación.')
    }
    // Database bootstrap is idempotent; all later work gets an applying marker.
    await connection.query(catalog.migrations[0].sql)
    await connection.query('USE otakuzone_db')
    await connection.query(catalog.bootstrapSql)
    const known = new Set(history.map(row => row.version))
    for (const item of catalog.migrations) {
      if (known.has(item.file)) { log(`SKIP ${item.file}`); continue }
      // Persist BEFORE DDL: a crash/partial DDL leaves a visible stop condition.
      await connection.execute("INSERT INTO schema_migrations_tidb (version, checksum, status) VALUES (?, ?, 'applying')", [item.file, item.checksum])
      if (item.transactional) { await connection.beginTransaction(); transaction = true }
      if (item !== catalog.migrations[0]) await connection.query(item.sql)
      await connection.execute("UPDATE schema_migrations_tidb SET status = 'applied', applied_at = UTC_TIMESTAMP(3) WHERE version = ? AND checksum = ? AND status = 'applying'", [item.file, item.checksum])
      if (transaction) { await connection.commit(); transaction = false }
      log(`APPLY ${item.file}`)
    }
  } catch (error) {
    if (transaction) { try { await connection.rollback() } catch { /* Preserve original failure; caller closes connection. */ } }
    throw error
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', ['otakuzone_db:tidb:migrations'])
  }
}
