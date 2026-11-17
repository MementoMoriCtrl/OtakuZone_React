import { expectedIntegrityConstraints, readMigrationCatalog, validateAppliedMigrations } from './migrationCatalog.js'
import { emailCheckSql, normalizeCheckSql } from './emailContract.js'

export const requiredEmailCollation = 'utf8mb4_0900_bin'
export function assertEmailCollation(collations, actual = requiredEmailCollation) {
  if (!collations.includes(requiredEmailCollation) || actual !== requiredEmailCollation) throw new Error('Preflight TiDB: collation de email canónico no válida.')
}
const enabled = value => ['ON', '1'].includes(String(value).toUpperCase())
const variableMap = rows => Object.fromEntries(rows.map(row => [row.Variable_name, row.Value]))

// Read-only. A future bootstrap may inspect an empty schema; runtime must not.
export async function preflightTidb(executor, databaseName, { phase = 'runtime', expectedConstraints } = {}) {
  const fail = detail => { throw new Error(`Preflight TiDB: ${detail}`) }
  if (!['runtime', 'bootstrap'].includes(phase)) fail('fase desconocida.')
  try {
    const [globalRows] = await executor.execute("SHOW GLOBAL VARIABLES WHERE Variable_name IN ('tidb_enable_check_constraint','tidb_enable_foreign_key')")
    const [sessionRows] = await executor.execute("SHOW SESSION VARIABLES WHERE Variable_name IN ('foreign_key_checks','sql_mode','time_zone','system_time_zone','tidb_txn_mode','tidb_constraint_check_in_place_pessimistic','autocommit')")
    const globals = variableMap(globalRows), session = variableMap(sessionRows)
    for (const key of ['tidb_enable_check_constraint', 'tidb_enable_foreign_key']) if (!enabled(globals[key])) fail(`${key} no está verificada como ON; no se cambian variables globales.`)
    if (!enabled(session.foreign_key_checks)) fail('foreign_key_checks debe ser ON.')
    if (session.tidb_txn_mode !== 'pessimistic') fail('se requiere tidb_txn_mode=pessimistic para los bloqueos actuales.')
    if (!enabled(session.tidb_constraint_check_in_place_pessimistic)) fail('comprobación UNIQUE pesimista inmediata no verificada.')
    if (!enabled(session.autocommit)) fail('autocommit debe estar ON antes de iniciar transacciones explícitas.')
    const modes = String(session.sql_mode ?? '').split(',')
    if (!modes.includes('ONLY_FULL_GROUP_BY') || !modes.includes('STRICT_TRANS_TABLES')) fail('sql_mode estricto y ONLY_FULL_GROUP_BY deben conservarse.')
    if (!['+00:00', 'UTC'].includes(session.time_zone) && !(session.time_zone === 'SYSTEM' && session.system_time_zone === 'UTC')) fail('zona horaria UTC no verificable.')
    const [collations] = await executor.execute('SHOW COLLATION')
    assertEmailCollation(collations.map(row => row.Collation))
    if (collations.find(row => row.Collation === requiredEmailCollation)?.Pad_attribute !== 'NO PAD') fail('NO PAD de email no verificable.')
    if (phase === 'runtime') {
      if (!databaseName) fail('base runtime no seleccionada.')
      const [tables] = await executor.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [databaseName])
      if (tables.some(row => row.name === 'schema_migrations')) fail('historial MySQL encontrado en destino TiDB.')
      if (!tables.some(row => row.name === 'schema_migrations_tidb')) fail('historial TiDB aprobado ausente; ejecutar el bootstrap mediante el migrador únicamente con autorización expresa.')
      const [columns] = await executor.execute("SELECT COLLATION_NAME AS collation, DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS maxLength, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'email'", [databaseName])
      assertEmailCollation(collations.map(row => row.Collation), columns[0]?.collation ?? null)
      if (columns.length !== 1 || columns[0].dataType !== 'varchar' || Number(columns[0].maxLength) !== 254 || columns[0].nullable !== 'NO') fail('contrato VARCHAR(254) NOT NULL de email inválido.')
      const [indexes] = await executor.execute('SHOW INDEX FROM usuarios')
      const unique = indexes.filter(row => row.Key_name === 'uq_usuarios_email')
      if (unique.length !== 1 || Number(unique[0].Non_unique) !== 0 || unique[0].Column_name !== 'email' || Number(unique[0].Seq_in_index) !== 1 || unique[0].Sub_part != null) fail('UNIQUE completo de email ausente.')
      const [constraints] = await executor.execute('SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type, ENFORCED AS enforced FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [databaseName])
      const expected = expectedConstraints ?? await expectedIntegrityConstraints('tidb')
      for (const item of expected) {
        const row = constraints.find(row => row.name === item.name && row.type === item.type)
        if (!row || row.enforced !== 'YES') fail('restricciones requeridas ausentes o enforcement no verificable.')
      }
      const [checks] = await executor.execute("SELECT CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'ck_usuarios_email_canonical'", [databaseName])
      if (checks.length !== 1 || normalizeCheckSql(checks[0].clause) !== normalizeCheckSql(emailCheckSql)) fail('cláusula CHECK canónica de email no coincide.')
      const catalog = await readMigrationCatalog('tidb')
      const [history] = await executor.execute('SELECT version, checksum, status FROM schema_migrations_tidb ORDER BY version')
      validateAppliedMigrations(catalog, history)
      if (history.length !== catalog.migrations.length) fail('historial TiDB incompleto.')
    }
    return { engine: 'tidb', phase, capabilitiesObserved: true, runtimeApproved: phase === 'runtime' }
  } catch (error) {
    if (error.message?.startsWith('Preflight TiDB:')) throw error
    fail('no se pudieron consultar variables/metadatos de solo lectura; no se considera compatible.')
  }
}
