import { readMigrationCatalog, validateAppliedMigrations } from './migrationCatalog.js'
import { identifyDatabaseEngine, assertEngineVersion } from './engine.js'
import { compatibilityError, readPreflightRows, uniqueVariables, verifyRuntimeConstraints } from './tidbRuntimeIntegrity.js'
import { productionTidbTarget } from './tidbDatabase.js'

export const requiredEmailCollation = 'utf8mb4_0900_bin'
export function assertEmailCollation(collations, actual = requiredEmailCollation) {
  if (!collations.includes(requiredEmailCollation) || actual !== requiredEmailCollation) throw compatibilityError('declarative', 'email-collation-invalid', 'SHOW COLLATION/COLUMNS')
}
const enabled = value => ['ON', '1'].includes(String(value).toUpperCase())
const globalSql = "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('tidb_enable_check_constraint','tidb_enable_foreign_key')"
const sessionSql = "SHOW SESSION VARIABLES WHERE Variable_name IN ('foreign_key_checks','sql_mode','time_zone','system_time_zone','tidb_txn_mode','tidb_constraint_check_in_place_pessimistic','autocommit')"
const identitySql = 'SELECT CONNECTION_ID() AS connectionId, VERSION() AS version, DATABASE() AS databaseName'
const identityRow = async executor => {
  const rows = await readPreflightRows(executor, identitySql, [], 'session')
  if (rows.length !== 1 || !/^\d+$/.test(String(rows[0].connectionId))) throw compatibilityError('session', 'connection-identity-unknown', 'CONNECTION_ID')
  return { ...rows[0], connectionId: String(rows[0].connectionId) }
}

// Read-only. A future bootstrap may inspect an empty schema; runtime must not.
export async function preflightTidb(executor, databaseName, options = {}) {
  if ((options.phase ?? 'runtime') === 'runtime') {
    try { productionTidbTarget(databaseName) }
    catch { throw compatibilityError('session', 'production-target-required', 'configured database') }
  }
  let connection
  try { connection = typeof executor.getConnection === 'function' ? await executor.getConnection() : executor }
  catch { throw compatibilityError('session', 'connection-unavailable', 'connection-lease') }
  try { return await pinnedPreflight(connection, databaseName, options) }
  finally { if (connection !== executor) connection.release() }
}

