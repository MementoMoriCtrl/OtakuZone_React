import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema } from '../src/db/schemaCheck.js'
import { assertTestIsolation } from './test-isolation.js'

// Administrative bootstrap reads development only; all fixtures use a separate DB-only account.
loadEnvironment()
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = loadDatabaseConfig()
const suffix = randomBytes(6).toString('hex')
const database = `otakuzone_f7_test_${suffix}`
const user = `ozf7_${suffix}`
assert.notEqual(database, source.database)
const password = randomBytes(32).toString('hex')
const admin = createDatabasePool(source)
let connection, created = false, account = false
const services = []
const seedTables = ['roles', 'categorias', 'productos', 'inventario', 'suscripciones', 'promociones', 'schema_migrations']
const quoted = name => { assert.match(name, /^[a-zA-Z0-9_]+$/); return '`' + name + '`' }
const env = { ...process.env, NODE_ENV: 'test', DB_NAME: database, TEST_DB_NAME: database, DEVELOPMENT_DB_NAME: source.database,
  DB_USER: user, DB_PASSWORD: password, JWT_SECRET: randomBytes(64).toString('hex'), AUTH_ENABLED: 'true', CATALOG_SOURCE: 'mysql',
  HOST: '127.0.0.1', PORT: '4407', CORS_ORIGINS: 'http://127.0.0.1:5177', AUTH_RATE_MAX: '100', RATE_LIMIT_MAX: '1000',
  BCRYPT_ROUNDS: '10', API_URL: 'http://127.0.0.1:4407/api/v1', AUDIT_URL: 'http://127.0.0.1:5177',
  VITE_AUTH_API_URL: 'http://127.0.0.1:4407/api/v1', VITE_OTAKUZONE_API_URL: 'http://127.0.0.1:4407/api/v1' }
const child = (file, args = []) => spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true })
const run = async file => { const process = child(file); const [code] = await once(process, 'exit'); assert.equal(code, 0, `Falló ${file}`) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function ready(url, process) {
  for (let i = 0; i < 100; i++) {
    assert.equal(process.exitCode, null, 'El servidor terminó antes de estar listo')
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return } catch { /* boot */ }
    await pause(100)
  }
  throw new Error('Servidor aislado no disponible')
}
try {
  // Refuse port reuse: the browser must never reach an existing development server.
  const { createServer } = await import('node:net')
  for (const port of [4407, 5177]) {
    const probe = createServer().listen(port, '127.0.0.1'); await once(probe, 'listening'); await new Promise(resolve => probe.close(resolve))
  }
  console.log('Esquema origen (solo lectura):', JSON.stringify(await checkDatabaseSchema(admin)))
  const [ledger] = await admin.execute('SELECT version,checksum FROM schema_migrations ORDER BY version')
  for (const row of ledger) {
    assert.match(row.version, /^\d{3}_[a-z_]+\.sql$/)
    const sql = (await readFile(new URL(`../database/migrations/${row.version}`, import.meta.url), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(sql).digest('hex'), row.checksum)
  }
  connection = await admin.getConnection()
  const [tables] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\'', [source.database])
  // New database only. Do not replay migrations, copy users/orders or touch source rows.
  await connection.query(`CREATE DATABASE ${quoted(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true
  await connection.query(`USE ${quoted(database)}`)
  await connection.query('SET FOREIGN_KEY_CHECKS=0')
  for (const { name } of tables) {
    const [[ddl]] = await connection.query(`SHOW CREATE TABLE ${quoted(source.database)}.${quoted(name)}`)
    assert.ok(!ddl['Create Table'].includes('`' + source.database + '`.'))
    await connection.query(ddl['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, ''))
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1')
  for (const table of seedTables) {
    const [columns] = await connection.execute('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND EXTRA NOT LIKE \'%GENERATED%\' ORDER BY ORDINAL_POSITION', [source.database, table])
    const fields = columns.map(c => quoted(c.name)).join(',')
    await connection.query(`INSERT INTO ${quoted(database)}.${quoted(table)} (${fields}) SELECT ${fields} FROM ${quoted(source.database)}.${quoted(table)}`)
  }
  await connection.query('CREATE USER ?@\'127.0.0.1\' IDENTIFIED BY ?', [user, password]); account = true
  await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${quoted(database)}.* TO ?@'127.0.0.1'`, [user])
  Object.assign(process.env, env)
  await assertTestIsolation(loadDatabaseConfig())
  console.log('Base aislada preparada:', database, '; sin usuarios, sesiones ni pedidos de origen')
  await run('backend/scripts/verify-commerce.js')
  const api = child('backend/src/server.js'); services.push(api)
  await ready(env.API_URL + '/health', api)
  const vite = child('node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', '5177', '--strictPort']); services.push(vite)
  await ready(env.AUDIT_URL, vite)
  await run('scripts/audit-commerce-browser.mjs')
  console.log('PASS cierre funcional HTTP + navegador sobre MySQL aislado')
} catch (error) {
  console.error('Cierre aislado detenido:', error.code ?? error.message); process.exitCode = 1
} finally {
  for (const service of services.reverse()) { service.kill(); if (service.exitCode === null) await once(service, 'exit') }
  if (connection) {
    try {
      // Only the exact DB/account successfully created by this invocation are removed.
      if (created) { await connection.query(`DROP DATABASE ${quoted(database)}`); console.log('Base aislada eliminada:', database) }
      if (account) { await connection.query('DROP USER ?@\'127.0.0.1\'', [user]); console.log('Cuenta temporal eliminada') }
    } finally { connection.release() }
  }
  await admin.end()
}
