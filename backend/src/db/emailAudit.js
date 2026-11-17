import { normalizeAsciiEmail } from '../domain/emailPolicy.js'
import { normalizeEmail } from '../validators/email.js'
import { readMigrationCatalog, validateAppliedMigrations } from './migrationCatalog.js'

// Pure aggregation: never return addresses, IDs, canonical keys or hashes of PII.
export function summarizeEmailRows(rows) {
  const result = { total: rows.length, nonAscii: 0, uppercase: 0, outerWhitespace: 0, invalidAsciiContract: 0, canonicalChanged: 0 }
  const canonical = new Map(), lowercase = new Map()
  for (const { email } of rows) {
    if (/[A-Z]/.test(email)) result.uppercase++
    if (typeof email === 'string' && email !== email.trim()) result.outerWhitespace++
    let normalized
    try { normalized = normalizeAsciiEmail(email) } catch { result.nonAscii++ }
    try { normalizeEmail(email) } catch { result.invalidAsciiContract++ }
    if (normalized !== undefined) {
      if (normalized !== email) result.canonicalChanged++
      canonical.set(normalized, (canonical.get(normalized) ?? 0) + 1)
      const lower = email.toLowerCase()
      lowercase.set(lower, (lowercase.get(lower) ?? 0) + 1)
    }
  }
  const duplicateSizes = [...canonical.values()].filter(size => size > 1)
  return { ...result, canonicalDuplicateGroups: duplicateSizes.length, canonicalDuplicateRows: duplicateSizes.reduce((sum, size) => sum + size, 0), lowercaseCollisionGroups: [...lowercase.values()].filter(size => size > 1).length }
}

// Fixtures only. This is a finite comparison, not a proof of all collation rules.
export const emailComparisonFixtures = [
  { name: 'case', a: 'USER@example.com', b: 'user@example.com' },
  { name: 'outer-space', a: ' user@example.com ', b: 'user@example.com' },
  { name: 'trailing-space', a: 'user@example.com ', b: 'user@example.com' },
  { name: 'accent-invalid', a: 'jose@example.com', b: 'jos\u00e9@example.com' },
  { name: 'width-invalid', a: 'user@example.com', b: '\uff55ser@example.com' },
  { name: 'dot', a: 'a.b@example.com', b: 'ab@example.com' },
  { name: 'plus', a: 'user+tag@example.com', b: 'user@example.com' },
  { name: 'punycode-ascii', a: 'USER@XN--XAMPLE-9UA.COM', b: 'user@xn--xample-9ua.com' },
]

export async function auditEmailData(connection) {
  const [columns] = await connection.execute("SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='email'")
  if (columns.length !== 1 || columns[0].type !== 'varchar(254)' || columns[0].collation !== 'utf8mb4_0900_as_ci') throw new Error('Esquema email inesperado; auditoría detenida.')
  const [indexes] = await connection.query('SHOW INDEX FROM usuarios')
  const unique = indexes.filter(row => row.Key_name === 'uq_usuarios_email')
  if (unique.length !== 1 || Number(unique[0].Non_unique) !== 0 || unique[0].Column_name !== 'email' || unique[0].Sub_part != null) throw new Error('Índice UNIQUE email inesperado; auditoría detenida.')
  const [[count]] = await connection.execute('SELECT COUNT(*) AS total FROM usuarios')
  if (Number(count.total) > 100000) throw new Error('Auditoría requiere paginación revisada para este volumen.')
  const [rows] = await connection.execute('SELECT email FROM usuarios')
  if (rows.length !== Number(count.total)) throw new Error('Snapshot de auditoría inconsistente.')
  const result = { counts: summarizeEmailRows(rows), emailColumn: columns[0], uniqueIndex: 'uq_usuarios_email' }
  const [[padding]] = await connection.execute("SELECT PAD_ATTRIBUTE AS padding FROM information_schema.COLLATIONS WHERE COLLATION_NAME='utf8mb4_0900_as_ci'")
  result.padding = padding?.padding
  try {
    const [history] = await connection.execute('SELECT version,checksum FROM schema_migrations ORDER BY version')
    const catalog = await readMigrationCatalog('mysql')
    validateAppliedMigrations(catalog, history)
    result.history = { checksumMatch: true, applied: history.length, expected: catalog.migrations.length }
  } catch { result.history = { checksumMatch: false, reason: 'Historial no verificable; requiere revisión de solo lectura.' } }
  result.comparisons = []
  for (const { name, a, b } of emailComparisonFixtures) {
    const [[comparison]] = await connection.execute('SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_as_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_as_ci AS mysqlEqual', [a, b])
    let canonicalEqual = null
    try { canonicalEqual = normalizeEmail(a) === normalizeEmail(b) } catch { /* Outside approved ASCII/format contract. */ }
    result.comparisons.push({ case: name, mysqlEqual: Boolean(comparison.mysqlEqual), canonicalEqual })
  }
  return result
}
