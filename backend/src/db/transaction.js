export async function withTransaction(pool, operation) {
  const connection = await pool.getConnection()
  let started = false
  let reusable = true
  try {
    await connection.query("SET SESSION time_zone = '+00:00'")
    await connection.beginTransaction()
    started = true
    const result = await operation(connection)
    await connection.commit()
    return result
  } catch (error) {
    if (started) {
      try { await connection.rollback() }
      catch { reusable = false; connection.destroy() }
    }
    throw error
  } finally { if (reusable) connection.release() }
}
