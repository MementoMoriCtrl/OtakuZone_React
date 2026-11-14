import mysql from 'mysql2/promise'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { assertMysqlVersion } from './pool.js'

const migrationsUrl = new URL('../../database/migrations/', import.meta.url)
export async function migrateDatabase(config, log = console.log) {
  if (config.database !== 'otakuzone_db') throw new Error('Las migraciones versionadas están destinadas únicamente a otakuzone_db.')
  // multipleStatements solo para archivos SQL versionados, nunca para el pool HTTP.
  const connection = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password, connectTimeout: config.connectTimeout, charset: 'utf8mb4', multipleStatements: true, ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}) })
  let locked = false
  let transaction = false
  try {
    assertMysqlVersion((await connection.execute('SELECT VERSION() AS version'))[0][0].version)
    const [lock] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', ['otakuzone_db:migrations'])
    if (Number(lock[0].acquired) !== 1) throw new Error('Otro proceso está ejecutando migraciones.')
    locked = true
    const [existing] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.database])
    if (existing.length && !existing.some((table) => table.name === 'schema_migrations')) throw new Error('La base ya contiene tablas sin historial de migraciones. Se requiere auditarla antes; no se ha adoptado ni eliminado ninguna tabla.')
    const manifest = JSON.parse(await readFile(new URL('manifest.json', migrationsUrl), 'utf8'))
    const migrations = await Promise.all(manifest.map(async (item) => {
      if (!/^\d{3}_[a-z_]+\.sql$/.test(item.file)) throw new Error('Nombre de migración no válido.')
      const sql = (await readFile(new URL(item.file, migrationsUrl), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
      return { ...item, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    }))
    await connection.query(migrations[0].sql)
    await connection.query('USE otakuzone_db')
    await connection.query("SET SESSION time_zone = '+00:00'")
    await connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY'")
    await connection.query(await readFile(new URL('../../database/bootstrap/ledger.sql', import.meta.url), 'utf8'))
    const [applied] = await connection.execute('SELECT version, checksum FROM schema_migrations')
    const known = new Map(applied.map((row) => [row.version, row.checksum]))
    if (applied.some((row) => !migrations.some((item) => item.file === row.version))) throw new Error('La base contiene versiones de esquema que este código no conoce.')
    for (const item of migrations) if (known.has(item.file) && known.get(item.file) !== item.checksum) throw new Error(`Checksum modificado: ${item.file}. Crear una nueva migración; no reescribir las aplicadas.`)
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
