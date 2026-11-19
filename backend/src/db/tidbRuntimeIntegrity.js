import { createHash } from 'node:crypto'
import { readMigrationCatalog, expectedIntegrityConstraints } from './migrationCatalog.js'
import { catalogConstraintDefinitions, inspectConstraintDeclaration, declaredConstraintNames } from './tidbEnforcementEvidence.js'
import { tidbDatabase } from './tidbDatabase.js'

export function compatibilityError(dimension, reason, source, diagnostic) {
  const suffix = diagnostic ? ` contexto ${JSON.stringify(diagnostic)}` : ''
  const error = new Error(`Preflight TiDB: ${dimension}/${reason}; fuente ${source}.${suffix}`)
  error.dimension = dimension; error.reason = reason; error.source = source
  if (diagnostic) error.diagnostic = Object.freeze({ ...diagnostic })
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
export async function runtimeConstraintContract(target) {
  const database = tidbDatabase(target)
  let catalog
  try { catalog = await readMigrationCatalog('tidb') }
  catch { throw compatibilityError('catalog', 'checksum-or-source-unavailable', 'local TiDB catalog') }
  const definitions = catalog.migrations.flatMap(m => catalogConstraintDefinitions(m.sql, database).map(d => ({ ...d, migration: m.file, checksum: m.checksum })))
  const names = await expectedIntegrityConstraints('tidb')
  if (definitions.length !== names.length || names.some(n => definitions.filter(d => d.name === n.name && d.type === n.type).length !== 1)) throw compatibilityError('catalog', 'definition-unavailable', 'local TiDB catalog')
  return definitions
}
const action = value => value === 'NO ACTION' ? 'RESTRICT' : value

export async function verifyRuntimeConstraints(connection, database, context) {
  const expected = await runtimeConstraintContract(database)
  // Identity is taken from the validated local catalog, never arbitrary remote names.
  const diagnostic = (stage, detailReason, tableName, restrictionName) => ({
    stage, detailReason,
    ...(expected.some(e => e.tableName === tableName) ? { tableName } : {}),
    ...(expected.some(e => e.tableName === tableName && e.name === restrictionName) ? { restrictionName } : {}),
  })
  const constraints = await readPreflightRows(connection, 'SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [database])
  const unexpected = constraints.find(c => ['CHECK', 'FOREIGN KEY'].includes(c.type) && !expected.some(e => e.name === c.name && e.type === c.type && e.tableName === c.tableName))
  if (unexpected) throw compatibilityError('declarative', 'unexpected-constraint', 'TABLE_CONSTRAINTS', diagnostic('constraint-metadata-inventory', 'constraint-metadata-unexpected', unexpected.tableName, unexpected.name))
  const fkRows = await readPreflightRows(connection, 'SELECT k.TABLE_NAME AS tableName, k.CONSTRAINT_NAME AS name, k.ORDINAL_POSITION AS position, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_SCHEMA AS referencedSchema, k.REFERENCED_TABLE_NAME AS referencedTable, k.REFERENCED_COLUMN_NAME AS referencedColumn, r.DELETE_RULE AS onDelete, r.UPDATE_RULE AS onUpdate FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA = ? ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION', [database])
  const definitions = new Map(), observations = []
  for (const tableName of new Set(expected.map(d => d.tableName))) {
    if (!/^[a-z_]+$/.test(tableName)) throw compatibilityError('catalog', 'table-name-invalid', 'local TiDB catalog')
    let rows
    try { rows = await readPreflightRows(connection, `SHOW CREATE TABLE \`${database}\`.\`${tableName}\``) }
    catch { throw compatibilityError('declarative', 'metadata-query-unavailable', 'SHOW CREATE TABLE', diagnostic('ddl-read', 'show-create-unavailable', tableName)) }
    if (rows.length !== 1 || typeof rows[0]['Create Table'] !== 'string') throw compatibilityError('declarative', 'definition-unknown', 'SHOW CREATE TABLE', diagnostic('ddl-read', 'show-create-result-invalid', tableName))
    const ddl = rows[0]['Create Table']
    const parseDiagnostic = {}
    const names = declaredConstraintNames(ddl, { database, tableName, declarationMode: 'runtime-v1' }, parseDiagnostic)
    const expectedNames = expected.filter(d => d.tableName === tableName).map(d => d.name)
    if (!names) throw compatibilityError('declarative', 'ddl-uninterpretable', 'SHOW CREATE TABLE', diagnostic('ddl-parse', parseDiagnostic.detailReason, tableName))
    const missing = expectedNames.filter(n => !names.includes(n))
    const additional = names.filter(n => !expectedNames.includes(n))
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
    if (names.length !== expectedNames.length || new Set(names).size !== names.length || additional.length) {
      const reason = duplicates.length ? 'constraint-inventory-duplicate' : missing.length && additional.length ? 'constraint-inventory-different' : missing.length ? 'constraint-inventory-absent' : 'constraint-inventory-additional'
      const detail = diagnostic('constraint-inventory', reason, tableName, duplicates[0] ?? missing[0])
      // Counts preserve mixed discrepancies without exposing unknown identifiers.
      Object.assign(detail, { missingCount: missing.length, additionalCount: additional.length, duplicateCount: duplicates.length })
      throw compatibilityError('declarative', reason, 'SHOW CREATE TABLE', detail)
    }
    definitions.set(tableName, ddl)
  }
  for (const item of expected) {
    const ddl = definitions.get(item.tableName)
    const parseDiagnostic = {}
    const detail = (stage, reason) => diagnostic(stage, reason, item.tableName, item.name)
    const state = inspectConstraintDeclaration(ddl, { name: item.name, type: item.type, database, tableName: item.tableName, definition: item.definition, engineVersion: context.version, declarationMode: 'runtime-v1' }, parseDiagnostic)
    const entries = constraints.filter(c => c.name === item.name)
    if (entries.length > 1 || entries.some(c => c.type !== item.type || c.tableName !== item.tableName)) throw compatibilityError('declarative', 'contradictory-metadata', 'TABLE_CONSTRAINTS', detail('constraint-metadata', 'constraint-metadata-duplicate-or-different'))
    // Some Serverless views omit CHECK rows. Only verified full DDL can establish them.
    if (item.type === 'FOREIGN KEY') {
      if (entries.length !== 1) throw compatibilityError('declarative', 'restricciones-FK-absent', 'TABLE_CONSTRAINTS', detail('constraint-metadata', 'fk-metadata-absent'))
      const rows = fkRows.filter(r => r.name === item.name).sort((a, b) => Number(a.position) - Number(b.position))
      const d = item.definition
      if (rows.length !== d.columns.length || rows.some((r, i) => r.tableName !== item.tableName || Number(r.position) !== i + 1 || r.columnName !== d.columns[i]
        || r.referencedSchema !== d.referencedSchema || r.referencedTable !== d.referencedTable || r.referencedColumn !== d.referencedColumns[i]
        || action(r.onDelete) !== d.onDelete || action(r.onUpdate) !== d.onUpdate)) throw compatibilityError('declarative', 'contradictory-FK-definition', 'KEY_COLUMN_USAGE/REFERENTIAL_CONSTRAINTS', detail('fk-reference-metadata', 'fk-reference-metadata-different'))
    }
    if (state !== true) throw compatibilityError('declarative', state === false ? 'enforcement-declaratively-disabled' : 'constraint-definition-unknown-or-different', 'SHOW CREATE TABLE', detail('constraint-definition', state === false ? 'enforcement-marker-disabled' : parseDiagnostic.detailReason))
    observations.push({ restrictionName: item.name, restrictionType: item.type, tableName: item.tableName,
      declarative: true, configuration: true, functional: 'unknown', source: 'SHOW CREATE TABLE', definitionSha256: createHash('sha256').update(ddl).digest('hex'),
      engineVersion: context.version, connectionId: context.connectionId, capturedAt: context.capturedAt, integrity: 'live-query-unattested',
      interpretationRuleVersion: 'tidb-8.5.3-runtime-markers-v1', catalogSource: item.migration, catalogChecksum: item.checksum })
  }
  return observations
}
