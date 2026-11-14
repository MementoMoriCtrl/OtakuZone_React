import assert from 'node:assert/strict'
import { createDatabasePool } from '../src/db/pool.js'

// Fail closed before any fixture or cleanup write; never accept the development account.
export async function assertTestIsolation(config) {
  assert.equal(process.env.NODE_ENV, 'test', 'Requiere NODE_ENV=test')
  assert.match(config.database, /^otakuzone_f7_test_[a-f0-9]{12}$/)
  assert.equal(config.database, process.env.TEST_DB_NAME)
  assert.notEqual(config.database, process.env.DEVELOPMENT_DB_NAME)
  assert.match(config.user, /^ozf7_[a-f0-9]{12}$/)
  const pool = createDatabasePool(config)
  try {
    const [[identity]] = await pool.execute('SELECT DATABASE() AS db, CURRENT_USER() AS account')
    assert.equal(identity.db, config.database)
    assert.equal(identity.account.split('@')[0], config.user)
    const [grants] = await pool.execute('SHOW GRANTS FOR CURRENT_USER')
    const lines = grants.map(row => Object.values(row)[0])
    assert.ok(lines.every(line => line.startsWith('GRANT USAGE ON *.*') || line.includes(' ON `' + config.database + '`.* TO ')), 'Privilegios fuera de la base aislada')
    await assert.rejects(pool.execute('SELECT id FROM `' + process.env.DEVELOPMENT_DB_NAME.replace(/`/g, '') + '`.usuarios LIMIT 0'), error => ['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(error.code))
    console.log('PASS aislamiento: base única, cuenta restringida y acceso a desarrollo denegado')
  } finally { await pool.end() }
}
