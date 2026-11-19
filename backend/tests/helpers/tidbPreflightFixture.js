import { runtimeConstraintContract } from '../../src/db/tidbRuntimeIntegrity.js'
import { readMigrationCatalog } from '../../src/db/migrationCatalog.js'
import { requiredEmailCollation } from '../../src/db/tidbPreflight.js'

const rows = values => Object.entries(values).map(([Variable_name, Value]) => ({ Variable_name, Value }))
export function preflightFixture(overrides = {}) {
  const database = overrides.database ?? 'otakuzone_prod'
  const globals = { tidb_enable_check_constraint: 'ON', tidb_enable_foreign_key: 'ON', ...overrides.global }
  const session = { foreign_key_checks: 'ON', sql_mode: 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY', time_zone: '+00:00', system_time_zone: 'UTC', tidb_txn_mode: 'pessimistic', tidb_constraint_check_in_place_pessimistic: 'ON', autocommit: 'ON', ...overrides.session }
  const calls = []; let identityReads = 0, globalReads = 0
  return { calls, release: () => { calls.push('release') }, execute: async sql => {
    calls.push(sql)
    if (overrides.unavailable || overrides.errorAt && sql.includes(overrides.errorAt)) throw new Error('private details must never leak')
    if (/\bENFORCED\s+AS\s+enforced/i.test(sql)) throw new Error('Unknown column ENFORCED')
    const contract = await runtimeConstraintContract(database)
    if (sql.startsWith('SELECT CONNECTION_ID')) return [[{ connectionId: ++identityReads > 1 && overrides.changedConnection ? 22 : overrides.connectionId ?? 11, version: `8.0.11-TiDB-v${overrides.version ?? '8.5.3'}-serverless`, databaseName: database }]]
    if (sql.startsWith('SELECT VERSION()')) return [[{ version: '8.0.11-TiDB-v8.5.3-serverless', databaseName: database }]]
    if (sql.startsWith('SELECT TIDB_VERSION')) return [[{ tidbVersion: `Release Version: v${overrides.version ?? '8.5.3'}-serverless\nEdition: Community\nGit Commit Hash: fixture` }]]
    if (sql.includes("Variable_name = 'tidb_txn_mode'")) return [rows({ tidb_txn_mode: session.tidb_txn_mode })]
    if (sql.startsWith('SHOW GLOBAL')) return [overrides.duplicateGlobal ? [...rows(globals), ...rows(globals)] : rows(++globalReads > 1 && overrides.drift ? { ...globals, tidb_enable_foreign_key: 'OFF' } : globals)]
    if (sql.startsWith('SHOW SESSION')) return [rows(session)]
    if (sql === 'SHOW COLLATION') return [(overrides.collations ?? [requiredEmailCollation]).map(Collation => ({ Collation, Pad_attribute: 'NO PAD' }))]
    if (sql.includes('information_schema.TABLES')) return [(overrides.tables ?? ['schema_migrations_tidb']).map(name => ({ name, engine: 'InnoDB' }))]
    if (sql.includes('NUMERIC_SCALE')) return [[1, 2, 3, 4, 5, 6].map(i => ({ name: `money${i}`, field: 'precio', type: 'decimal', scale: 2 }))]
    if (sql.includes('information_schema.COLUMNS')) return [[{ collation: overrides.actualCollation ?? requiredEmailCollation, dataType: 'varchar', maxLength: 254, nullable: overrides.nullable ?? 'NO' }]]
    if (sql.startsWith('SHOW INDEX')) return [overrides.indexes ?? [{ Key_name: 'uq_usuarios_email', Non_unique: 0, Column_name: 'email', Seq_in_index: 1, Sub_part: null }]]
    if (sql.includes('TABLE_CONSTRAINTS')) return [(overrides.constraints ?? contract).filter(c => !overrides.omitCheckRows || c.type !== 'CHECK').map(c => ({ name: c.name, type: c.type, tableName: c.tableName ?? contract.find(d => d.name === c.name)?.tableName }))]
    if (sql.includes('KEY_COLUMN_USAGE')) return [contract.filter(c => c.type === 'FOREIGN KEY').flatMap(c => c.definition.columns.map((columnName, i) => ({ tableName: c.tableName, name: c.name, position: i + 1, columnName, referencedSchema: c.definition.referencedSchema, referencedTable: overrides.wrongFk ? 'wrong' : c.definition.referencedTable, referencedColumn: c.definition.referencedColumns[i], onDelete: c.definition.onDelete, onUpdate: c.definition.onUpdate })))]
    if (sql.startsWith('SHOW CREATE TABLE')) {
      const tableName = /\.`([a-z_]+)`$/.exec(sql)?.[1]
      let parts = contract.filter(c => c.tableName === tableName).map(c => {
        const disabled = overrides.constraints?.find(d => d.name === c.name)?.enforced === 'NO'
        if (c.type === 'CHECK') return `CONSTRAINT \`${c.name}\` CHECK (${c.name === 'ck_usuarios_email_canonical' && overrides.clause ? overrides.clause : c.definition.clause})${disabled || overrides.disabledCheck === c.name ? ' /*!80016 NOT ENFORCED */' : ''}`
        const d = c.definition
        return `CONSTRAINT \`${c.name}\` FOREIGN KEY (${d.columns.map(n => `\`${n}\``).join(',')}) REFERENCES \`${d.referencedTable}\` (${d.referencedColumns.map(n => `\`${n}\``).join(',')}) ON DELETE ${d.onDelete} ON UPDATE ${d.onUpdate}${disabled || overrides.invalidFk === c.name ? ' /* FOREIGN KEY INVALID */' : ''}`
      })
      if (overrides.absentDdl) parts = parts.filter(p => !p.includes(`\`${overrides.absentDdl}\``))
      if (overrides.extraCheck) parts.push('CONSTRAINT `unexpected_check` CHECK (id > 0)')
      if (overrides.omitFkDefaults) parts = parts.map(p => p.startsWith('CONSTRAINT') && p.includes('FOREIGN KEY') ? p.replace(' ON DELETE RESTRICT', '').replace(' ON UPDATE RESTRICT', '') : p)
      let ddl = `CREATE TABLE \`${tableName}\` (id bigint, PRIMARY KEY (id) /*T![clustered_index] CLUSTERED */, ${parts.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
      if (overrides.truncatedDdl) ddl = ddl.slice(0, -20)
      if (overrides.transformDdl) ddl = overrides.transformDdl(ddl, tableName)
      return [[{ Table: tableName, 'Create Table': ddl }]]
    }
    if (sql.startsWith('SELECT version')) return [overrides.history ?? (await readMigrationCatalog('tidb')).migrations.map(item => ({ version: item.file, checksum: item.checksum, status: 'applied' }))]
    throw new Error('Unexpected fixture SQL')
  } }
}
