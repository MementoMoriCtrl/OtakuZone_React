// Synthetic evidence only. Never used to fill the real snapshot.
import { evidenceFormat, interpretationRuleVersion } from '../../src/db/tidbEnforcementEvidence.js'
export function evidenceFixture(restriction, tableName = 'pedidos', type = 'FOREIGN KEY') {
  const d = restriction
  const ids = values => values.map(value => `\`${value}\``).join(',')
  const clause = type === 'CHECK' ? `CHECK ((${d.clause}))`
    : `FOREIGN KEY (${ids(d.columns)}) REFERENCES \`${d.referencedSchema}\`.\`${d.referencedTable}\` (${ids(d.referencedColumns)}) ON DELETE ${d.onDelete} ON UPDATE ${d.onUpdate}`
  const common = {
    restrictionName: d.name, restrictionType: type, database: 'otakuzone_db', tableName,
    engineVersion: '8.5.3', versionMapping: 'public-v8.5.3', capturedAt: '2026-11-17T12:00:00.000Z',
    interpretationRuleVersion, evidenceCompleteness: 'complete',
    captureId: 'synthetic-capture-1', sessionId: 'synthetic-session-1',
  }
  return {
    format: evidenceFormat,
    declarative: [{ ...common, source: 'show-create-table', ddl: `CREATE TABLE \`${tableName}\` (\`id\` bigint, CONSTRAINT \`${d.name}\` ${clause}) ENGINE=InnoDB` }],
    configuration: [{ ...common, source: 'session-observation', scope: 'session', controlScopes: { tidb_enable_check_constraint: 'global', tidb_enable_foreign_key: 'global', foreign_key_checks: 'session' }, controls: { tidb_enable_check_constraint: true, tidb_enable_foreign_key: true, foreign_key_checks: true } }],
    functional: [],
  }
}
