import mysql from 'mysql2/promise'
import { lstat, mkdtemp, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadDatabaseConfig } from '../src/config/database.js'
import { declaredConstraintNames } from '../src/db/tidbEnforcementEvidence.js'

const flags = Object.freeze({ readyForRemoteExecution: false, ledgerTransitionAllowed: false, allow007: false })
const fail = code => { throw Object.assign(new Error(code), { captureCode: code }) }
const safeError = error => ({ code: error.captureCode ?? 'CAPTURE_FAILED', driverCode: /^ER_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : undefined })
const globals = ['tidb_enable_check_constraint', 'tidb_enable_foreign_key']
const sessions = ['foreign_key_checks', 'sql_mode', 'time_zone', 'system_time_zone', 'tidb_txn_mode', 'tidb_constraint_check_in_place_pessimistic', 'autocommit']
const on = value => ['ON', '1'].includes(String(value).toUpperCase())
function controls(rows, names) {
  if (rows.length !== names.length || new Set(rows.map(r => r.Variable_name)).size !== names.length || rows.some(r => !names.includes(r.Variable_name) || typeof r.Value !== 'string')) fail('CONTROLS_INCOMPLETE')
  return Object.fromEntries(rows.map(r => [r.Variable_name, r.Value]).sort(([a], [b]) => a.localeCompare(b)))
}
function validate(index, rows, results) {
  if (!Array.isArray(rows)) fail('ROWS_INVALID')
  if (index === 0 || index === 7) {
    const r = rows[0]
    if (rows.length !== 1 || !r || typeof r.session_id !== 'string' || !/^\d+$/.test(r.session_id) || r.selected_database !== 'otakuzone_db' || !/TiDB-v8\.5\.3(?:-|$)/.test(r.version) || !/8\.5\.3/.test(r.tidb_version) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(r.captured_at_utc)) fail('IDENTITY_INVALID')
    if (index === 7 && ['session_id', 'selected_database', 'version', 'tidb_version'].some(k => r[k] !== results[0].rows[0][k])) fail('IDENTITY_CHANGED')
    if (index === 7 && r.captured_at_utc < results[0].rows[0].captured_at_utc) fail('CLOCK_REGRESSED')
  }
  if ([1, 2, 8, 9].includes(index)) {
    const c = controls(rows, [1, 8].includes(index) ? globals : sessions)
    if ([1, 8].includes(index) ? globals.some(k => !on(c[k])) : !on(c.foreign_key_checks) || !on(c.autocommit) || !on(c.tidb_constraint_check_in_place_pessimistic) || c.tidb_txn_mode !== 'pessimistic' || !['STRICT_TRANS_TABLES', 'ONLY_FULL_GROUP_BY'].every(m => c.sql_mode.split(',').includes(m)) || !(c.time_zone === '+00:00' || (c.time_zone === 'SYSTEM' && c.system_time_zone === 'UTC'))) fail('CONTROLS_DISABLED')
    if (index >= 8 && JSON.stringify(c) !== JSON.stringify(controls(results[index - 7].rows, index === 8 ? globals : sessions))) fail('CONTROLS_CHANGED')
  }
  if (index === 3) {
    const names = ['usuario_id', 'estado', 'moneda', 'costo_envio', 'creado_en']
    if (rows.length !== 5 || new Set(rows.map(r => r.COLUMN_NAME)).size !== 5 || rows.some(r => r.TABLE_NAME !== 'pedidos' || !names.includes(r.COLUMN_NAME))) fail('COLUMNS_INCOMPLETE')
    for (const r of rows) for (const [key, prefix] of [['COLUMN_DEFAULT', 'default'], ['EXTRA', 'extra']]) {
      const value = r[key]
      if (![0, 1].includes(r[prefix + '_is_null']) || (value === null ? r[prefix + '_is_null'] !== 1 || r[prefix + '_octets'] !== null || r[prefix + '_hex'] !== null : typeof value !== 'string' || r[prefix + '_is_null'] !== 0 || Buffer.byteLength(value) !== Number(r[prefix + '_octets']) || Buffer.from(value).toString('hex').toUpperCase() !== r[prefix + '_hex'])) fail('COLUMN_REPRESENTATION_INVALID')
    }
  }
  if (index === 4 || index === 5) {
    const table = index === 4 ? 'pedidos' : 'carritos'
    const ddl = rows[0]?.['Create Table']
    if (rows.length !== 1 || rows[0].Table !== table || typeof ddl !== 'string') fail('DDL_INCOMPLETE')
    const names = declaredConstraintNames(ddl, { database: 'otakuzone_db', tableName: table, declarationMode: 'runtime-v1' })
    const expected = table === 'pedidos' ? ['ck_pedidos_moneda', 'ck_pedidos_envio', 'fk_pedidos_usuario'] : ['fk_carritos_usuario']
    if (!names || names.length !== expected.length || new Set(names).size !== names.length || expected.some(n => !names.includes(n))) fail('DDL_INCOMPLETE')
    // Reuses conservative syntax checks. Predicate/enforcement approval stays offline.
  }
  if (index === 6) {
    if (rows.length !== 2 || new Set(rows.map(r => r.TABLE_NAME)).size !== 2 || rows.some(r => !['pedidos', 'carritos'].includes(r.TABLE_NAME) || r.CONSTRAINT_NAME !== 'fk_' + r.TABLE_NAME + '_usuario' || Number(r.ORDINAL_POSITION) !== 1 || r.COLUMN_NAME !== 'usuario_id' || r.REFERENCED_TABLE_SCHEMA !== 'otakuzone_db' || r.REFERENCED_TABLE_NAME !== 'usuarios' || r.REFERENCED_COLUMN_NAME !== 'id' || r.DELETE_RULE !== 'RESTRICT' || r.UPDATE_RULE !== 'RESTRICT')) fail('FK_MISMATCH')
  }
}

