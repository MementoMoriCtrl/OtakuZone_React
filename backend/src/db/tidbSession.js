import { startupStage } from './startupDiagnostics.js'

const guardedPools = new WeakSet()
export const hasTidbSessionGuard = pool => guardedPools.has(pool)
// Only connection-local UTC is set. Integrity modes are required, never weakened.
export async function prepareTidbSession(connection) {
  await connection.query("SET SESSION time_zone = '+00:00'")
  const [rows] = await connection.execute("SHOW SESSION VARIABLES WHERE Variable_name IN ('foreign_key_checks','tidb_txn_mode','sql_mode','tidb_constraint_check_in_place_pessimistic','autocommit')")
  const values = Object.fromEntries(rows.map(row => [row.Variable_name, row.Value]))
  const on = value => ['ON', '1'].includes(String(value).toUpperCase())
  const modes = String(values.sql_mode ?? '').split(',')
  if (!on(values.foreign_key_checks) || !on(values.autocommit) || values.tidb_txn_mode !== 'pessimistic' || !on(values.tidb_constraint_check_in_place_pessimistic) || !modes.includes('STRICT_TRANS_TABLES') || !modes.includes('ONLY_FULL_GROUP_BY')) throw new Error('Sesión TiDB sin garantías de integridad requeridas.')
}

export function installTidbSessionGuard(pool) {
  guardedPools.add(pool)
  const acquire = pool.getConnection.bind(pool)
  pool.getConnection = async () => {
    const connection = await startupStage('mysql2-acquire', acquire)
    try { await startupStage('tidb-session', () => prepareTidbSession(connection)); return connection }
    catch (error) { connection.destroy(); throw error }
  }
  // PromisePool.execute/query otherwise acquire internally and bypass the guard.
  for (const method of ['execute', 'query']) pool[method] = async (...args) => {
    const connection = await pool.getConnection()
    try { return await connection[method](...args) }
    finally { connection.release() }
  }
}
