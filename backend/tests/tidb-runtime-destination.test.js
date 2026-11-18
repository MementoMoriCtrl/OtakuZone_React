import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { loadConfig } from '../src/config/env.js'
import { createDatabasePool, checkDatabaseConnection } from '../src/db/pool.js'
import { preflightTidb } from '../src/db/tidbPreflight.js'
import { preflightFixture } from './helpers/tidbPreflightFixture.js'

const database = 'otakuzone_prod'
const environment = { DB_ENGINE: 'tidb', DB_HOST: 'fixture.example.invalid', DB_PORT: '4000', DB_SSL: 'true', DB_POOL_SIZE: '2', DB_USER: 'fixture.application', DB_PASSWORD: 'fixture-only-password' }
const original = net.Socket.prototype.connect
let attempts = 0
net.Socket.prototype.connect = function () { attempts++; throw new Error('Network forbidden') }
test.after(() => { net.Socket.prototype.connect = original; assert.equal(attempts, 0) })

for (const target of ['otakuzone_db', 'other', undefined]) test('Express and direct TiDB pool reject nonproduction target before connection: ' + target, () => {
  const env = { ...environment, DB_NAME: target, NODE_ENV: 'production', CORS_ORIGINS: 'https://frontend.example.invalid', CATALOG_SOURCE: 'mysql', AUTH_ENABLED: 'true', DB_USER: 'fixture.application', JWT_SECRET: 'test-only-'.repeat(8) }
  assert.throws(() => loadConfig(env), /otakuzone_prod/)
  assert.throws(() => createDatabasePool({ engine: 'tidb', database: target }), /otakuzone_prod/)
})

test('runtime preflight refuses historical target before leasing a connection', async () => {
  let acquired = false
  await assert.rejects(preflightTidb({ getConnection: async () => { acquired = true; throw new Error('must not acquire') } }, 'otakuzone_db'), e => e.reason === 'production-target-required')
  assert.equal(acquired, false)
})

test('configured prod rejects a connection selecting legacy before scoped metadata reads', async () => {
  const c = preflightFixture({ database: 'otakuzone_db' })
  await assert.rejects(checkDatabaseConnection(c, { expectedEngine: 'tidb', expectedDatabase: database }), /base de datos configurada/)
  assert.ok(!c.calls.some(sql => /information_schema|SHOW CREATE|SELECT version, checksum/.test(sql)))
})

test('prod FK metadata pointing to legacy is rejected, without normalizing its destination', async () => {
  const base = preflightFixture({ database })
  const c = { execute: async (sql, params) => {
    const result = await base.execute(sql, params)
    return sql.includes('KEY_COLUMN_USAGE') ? [result[0].map(row => ({ ...row, referencedSchema: 'otakuzone_db' }))] : result
  } }
  await assert.rejects(preflightTidb(c, database), e => e.reason === 'contradictory-FK-definition')
})