export async function captureMetadata({ environment = process.env, createConnection = mysql.createConnection, save } = {}) {
  if (environment.TIDB_METADATA_CAPTURE_ENABLED !== 'true') fail('CAPTURE_DISABLED')
  if (environment.DB_ENGINE !== 'tidb' || environment.DB_NAME !== 'otakuzone_db' || environment.DB_SSL !== 'true' || environment.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('TARGET_OR_TLS_INVALID')
  let config
  try { config = loadDatabaseConfig(environment, { context: 'migration' }) } catch { fail('CONFIG_INVALID') }
  if (typeof save !== 'function') fail('PRIVATE_SINK_REQUIRED')
  const report = { format: 'otakuzone-tidb-metadata-capture-v1', ...flags, status: 'partial', client: { node: process.version, driver: 'mysql2/3.24.6' }, dedicatedConnection: true, results: [], openedAt: new Date().toISOString() }
  let connection
  try {
    await save('opening.json', report)
    connection = await createConnection({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, ssl: { rejectUnauthorized: true, verifyIdentity: true, ...(config.sslCa ? { ca: config.sslCa } : {}) }, multipleStatements: false, connectTimeout: config.connectTimeout, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
    for (const [index, sql] of queries.entries()) {
      const item = { id: 'Q' + (index + 1), sql }
      await save(item.id + '-intent.json', item)
      try {
        const [rows, fields] = await connection.query(sql)
        item.rows = rows
        item.fields = fields.map(f => ({ name: f.name, columnType: f.columnType, flags: f.flags, characterSet: f.characterSet }))
        await save(item.id + '.json', item)
        validate(index, rows, report.results)
        report.results.push(item)
      } catch (error) {
        item.error = safeError(error)
        report.results.push(item)
        await save(item.id + '-error.json', { id: item.id, sql, error: item.error })
        throw error
      }
    }
    report.status = 'captured-awaiting-review'
  } catch (error) { report.error = safeError(error) }
  finally {
    if (connection) {
      try { await connection.end() } catch { connection.destroy(); report.error = { code: 'CLOSE_FAILED' }; report.status = 'partial' }
    }
    report.closedAt = new Date().toISOString()
    await save('report.json', report)
  }
  return report
}

export async function privateSink(root) {
  if (!root) fail('OUTPUT_REQUIRED')
  const stat = await lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('OUTPUT_NOT_PRIVATE')
  const dir = await mkdtemp(join(resolve(root), 'tidb-capture-'))
  if (process.platform === 'win32') {
    // chmod does not secure Windows ACLs. Restrict this NEW directory before
    // writing any evidence; neither root permissions nor credentials change.
    try {
      const { stdout } = await promisify(execFile)('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true })
      const sid = stdout.match(/S-1-(?:\d+-)*\d+/)?.[0]
      if (!sid) fail('OUTPUT_ACL_FAILED')
      await promisify(execFile)('icacls.exe', [dir, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'], { windowsHide: true })
    } catch { fail('OUTPUT_ACL_FAILED') }
  }
  const hashes = {}
  return async (name, value) => {
    if (!/^(?:opening|report|Q(?:[1-9]|10)(?:-intent|-error)?)\.json$/.test(name)) fail('OUTPUT_NAME_INVALID')
    const text = JSON.stringify(value, null, 2) + '\n'
    await writeFile(join(dir, name), text, { mode: 0o600, flag: 'wx' })
    hashes[name] = createHash('sha256').update(text).digest('hex')
    // Append-only individual digests avoid a mutable/self-referential manifest.
    await writeFile(join(dir, name + '.sha256'), hashes[name] + '\n', { mode: 0o600, flag: 'wx' })
  }
}

async function main() {
  try {
    if (process.argv.length !== 2) fail('ARGUMENTS_FORBIDDEN')
    if (process.env.TIDB_METADATA_CAPTURE_ENABLED !== 'true') fail('CAPTURE_DISABLED')
    if (process.env.TIDB_METADATA_CAPTURE_PRIVATE_DIRECTORY_CONFIRMED !== 'true') fail('PRIVATE_DIRECTORY_REQUIRED')
    const save = await privateSink(process.env.TIDB_METADATA_CAPTURE_OUTPUT_DIR)
    const report = await captureMetadata({ save })
    console.log(JSON.stringify({ status: report.status, ...flags }))
    if (report.error) process.exitCode = 1
  } catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()

export const queries = Object.freeze([
  "SELECT CAST(CONNECTION_ID() AS CHAR) AS session_id,\n       VERSION() AS version,\n       TIDB_VERSION() AS tidb_version,\n       DATABASE() AS selected_database,\n       CAST(UTC_TIMESTAMP(3) AS CHAR) AS captured_at_utc;",
  "SHOW GLOBAL VARIABLES\nWHERE Variable_name IN (\n  'tidb_enable_check_constraint',\n  'tidb_enable_foreign_key'\n);",
  "SHOW SESSION VARIABLES\nWHERE Variable_name IN (\n  'foreign_key_checks',\n  'sql_mode',\n  'time_zone',\n  'system_time_zone',\n  'tidb_txn_mode',\n  'tidb_constraint_check_in_place_pessimistic',\n  'autocommit'\n);",
  "SELECT TABLE_NAME, COLUMN_NAME,\n       COLUMN_DEFAULT,\n       COLUMN_DEFAULT IS NULL AS default_is_null,\n       OCTET_LENGTH(COLUMN_DEFAULT) AS default_octets,\n       HEX(COLUMN_DEFAULT) AS default_hex,\n       EXTRA,\n       EXTRA IS NULL AS extra_is_null,\n       OCTET_LENGTH(EXTRA) AS extra_octets,\n       HEX(EXTRA) AS extra_hex\nFROM information_schema.COLUMNS\nWHERE TABLE_SCHEMA = 'otakuzone_db'\n  AND TABLE_NAME = 'pedidos'\n  AND COLUMN_NAME IN (\n    'usuario_id', 'estado', 'moneda', 'costo_envio', 'creado_en'\n  )\nORDER BY ORDINAL_POSITION;",
  "SHOW CREATE TABLE otakuzone_db.pedidos;",
  "SHOW CREATE TABLE otakuzone_db.carritos;",
  "SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION,\n       k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA,\n       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,\n       r.DELETE_RULE, r.UPDATE_RULE\nFROM information_schema.KEY_COLUMN_USAGE AS k\nJOIN information_schema.REFERENTIAL_CONSTRAINTS AS r\n  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA\n AND r.TABLE_NAME = k.TABLE_NAME\n AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME\nWHERE k.TABLE_SCHEMA = 'otakuzone_db'\n  AND k.TABLE_NAME IN ('pedidos', 'carritos')\n  AND k.REFERENCED_TABLE_NAME IS NOT NULL\nORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;",
  "SELECT CAST(CONNECTION_ID() AS CHAR) AS session_id,\n       VERSION() AS version,\n       TIDB_VERSION() AS tidb_version,\n       DATABASE() AS selected_database,\n       CAST(UTC_TIMESTAMP(3) AS CHAR) AS captured_at_utc;",
  "SHOW GLOBAL VARIABLES\nWHERE Variable_name IN (\n  'tidb_enable_check_constraint',\n  'tidb_enable_foreign_key'\n);",
  "SHOW SESSION VARIABLES\nWHERE Variable_name IN (\n  'foreign_key_checks',\n  'sql_mode',\n  'time_zone',\n  'system_time_zone',\n  'tidb_txn_mode',\n  'tidb_constraint_check_in_place_pessimistic',\n  'autocommit'\n);"
])
