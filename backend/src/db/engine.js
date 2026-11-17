function fail(message) { throw new Error(`Motor de base de datos no admitido: ${message}`) }
const tuple = value => value.split('.').map(Number)
export function atLeast(version, minimum) {
  const a = tuple(version), b = tuple(minimum)
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] }
  return true
}

// A compatibility banner alone is not evidence of TiDB's implementation version.
export function identifyDatabaseEngine({ version, versionComment, tidbVersion, tidbTxnMode }) {
  if (typeof version !== 'string') fail('VERSION ausente.')
  const tidb = /^(\d+\.\d+\.\d+)-TiDB-v(\d+\.\d+\.\d+)(?:-serverless)?$/.exec(version)
  if (tidb) {
    const release = /^Release Version:\s*v(\d+\.\d+\.\d+)(?:-serverless)?\s*$/m.exec(tidbVersion ?? '')
    if (!release || release[1] !== tidb[2] || !/^Edition:\s*\S.+$/m.test(tidbVersion ?? '') ||
        !['pessimistic', 'optimistic', ''].includes(tidbTxnMode)) fail('identidad TiDB no corroborada por TIDB_VERSION y tidb_txn_mode.')
    return Object.freeze({ engine: 'tidb', version: tidb[2], compatibilityVersion: tidb[1] })
  }
  // Explicitly exclude forks rather than accepting any numerically high banner.
  const mysql = /^(\d+\.\d+\.\d+)(?:-(?:log|commercial|[0-9]+ubuntu[0-9.]+))?$/.exec(version)
  if (!mysql || typeof versionComment !== 'string' ||
      !/^(?:MySQL (?:Community|Enterprise) Server\b|Ubuntu\b)/.test(versionComment)) fail('se requiere una identidad MySQL o TiDB reconocida.')
  return Object.freeze({ engine: 'mysql', version: mysql[1] })
}

export function assertEngineVersion(identity) {
  const minimum = identity.engine === 'mysql' ? '8.0.16' : identity.engine === 'tidb' ? '7.4.0' : null
  if (!minimum || !atLeast(identity.version, minimum)) fail('se requiere MySQL >=8.0.16 o TiDB estable >=7.4.0; las capacidades se comprueban por separado.')
}

export async function inspectDatabaseEngine(executor) {
  const [rows] = await executor.execute('SELECT VERSION() AS version, @@version_comment AS versionComment, DATABASE() AS databaseName, 1 AS ready')
  const row = rows[0]
  if (!row) fail('no se pudo leer VERSION.')
  let evidence = {}
  if (typeof row.version === 'string' && row.version.includes('-TiDB-')) {
    try {
      const [[detail]] = await executor.execute('SELECT TIDB_VERSION() AS tidbVersion')
      const [variables] = await executor.execute("SHOW SESSION VARIABLES WHERE Variable_name = 'tidb_txn_mode'")
      evidence = { tidbVersion: detail?.tidbVersion, tidbTxnMode: variables.find(v => v.Variable_name === 'tidb_txn_mode')?.Value }
    } catch { fail('no se pudo corroborar identidad TiDB; consultas de solo lectura fallaron.') }
  }
  const identity = identifyDatabaseEngine({ ...row, ...evidence })
  assertEngineVersion(identity)
  return { ...row, identity }
}
