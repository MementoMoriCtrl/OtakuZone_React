import { createHash } from 'node:crypto'
import { readMigrationCatalog, expectedIntegrityConstraints } from './migrationCatalog.js'
import { catalogConstraintDefinitions, inspectConstraintDeclaration, declaredConstraintNames } from './tidbEnforcementEvidence.js'

export function compatibilityError(dimension, reason, source) {
  const error = new Error(`Preflight TiDB: ${dimension}/${reason}; fuente ${source}.`)
  error.dimension = dimension; error.reason = reason; error.source = source
  return error
}
export async function readPreflightRows(connection, sql, params = [], dimension = 'declarative') {
  try {
    const result = await connection.execute(sql, params)
    if (!Array.isArray(result?.[0]) || result[0].some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('rows unavailable')
    return result[0]
  } catch { throw compatibilityError(dimension, 'metadata-query-unavailable', sql.startsWith('SHOW CREATE') ? 'SHOW CREATE TABLE' : sql.split(' ').slice(0, 3).join(' ')) }
}
export function uniqueVariables(rows, scope) {
  const values = Object.create(null)
  for (const row of rows) {
    if (!row || typeof row.Variable_name !== 'string' || Object.hasOwn(values, row.Variable_name)) throw compatibilityError(scope, 'contradictory-or-duplicate-variable', 'SHOW VARIABLES')
    values[row.Variable_name] = row.Value
  }
  return values
}
export async function runtimeConstraintContract() {
  let catalog
  try { catalog = await readMigrationCatalog('tidb') }
  catch { throw compatibilityError('catalog', 'checksum-or-source-unavailable', 'local TiDB catalog') }
  const definitions = catalog.migrations.flatMap(m => catalogConstraintDefinitions(m.sql).map(d => ({ ...d, migration: m.file, checksum: m.checksum })))
  const names = await expectedIntegrityConstraints('tidb')
  if (definitions.length !== names.length || names.some(n => definitions.filter(d => d.name === n.name && d.type === n.type).length !== 1)) throw compatibilityError('catalog', 'definition-unavailable', 'local TiDB catalog')
  return definitions
}
const action = value => value === 'NO ACTION' ? 'RESTRICT' : value

export async function verifyRuntimeConstraints(connection, database, context) {
  const expected = await runtimeConstraintContract()
  const constraints = await readPreflightRows(connection, 'SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [database])
  if (constraints.some(c => ['CHECK', 'FOREIGN KEY'].includes(c.type) && !expected.some(e => e.name === c.name && e.type === c.type && e.tableName === c.tableName))) throw compatibilityError('declarative', 'unexpected-constraint', 'TABLE_CONSTRAINTS')
  const fkRows = await readPreflightRows(connection, 'SELECT k.TABLE_NAME AS tableName, k.CONSTRAINT_NAME AS name, k.ORDINAL_POSITION AS position, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_SCHEMA AS referencedSchema, k.REFERENCED_TABLE_NAME AS referencedTable, k.REFERENCED_COLUMN_NAME AS referencedColumn, r.DELETE_RULE AS onDelete, r.UPDATE_RULE AS onUpdate FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA = ? ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION', [database])
  const definitions = new Map(), observations = []
  for (const tableName of new Set(expected.map(d => d.tableName))) {
    if (!/^[a-z_]+$/.test(tableName)) throw compatibilityError('catalog', 'table-name-invalid', 'local TiDB catalog')
    const rows = await readPreflightRows(connection, `SHOW CREATE TABLE \`${database}\`.\`${tableName}\``)
    if (rows.length !== 1 || typeof rows[0]['Create Table'] !== 'string') throw compatibilityError('declarative', 'definition-unknown', 'SHOW CREATE TABLE')
    const ddl = rows[0]['Create Table']
    const names = declaredConstraintNames(ddl, { database, tableName, declarationMode: 'runtime-v1' })
    const expectedNames = expected.filter(d => d.tableName === tableName).map(d => d.name)
    if (!names || names.length !== expectedNames.length || new Set(names).size !== names.length || names.some(n => !expectedNames.includes(n))) throw compatibilityError('declarative', 'restricciones-definition-unknown-or-absent', 'SHOW CREATE TABLE')
    definitions.set(tableName, ddl)
  }
  for (const item of expected) {
    const ddl = definitions.get(item.tableName)
    const state = inspectConstraintDeclaration(ddl, { name: item.name, type: item.type, database, tableName: item.tableName, definition: item.definition, engineVersion: context.version, declarationMode: 'runtime-v1' })
    const entries = constraints.filter(c => c.name === item.name)
    if (entries.length > 1 || entries.some(c => c.type !== item.type || c.tableName !== item.tableName)) throw compatibilityError('declarative', 'contradictory-metadata', 'TABLE_CONSTRAINTS')
    // Some Serverless views omit CHECK rows. Only verified full DDL can establish them.
    if (item.type === 'FOREIGN KEY') {
      if (entries.length !== 1) throw compatibilityError('declarative', 'restricciones-FK-absent', 'TABLE_CONSTRAINTS')
      const rows = fkRows.filter(r => r.name === item.name).sort((a, b) => Number(a.position) - Number(b.position))
      const d = item.definition
      if (rows.length !== d.columns.length || rows.some((r, i) => r.tableName !== item.tableName || Number(r.position) !== i + 1 || r.columnName !== d.columns[i]
        || r.referencedSchema !== d.referencedSchema || r.referencedTable !== d.referencedTable || r.referencedColumn !== d.referencedColumns[i]
        || action(r.onDelete) !== d.onDelete || action(r.onUpdate) !== d.onUpdate)) throw compatibilityError('declarative', 'contradictory-FK-definition', 'KEY_COLUMN_USAGE/REFERENTIAL_CONSTRAINTS')
    }
    if (state !== true) throw compatibilityError('declarative', state === false ? 'enforcement-declaratively-disabled' : 'restricciones-definition-unknown-or-absent', 'SHOW CREATE TABLE')
    observations.push({ restrictionName: item.name, restrictionType: item.type, tableName: item.tableName,
      declarative: true, configuration: true, functional: 'unknown', source: 'SHOW CREATE TABLE', definitionSha256: createHash('sha256').update(ddl).digest('hex'),
      engineVersion: context.version, connectionId: context.connectionId, capturedAt: context.capturedAt, integrity: 'live-query-unattested',
      interpretationRuleVersion: 'tidb-8.5.3-runtime-markers-v1', catalogSource: item.migration, catalogChecksum: item.checksum })
  }
  return observations
}
