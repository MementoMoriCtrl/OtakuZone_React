import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readMigrationCatalog, assertMigrationDialect, validateAppliedMigrations, sqlChecksum } from '../src/db/migrationCatalog.js'
import { migrateDatabase } from '../src/db/migrate.js'

test('SQL y manifest MySQL conservan las siete huellas de procedencia', async () => {
  const mysql = await readMigrationCatalog('mysql'), tidb = await readMigrationCatalog('tidb')
  assert.equal(mysql.migrations.length, 7); assert.equal(tidb.sources.length, 7)
  assert.deepEqual(mysql.migrations.map(m => ({ file: m.file, sha256: m.checksum })), tidb.sources)
  assert.equal(sqlChecksum('\uFEFFSELECT 1;\r\n'), sqlChecksum('SELECT 1;\n'))
})
test('no admite mezcla de dialectos ni versiones/checksums falsificados', async () => {
  const mysql = await readMigrationCatalog('mysql')
  assertMigrationDialect(mysql, 'mysql', ['schema_migrations'])
  assert.throws(() => assertMigrationDialect(mysql, 'tidb'), /mezclar/)
  assert.throws(() => assertMigrationDialect(mysql, 'mysql', ['schema_migrations_tidb']), /mezclar/)
  validateAppliedMigrations(mysql, [{ version: mysql.migrations[0].file, checksum: mysql.migrations[0].checksum }])
  assert.throws(() => validateAppliedMigrations(mysql, [{ version: mysql.migrations[0].file, checksum: 'f'.repeat(64) }]), /Checksum/)
  assert.throws(() => validateAppliedMigrations(mysql, [{ version: 'tidb_001.sql', checksum: 'f'.repeat(64) }]), /desconocidas/)
})
test('catálogo TiDB completo y guardia de destino antes de adquirir conexión', async () => {
  const tidb = await readMigrationCatalog('tidb')
  assert.equal(tidb.ledger, 'schema_migrations_tidb'); assert.equal(tidb.migrations.length, 7)
  assert.match(tidb.migrations[1].sql, /ck_usuarios_email_canonical/)
  assert.match(tidb.migrations[1].sql, /utf8mb4_0900_bin/)
  assert.notEqual(tidb.migrations[1].checksum, tidb.sources[1].sha256)
  let connected = false
  await assert.rejects(migrateDatabase({ engine: 'tidb' }, () => {}, { connect: async () => { connected = true } }), /únicamente/)
  assert.equal(connected, false)
})
test('migraciones originales mantienen UNIQUE y collation histórica de email', async () => {
  const sql = await readFile(new URL('../database/migrations/002_relational_schema.sql', import.meta.url), 'utf8')
  assert.match(sql, /email VARCHAR\(254\) COLLATE utf8mb4_0900_as_ci NOT NULL/)
  assert.match(sql, /UNIQUE KEY uq_usuarios_email \(email\)/)
})
