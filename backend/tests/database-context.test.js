import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadDatabaseConfig } from '../src/config/database.js'
import { loadConfig } from '../src/config/env.js'
import { databaseTlsOptions } from '../src/db/pool.js'
import { migrateDatabase } from '../src/db/migrate.js'

// Synthetic values only. No environment file or database connection is used.
const environment = overrides => ({ DB_ENGINE: 'tidb', DB_HOST: 'db.fixture.test', DB_PORT: '4000', DB_NAME: 'otakuzone_db', DB_USER: 'fixture.root', DB_PASSWORD: 'fixture-only-not-a-credential', DB_SSL: 'true', ...overrides })
const migration = { context: 'migration' }

test('runtime rechaza root por defecto, explícito y en producción', () => {
  for (const suffix of ['root', 'ROOT', 'Root']) {
    const env = environment({ DB_USER: `fixture.${suffix}` })
    assert.throws(() => loadDatabaseConfig(env), /runtime sin root/)
    assert.throws(() => loadDatabaseConfig(env, { context: 'runtime' }), /runtime sin root/)
    assert.throws(() => loadDatabaseConfig({ ...env, NODE_ENV: 'production' }), /runtime sin root/)
  }
})

test('migration acepta root TiDB sin cambiar TLS ni el objeto de configuración compartido', () => {
  const config = loadDatabaseConfig(environment(), migration)
  assert.equal(config.engine, 'tidb')
  assert.equal(config.user, 'fixture.root')
  assert.equal(config.database, 'otakuzone_db')
  assert.deepEqual(databaseTlsOptions(config), { ssl: { rejectUnauthorized: true, verifyIdentity: true } })
  assert.equal('context' in config, false)
  assert.throws(() => loadDatabaseConfig(environment()), /runtime sin root/)
})

test('migration no habilita sufijo .root en MySQL; runtime MySQL local se conserva', () => {
  assert.throws(() => loadDatabaseConfig(environment({ DB_ENGINE: 'mysql' }), migration), /requiere DB_ENGINE=tidb/)
  const local = { DB_USER: 'root', DB_PASSWORD: 'fixture-only-not-a-credential' }
  assert.deepEqual(loadDatabaseConfig(local, migration), loadDatabaseConfig(local))
  assert.equal(loadDatabaseConfig(local).engine, 'mysql')
  assert.equal(loadDatabaseConfig(local).host, '127.0.0.1')
  assert.equal(loadDatabaseConfig({ ...local, DB_USER: 'fixture.root' }).user, 'fixture.root')
})

test('migration rechaza usuarios malformados, credenciales vacías y contextos desconocidos', () => {
  for (const user of ['', 'root', '.root', 'fixture.', 'fixture..root', 'fixture.root.extra', 'fixture root', 'fixture.root ', `${'a'.repeat(28)}.root`]) {
    assert.throws(() => loadDatabaseConfig(environment({ DB_USER: user }), migration))
  }
  assert.throws(() => loadDatabaseConfig(environment({ DB_PASSWORD: '' }), migration), /DB_PASSWORD/)
  assert.throws(() => loadDatabaseConfig(environment(), { context: 'admin' }), /Contexto/)
})

test('ninguna variable de entorno selecciona migration en el cargador HTTP', () => {
  const env = environment({ NODE_ENV: 'production', CATALOG_SOURCE: 'mysql', AUTH_ENABLED: 'true', CORS_ORIGINS: 'https://frontend.test', context: 'migration', DB_CONTEXT: 'migration', DB_ALLOW_ROOT: 'true', ALLOW_ROOT: 'true' })
  loadDatabaseConfig(env, migration)
  assert.throws(() => loadConfig(env), /runtime sin root/)
  assert.throws(() => loadDatabaseConfig(env), /runtime sin root/)
})

test('migration conserva validaciones de host, TLS, puerto, motor, nombre y destino', async () => {
  for (const override of [{ DB_SSL: 'false' }, { DB_HOST: '127.0.0.1' }, { DB_HOST: 'localhost' }, { DB_HOST: '' }, { DB_PORT: '0' }, { DB_PORT: '65536' }, { DB_ENGINE: 'unknown' }, { DB_NAME: 'invalid;sql' }]) {
    assert.throws(() => loadDatabaseConfig(environment(override), migration))
  }
  let connected = false
  const config = loadDatabaseConfig(environment({ DB_NAME: 'wrong_destination' }), migration)
  await assert.rejects(migrateDatabase(config, () => {}, { connect: async () => { connected = true } }), /únicamente/)
  assert.equal(connected, false)
})

test('solo la entrada oficial solicita migration; Express usa el cargador runtime', async () => {
  const script = await readFile(new URL('../scripts/migrate.js', import.meta.url), 'utf8')
  const httpConfig = await readFile(new URL('../src/config/env.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  assert.match(script, /loadDatabaseConfig\(process\.env, \{ context: 'migration' \}\)/)
  assert.match(httpConfig, /loadDatabaseConfig\(environment\)/)
  assert.ok(!server.includes("context: 'migration'"))
})
