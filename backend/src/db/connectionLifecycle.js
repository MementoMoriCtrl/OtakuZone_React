// Uses only documented pool events and connection.destroy(). No SQL heartbeats,
// no private free-list access, and no timer can retire an acquired connection.
export function installConnectionLifetime(pool, { maxLifetimeMs = 300000, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const records = new Map()
  const clear = record => { if (record.timer !== null) cancel(record.timer); record.timer = null }
  const forget = connection => {
    const record = records.get(connection)
    if (!record) return
    clear(record)
    connection.removeListener('end', record.forget)
    connection.removeListener('error', record.forget)
    records.delete(connection)
  }
  const created = connection => {
    const record = { born: now(), idle: false, timer: null, forget: () => forget(connection) }
    records.set(connection, record)
    connection.once('end', record.forget)
    connection.once('error', record.forget)
  }
  const acquired = connection => {
    const record = records.get(connection)
    if (record) { record.idle = false; clear(record) }
  }
  const released = connection => {
    const record = records.get(connection)
    if (!record) return
    clear(record)
    record.idle = true
    const retire = () => {
      record.timer = null
      if (records.has(connection) && record.idle) { forget(connection); connection.destroy() }
    }
    const remaining = maxLifetimeMs - (now() - record.born)
    if (remaining <= 0) retire()
    else { record.timer = schedule(retire, remaining); record.timer?.unref?.() }
  }
  pool.on('connection', created)
  pool.on('acquire', acquired)
  pool.on('release', released)
  return () => {
    pool.removeListener('connection', created)
    pool.removeListener('acquire', acquired)
    pool.removeListener('release', released)
    for (const connection of records.keys()) forget(connection)
  }
}