async function pinnedPreflight(executor, databaseName, { phase = 'runtime' } = {}) {
  const fail = (detail, dimension = 'session') => {
    const error = new Error(`Preflight TiDB: ${detail}`)
    error.dimension = dimension; error.reason = 'required-condition-unverified'
    error.source = dimension === 'session' ? 'SHOW SESSION VARIABLES' : dimension === 'global' ? 'SHOW GLOBAL VARIABLES' : 'runtime metadata'
    throw error
  }
  if (!['runtime', 'bootstrap'].includes(phase)) fail('fase desconocida.')
  try {
    const initial = await identityRow(executor)
    const globalRows = await readPreflightRows(executor, globalSql, [], 'global')
    const sessionRows = await readPreflightRows(executor, sessionSql, [], 'session')
    const globals = uniqueVariables(globalRows, 'global'), session = uniqueVariables(sessionRows, 'session')
    const details = await readPreflightRows(executor, 'SELECT TIDB_VERSION() AS tidbVersion', [], 'identity')
    if (details.length !== 1) throw compatibilityError('identity', 'version-unknown', 'TIDB_VERSION')
    let identity
    try { identity = identifyDatabaseEngine({ version: initial.version, tidbVersion: details[0].tidbVersion, tidbTxnMode: session.tidb_txn_mode }) }
    catch { throw compatibilityError('identity', 'uncorroborated-engine-version', 'VERSION/TIDB_VERSION') }
    if (identity.engine !== 'tidb') throw compatibilityError('identity', 'wrong-engine', 'VERSION/TIDB_VERSION')
    assertEngineVersion(identity)
    if (phase === 'runtime' && identity.version !== '8.5.3') throw compatibilityError('identity', 'version-interpretation-unavailable', 'VERSION/TIDB_VERSION')
    const capturedAt = new Date().toISOString()
    let integrity = []
    for (const key of ['tidb_enable_check_constraint', 'tidb_enable_foreign_key']) if (!enabled(globals[key])) fail(`${key} no está verificada como ON; no se cambian variables globales.`, 'global')
    if (!enabled(session.foreign_key_checks)) fail('foreign_key_checks debe ser ON.')
    if (session.tidb_txn_mode !== 'pessimistic') fail('se requiere tidb_txn_mode=pessimistic para los bloqueos actuales.')
    if (!enabled(session.tidb_constraint_check_in_place_pessimistic)) fail('comprobación UNIQUE pesimista inmediata no verificada.')
    if (!enabled(session.autocommit)) fail('autocommit debe estar ON antes de iniciar transacciones explícitas.')
    const modes = String(session.sql_mode ?? '').split(',')
    if (!modes.includes('ONLY_FULL_GROUP_BY') || !modes.includes('STRICT_TRANS_TABLES')) fail('sql_mode estricto y ONLY_FULL_GROUP_BY deben conservarse.')
    if (!['+00:00', 'UTC'].includes(session.time_zone) && !(session.time_zone === 'SYSTEM' && session.system_time_zone === 'UTC')) fail('zona horaria UTC no verificable.')
    const collations = await readPreflightRows(executor, 'SHOW COLLATION')
    assertEmailCollation(collations.map(row => row.Collation))
    if (collations.find(row => row.Collation === requiredEmailCollation)?.Pad_attribute !== 'NO PAD') fail('NO PAD de email no verificable.', 'declarative')
    if (phase === 'runtime') {
      if (productionTidbTarget(databaseName) !== initial.databaseName) fail('base runtime no seleccionada o destino no verificado.')
      const tables = await readPreflightRows(executor, 'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [databaseName])
      if (tables.some(row => row.name === 'schema_migrations')) fail('historial MySQL encontrado en destino TiDB.')
      if (!tables.some(row => row.name === 'schema_migrations_tidb')) fail('historial TiDB aprobado ausente; ejecutar el bootstrap mediante el migrador únicamente con autorización expresa.')
      const columns = await readPreflightRows(executor, "SELECT COLLATION_NAME AS collation, DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS maxLength, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'email'", [databaseName])
      assertEmailCollation(collations.map(row => row.Collation), columns[0]?.collation ?? null)
      if (columns.length !== 1 || columns[0].dataType !== 'varchar' || Number(columns[0].maxLength) !== 254 || columns[0].nullable !== 'NO') fail('contrato VARCHAR(254) NOT NULL de email inválido.')
      const indexes = await readPreflightRows(executor, 'SHOW INDEX FROM usuarios')
      const unique = indexes.filter(row => row.Key_name === 'uq_usuarios_email')
      if (unique.length !== 1 || Number(unique[0].Non_unique) !== 0 || unique[0].Column_name !== 'email' || Number(unique[0].Seq_in_index) !== 1 || unique[0].Sub_part != null) fail('UNIQUE completo de email ausente.')
      integrity = await verifyRuntimeConstraints(executor, databaseName, { version: identity.version, connectionId: initial.connectionId, capturedAt })
      const catalog = await readMigrationCatalog('tidb')
      const history = await readPreflightRows(executor, 'SELECT version, checksum, status FROM schema_migrations_tidb ORDER BY version')
      try { validateAppliedMigrations(catalog, history) }
      catch { throw compatibilityError('ledger', 'invalid-history', 'schema_migrations_tidb') }
      if (history.length !== catalog.migrations.length) fail('historial TiDB incompleto.')
    }
    const final = await identityRow(executor)
    const finalGlobals = uniqueVariables(await readPreflightRows(executor, globalSql, [], 'global'), 'global')
    const finalSession = uniqueVariables(await readPreflightRows(executor, sessionSql, [], 'session'), 'session')
    if (JSON.stringify(final) !== JSON.stringify(initial)) throw compatibilityError('session', 'connection-changed', 'CONNECTION_ID/VERSION/DATABASE')
    const canonical = values => JSON.stringify(Object.keys(values).sort().map(key => [key, values[key]]))
    if (canonical(finalGlobals) !== canonical(globals) || canonical(finalSession) !== canonical(session)) throw compatibilityError('configuration', 'contradictory-observations', 'SHOW VARIABLES')
    const observation = (source, scope, values) => ({ source, scope, values: { ...values }, engineVersion: identity.version, connectionId: initial.connectionId, capturedAt, integrity: 'live-query-unattested' })
    return { engine: 'tidb', phase, capabilitiesObserved: true, runtimeApproved: phase === 'runtime', functional: 'unknown',
      constraints: integrity, configuration: { global: observation(globalSql, 'global', globals), session: observation(sessionSql, 'session', session) },
      connectionId: initial.connectionId, engineVersion: identity.version, versionBanner: initial.version,
      identityEvidence: { source: 'VERSION/TIDB_VERSION', version: initial.version, tidbVersion: details[0].tidbVersion, connectionId: initial.connectionId, capturedAt, integrity: 'live-query-unattested' },
      evidenceTrust: 'live-query-unattested' }
  } catch (error) {
    if (error.message?.startsWith('Preflight TiDB:')) throw error
    fail('no se pudieron consultar variables/metadatos de solo lectura; no se considera compatible.')
  }
}
