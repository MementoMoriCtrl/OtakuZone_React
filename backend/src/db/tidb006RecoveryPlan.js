import { createHash } from 'node:crypto'
import { assertTypedColumn, validateTypedSnapshotColumns, columnAttributeFormat, nonTextRuleVersion } from './columnAttributeContract.js'
import { readMigrationCatalog, validateAppliedMigrations } from './migrationCatalog.js'
import { requireEnforcementEvidence, evidenceFormat, interpretationRuleVersion } from './tidbEnforcementEvidence.js'

// Offline planner only: no mysql2, sockets, executor, environment or ledger writer.
const sourceChecksum = '2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e'
const fail = object => { throw new Error(`Plan 006 bloqueado: ${object}.`) }
const hash = value => createHash('sha256').update(value).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const column = (type, nullable = false, charset = null, collation = null, defaultValue = null, extra = '') => ({ type, nullable, charset, collation, default: defaultValue, extra, generationExpression: '' })
const part = name => ({ name, prefix: null, order: 'ASC', expression: null })
const index = (name, names, unique = false) => ({ name, unique, type: 'BTREE', visible: true, columns: names.map(part) })
const fk = (name, columns, referencedTable, referencedColumns) => ({ name, columns, referencedSchema: 'otakuzone_db', referencedTable, referencedColumns, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
const states = "enum('pendiente','confirmado','cancelado','completado')"
const baseColumns = {
  id: column('bigint unsigned', false, null, null, null, 'auto_increment'),
  usuario_id: column('bigint unsigned'),
  estado: column(states, false, 'utf8mb4', 'utf8mb4_0900_ai_ci', 'pendiente'),
  moneda: column('char(3)', false, 'ascii', 'ascii_bin', 'PEN'),
  costo_envio: column('decimal(10,2)', false, null, null, '0.00'),
  creado_en: column('timestamp(3)', false, null, null, 'CURRENT_TIMESTAMP(3)'),
}
const addedColumns = {
  carrito_origen_id: column('bigint unsigned', true),
  clave_solicitud: column('char(36)', true, 'ascii', 'ascii_bin'),
}
const baseIndexes = [index('PRIMARY', ['id'], true), index('ix_pedidos_usuario_fecha', ['usuario_id', 'creado_en']), index('ix_pedidos_estado_fecha', ['estado', 'creado_en'])]
const newIndexes = [index('uq_pedidos_carrito', ['carrito_origen_id'], true), index('uq_pedidos_solicitud', ['usuario_id', 'clave_solicitud'], true)]
const cartFk = fk('fk_pedidos_carrito', ['carrito_origen_id'], 'carritos', ['id'])
const historyDefinition = {
  tableType: 'BASE TABLE', engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci',
  columns: { id: column('bigint unsigned', false, null, null, null, 'auto_increment'), pedido_id: column('bigint unsigned'), estado: column(states, false, 'utf8mb4', 'utf8mb4_0900_ai_ci'), creado_en: column('timestamp(3)', false, null, null, 'CURRENT_TIMESTAMP(3)') },
  indexes: [index('PRIMARY', ['id'], true), index('ix_historial_pedido_fecha', ['pedido_id', 'creado_en', 'id'])],
  foreignKeys: [fk('fk_historial_pedido', ['pedido_id'], 'pedidos', ['id'])], checks: [], triggers: [],
}

// Serialisable canonical snapshot contract. Clone prevents callers mutating defaults.
export function tidb006Contract() {
  return structuredClone({ snapshotFormat: 'otakuzone-tidb006-snapshot-v3', supportedSnapshotFormats: ['otakuzone-tidb006-snapshot-v2', 'otakuzone-tidb006-snapshot-v3'], columnAttributeFormat, approvedColumnRules: [nonTextRuleVersion], evidenceFormat, interpretationRuleVersion, evidenceContextFields: ['captureId', 'sessionId', 'engineVersion', 'versionMapping'], baseColumns, addedColumns, baseIndexes, newIndexes, cartFk, historyDefinition })
}

function assertColumn(actual, expected, name, typedPolicy) {
  if (typedPolicy) return assertTypedColumn(actual, expected, name, typedPolicy)
  if (!actual || Object.keys(expected).some(key => !same(actual[key], expected[key]))) fail(`columna incompatible o no observable: ${name}`)
}
function metadata(table, name) {
  if (!table || table.tableType !== 'BASE TABLE' || table.engine !== 'InnoDB' || table.charset !== 'utf8mb4' || table.collation !== 'utf8mb4_0900_ai_ci') fail(`tabla incompatible: ${name}`)
  for (const key of ['indexes', 'foreignKeys', 'checks', 'triggers']) if (!Array.isArray(table[key])) fail(`metadatos incompletos: ${name}.${key}`)
  if (!table.columns || typeof table.columns !== 'object') fail(`columnas ausentes: ${name}`)
  if (table.triggers.length) fail(`triggers no previstos: ${name}`)
  for (const key of ['indexes', 'foreignKeys', 'checks']) {
    if (new Set(table[key].map(item => item.name)).size !== table[key].length) fail(`nombres duplicados: ${name}.${key}`)
  }
}
function definition(actual, expected, label) {
  return actual && Object.keys(expected).every(key => same(actual[key], expected[key])) ? true : fail(`definición incompatible: ${label}`)
}
function inspectIndex(table, expected) {
  const found = table.indexes.find(item => item.name === expected.name)
  if (found) { definition(found, expected, expected.name); return true }
  if (table.indexes.some(item => same(item.columns?.map(p => p.name), expected.columns.map(p => p.name)))) fail(`índice equivalente o conflictivo con otro nombre: ${expected.name}`)
  return false
}
function restrictionEvidence(actual, expected, tableName, type, context) {
  if (Object.hasOwn(actual, 'enforced')) fail('booleano enforced legado no permitido en v2')
  return requireEnforcementEvidence(actual.enforcementEvidence, { name: expected.name, type, database: 'otakuzone_db', tableName, definition: expected, captureId: context.captureId, sessionId: context.sessionId, engineVersion: context.engineVersion, versionMapping: context.versionMapping })
}
function inspectFk(table, expected, tableName, context) {
  const found = table.foreignKeys.find(item => item.name === expected.name)
  if (found) { definition(found, expected, expected.name); restrictionEvidence(found, expected, tableName, 'FOREIGN KEY', context); return true }
  if (table.foreignKeys.some(item => same(item.columns, expected.columns))) fail(`FK equivalente o conflictiva con otro nombre: ${expected.name}`)
  return false
}
function count(data, name) {
  const value = data?.[name]
  if (!Number.isSafeInteger(value) || value < 0) fail(`recuento no observable: ${name}`)
  return value
}
function zero(data, name) { if (count(data, name) !== 0) fail(`conflictos de datos: ${name}`) }

export async function planTidb006Recovery(snapshot) {
  const catalog = await readMigrationCatalog('tidb')
  const source = catalog.migrations.find(item => item.file === '006_commerce.sql')
  if (source?.checksum !== sourceChecksum) fail('fuente 006 histórica no reconocida')
  if (!['otakuzone-tidb006-snapshot-v2', 'otakuzone-tidb006-snapshot-v3'].includes(snapshot?.format) || snapshot.engine !== 'tidb' || snapshot.database !== 'otakuzone_db' || snapshot.metadataComplete !== true) fail('snapshot incompleto o destino/motor inválido')
  const typedPolicy = snapshot.format === 'otakuzone-tidb006-snapshot-v3' ? { approvedRules: snapshot.columnRules } : null
  if (typedPolicy) validateTypedSnapshotColumns(snapshot)
  const context = snapshot.evidenceContext
  if (!context || ['captureId', 'sessionId', 'engineVersion', 'versionMapping'].some(key => typeof context[key] !== 'string' || !context[key].trim())) fail('contexto de captura/sesión ausente')
  if (!Array.isArray(snapshot.ledger) || snapshot.ledger.length !== 6) fail('se requiere prefijo 001–005 y un único intento 006')
  // Existing validator checks the real applied prefix; never pretend 006 is applied.
  const prefix = snapshot.ledger.filter(row => row.version !== source.file)
  if (prefix.length !== 5) fail('prefijo aplicado incorrecto')
  validateAppliedMigrations(catalog, prefix)
  const attempt = snapshot.ledger.find(row => row.version === source.file)
  if (attempt?.status !== 'applying' || attempt.checksum !== sourceChecksum || attempt.applied_at !== null) fail('intento 006 no coincide con applying original')
  for (const row of prefix) if (typeof row.applied_at !== 'string' || !row.applied_at) fail('fecha aplicada no observable')
  const tables = snapshot.tables
  if (!tables || Object.hasOwn(tables, 'schema_migrations') || Object.hasOwn(tables, 'movimientos_inventario')) fail('historial MySQL o avance hacia 007 no permitido')
  const orders = tables.pedidos
  metadata(orders, 'pedidos')
  for (const [name, expected] of Object.entries(baseColumns)) assertColumn(orders.columns[name], expected, `pedidos.${name}`, typedPolicy)
  if (Object.keys(orders.columns).some(name => !Object.hasOwn(baseColumns, name) && !Object.hasOwn(addedColumns, name))) fail('columnas de pedidos no previstas')
  for (const idx of baseIndexes) if (!inspectIndex(orders, idx)) fail(`índice original ausente: ${idx.name}`)
  const userFk = fk('fk_pedidos_usuario', ['usuario_id'], 'usuarios', ['id'])
  if (!inspectFk(orders, userFk, 'pedidos', context)) fail('FK original ausente')
  if (orders.foreignKeys.some(item => ![userFk.name, cartFk.name].includes(item.name))) fail('FK de pedidos no prevista')
  const checks = [{ name: 'ck_pedidos_moneda', clause: "moneda = 'PEN'" }, { name: 'ck_pedidos_envio', clause: 'costo_envio >= 0' }]
  if (orders.checks.length !== checks.length) fail('CHECK originales no coinciden')
  for (const expected of checks) {
    const actual = orders.checks.find(c => c.name === expected.name)
    definition(actual, expected, expected.name)
    restrictionEvidence(actual, expected, 'pedidos', 'CHECK', context)
  }
  const carts = tables.carritos
  metadata(carts, 'carritos')
  assertColumn(carts.columns.id, baseColumns.id, 'carritos.id', typedPolicy)
  if (!inspectIndex(carts, index('PRIMARY', ['id'], true))) fail('PK de carritos ausente')

  const actions = [], verified = []
  const add = (phase, object, sql) => actions.push({ phase, object, sql, sha256: hash(sql) })
  for (const [name, expected] of Object.entries(addedColumns)) {
    if (Object.hasOwn(orders.columns, name)) { assertColumn(orders.columns[name], expected, `pedidos.${name}`, typedPolicy); verified.push(name) }
    else add('A', name, name === 'carrito_origen_id'
      ? 'ALTER TABLE otakuzone_db.pedidos ADD COLUMN carrito_origen_id BIGINT UNSIGNED NULL;'
      : 'ALTER TABLE otakuzone_db.pedidos ADD COLUMN clave_solicitud CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;')
  }
  // Conflict counts are required only when the corresponding column exists.
  if (Object.hasOwn(orders.columns, 'carrito_origen_id')) { zero(snapshot.data, 'duplicateCartGroups'); zero(snapshot.data, 'orphanCartReferences') }
  if (Object.hasOwn(orders.columns, 'clave_solicitud')) zero(snapshot.data, 'duplicateRequestGroups')
  for (const idx of newIndexes) {
    if (inspectIndex(orders, idx)) {
      for (const p of idx.columns) if (!Object.hasOwn(orders.columns, p.name)) fail('índice sobre columna ausente')
      verified.push(idx.name)
    } else add('B', idx.name, `ALTER TABLE otakuzone_db.pedidos ADD UNIQUE KEY ${idx.name} (${idx.columns.map(p => p.name).join(', ')});`)
  }
  // Additional keys on the recovery columns could impose a different identity.
  if (orders.indexes.some(idx => ![...baseIndexes, ...newIndexes].some(e => e.name === idx.name) && idx.columns?.some(p => Object.hasOwn(addedColumns, p.name)))) fail('índice no previsto sobre columnas de recuperación')
  if (inspectFk(orders, cartFk, 'pedidos', context)) {
    if (!Object.hasOwn(orders.columns, 'carrito_origen_id')) fail('FK sobre columna ausente')
    verified.push(cartFk.name)
  } else add('C', cartFk.name, 'ALTER TABLE otakuzone_db.pedidos ADD CONSTRAINT fk_pedidos_carrito FOREIGN KEY (carrito_origen_id) REFERENCES otakuzone_db.carritos(id) ON DELETE RESTRICT ON UPDATE RESTRICT;')

  const history = tables.historial_pedidos
  // This fingerprint-pinned source has line comments but no quoted semicolons.
  const statements = source.sql.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)
  if (statements.length !== 3) fail('estructura de fuente 006 desconocida')
  // Reuse the original CREATE/backfill bytes, only qualify table references.
  if (history === null) {
    if (count(snapshot.data, 'historyRows') !== 0) fail('filas declaradas en historial ausente')
    add('D', 'historial_pedidos', `${statements[1].replace('CREATE TABLE IF NOT EXISTS historial_pedidos', 'CREATE TABLE otakuzone_db.historial_pedidos').replace('REFERENCES pedidos(id)', 'REFERENCES otakuzone_db.pedidos(id)')};`)
  } else {
    metadata(history, 'historial_pedidos')
    if (!same(Object.keys(history.columns).sort(), Object.keys(historyDefinition.columns).sort())) fail('columnas de historial incompatibles')
    for (const [name, expected] of Object.entries(historyDefinition.columns)) assertColumn(history.columns[name], expected, `historial_pedidos.${name}`, typedPolicy)
    if (history.indexes.length !== historyDefinition.indexes.length || history.foreignKeys.length !== 1 || history.checks.length) fail('claves/restricciones de historial incompatibles')
    for (const idx of historyDefinition.indexes) if (!inspectIndex(history, idx)) fail('índice de historial ausente')
    if (!inspectFk(history, historyDefinition.foreignKeys[0], 'historial_pedidos', context)) fail('FK de historial ausente')
    zero(snapshot.data, 'orphanHistoryReferences')
    count(snapshot.data, 'historyRows')
    verified.push('historial_pedidos')
  }
  const ordersCount = count(snapshot.data, 'ordersCount')
  const missing = count(snapshot.data, 'ordersMissingHistory')
  if (missing > ordersCount || (history === null && missing !== ordersCount)) fail('recuentos de backfill incoherentes')
  if (missing) add('E', 'backfill', `${statements[2].replace('INSERT INTO historial_pedidos', 'INSERT INTO otakuzone_db.historial_pedidos').replace('FROM pedidos p', 'FROM otakuzone_db.pedidos p').replace('FROM historial_pedidos h', 'FROM otakuzone_db.historial_pedidos h')};`)
  else verified.push('backfill')

  return {
    format: snapshot.format === 'otakuzone-tidb006-snapshot-v3' ? 'otakuzone-tidb006-recovery-plan-v3' : 'otakuzone-tidb006-recovery-plan-v2', evidencePolicy: 'declarative-and-configuration-required-functional-unknown-allowed-offline-only', mode: 'offline-review-only',
    evidenceTrust: 'manual-unverified',
    enforcementAssessment: [['pedidos', orders], ['historial_pedidos', history]].flatMap(([tableName, table]) => table
      ? [['FOREIGN KEY', table.foreignKeys], ['CHECK', table.checks]].flatMap(([type, restrictions]) => restrictions.map(restriction => ({
        tableName, restrictionName: restriction.name, restrictionType: type,
        ...restrictionEvidence(restriction, restriction, tableName, type, context),
      }))) : []),
    readyForRemoteExecution: false, ledgerTransitionAllowed: false, allow007: false,
    source: { file: source.file, checksum: sourceChecksum, observedStatus: attempt.status },
    snapshotSha256: hash(JSON.stringify(snapshot)), verified, actions,
    requirements: ['exclusive-writer-maintenance-window', 'fresh-live-introspection-before-and-after-each-phase', 'approved-backup-and-recovery', 'real-TiDB-compatibility-validation', 'separate-reviewed-recovery-journal-and-ledger-finalisation'],
  }
}
