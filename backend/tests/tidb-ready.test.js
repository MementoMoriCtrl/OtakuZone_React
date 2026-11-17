import test from 'node:test'
import assert from 'node:assert/strict'
import { readMigrationCatalog, validateAppliedMigrations, expectedIntegrityConstraints } from '../src/db/migrationCatalog.js'
import { migrateTidb } from '../src/db/tidbMigrate.js'
import { emailCheckSql, normalizeCheckSql } from '../src/db/emailContract.js'
import { installTidbSessionGuard } from '../src/db/tidbSession.js'
import { loadConfig } from '../src/config/env.js'

test('catálogo TiDB incluye CHECK extra y detecta ledger parcial/huecos', async () => {
  const catalog = await readMigrationCatalog('tidb')
  const constraints = await expectedIntegrityConstraints('tidb')
  assert.equal(constraints.filter(c => c.type === 'CHECK').length, 21)
  assert.equal(constraints.filter(c => c.type === 'FOREIGN KEY').length, 18)
  assert.throws(() => validateAppliedMigrations(catalog, [{ version: catalog.migrations[0].file, checksum: catalog.migrations[0].checksum, status: 'applying' }]), /parcial/)
  assert.throws(() => validateAppliedMigrations(catalog, [{ version: catalog.migrations[1].file, checksum: catalog.migrations[1].checksum, status: 'applied' }]), /prefijo/)
})

function migrationDouble({ failure, partial = false } = {}) {
  const calls = [], history = []
  return { calls, execute: async (sql, params) => {
    calls.push([sql, params])
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
    if (sql.includes('information_schema.TABLES')) return [partial ? [{ name: 'schema_migrations_tidb' }] : []]
    if (sql.startsWith('SELECT version')) {
      const catalog = await readMigrationCatalog('tidb')
      return [[{ version: catalog.migrations[0].file, checksum: catalog.migrations[0].checksum, status: 'applying' }]]
    }
    if (sql.startsWith('INSERT INTO schema_migrations_tidb')) history.push(params[0])
    return [[]]
  }, query: async sql => { calls.push([sql]); if (failure && sql.includes(failure)) throw new Error('fixture DDL failure') }, beginTransaction: async () => calls.push(['BEGIN']), commit: async () => calls.push(['COMMIT']), rollback: async () => calls.push(['ROLLBACK']) }
}

test('migrador usa ledger TiDB, marca antes del DDL y detiene intentos parciales', async () => {
  const catalog = await readMigrationCatalog('tidb')
  const c = migrationDouble({ failure: 'CREATE TABLE IF NOT EXISTS roles' })
  await assert.rejects(migrateTidb(c, catalog, async () => {}, () => {}), /DDL failure/)
  const marker = c.calls.findIndex(([sql, args]) => sql.startsWith('INSERT INTO schema_migrations_tidb') && args[0].startsWith('002'))
  const ddl = c.calls.findIndex(([sql]) => sql.includes('CREATE TABLE IF NOT EXISTS roles'))
  assert.ok(marker >= 0 && marker < ddl)
  assert.ok(!c.calls.some(([sql, args]) => sql.startsWith('UPDATE schema_migrations_tidb') && args[0].startsWith('002')))
  const partial = migrationDouble({ partial: true })
  await assert.rejects(migrateTidb(partial, catalog, async () => {}, () => {}), /parcial/)
  assert.ok(!partial.calls.some(([sql]) => sql.startsWith('CREATE')))
})

test('CHECK compara estructura sin ignorar agrupación booleana o literales', () => {
  assert.equal(normalizeCheckSql(`(${emailCheckSql})`), normalizeCheckSql(emailCheckSql))
  assert.notEqual(normalizeCheckSql(emailCheckSql.replace("'c'", "'i'")), normalizeCheckSql(emailCheckSql))
  assert.throws(() => normalizeCheckSql(emailCheckSql.replace('AND OCTET_LENGTH', 'OR OCTET_LENGTH')))
})

test('migrador completa siete versiones con ledger propio y transacciones de seeds', async () => {
  const catalog = await readMigrationCatalog('tidb')
  const c = migrationDouble()
  await migrateTidb(c, catalog, async () => {}, () => {})
  assert.equal(c.calls.filter(([sql]) => sql.startsWith('INSERT INTO schema_migrations_tidb')).length, 7)
  assert.equal(c.calls.filter(([sql]) => sql.startsWith('UPDATE schema_migrations_tidb')).length, 7)
  assert.equal(c.calls.filter(([sql]) => sql === 'COMMIT').length, 2)
  assert.equal(c.calls.filter(([sql]) => sql === 'ROLLBACK').length, 0)
  assert.ok(c.calls.some(([sql]) => sql.includes('RELEASE_LOCK')))
})

test('cada préstamo y execute/query del pool TiDB valida sesión antes de SQL', async () => {
  const calls = []
  let bad = false
  const c = { query: async s => { calls.push(s); return [[]] }, execute: async s => {
    calls.push(s)
    return s.startsWith('SHOW') ? [[{ Variable_name: 'autocommit', Value: 'ON' }, { Variable_name: 'foreign_key_checks', Value: bad ? 'OFF' : 'ON' }, { Variable_name: 'tidb_txn_mode', Value: 'pessimistic' }, { Variable_name: 'sql_mode', Value: 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY' }, { Variable_name: 'tidb_constraint_check_in_place_pessimistic', Value: 'ON' }]] : [[]]
  }, release: () => calls.push('release'), destroy: () => calls.push('destroy') }
  const pool = { getConnection: async () => c }
  installTidbSessionGuard(pool)
  await pool.execute('fixture business read')
  assert.ok(calls.indexOf('fixture business read') > calls.findIndex(s => s.startsWith('SHOW')))
  bad = true
  await assert.rejects(pool.query('must not run'), /integridad/)
  assert.ok(calls.includes('destroy')); assert.ok(!calls.includes('must not run'))
})

test('configuración impide TiDB demo/auth apagada y producción implícita', () => {
  assert.throws(() => loadConfig({ DB_ENGINE: 'tidb' }), /TiDB requiere/)
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /explícitos/)
  assert.equal(loadConfig({}).catalogSource, 'demo')
})
