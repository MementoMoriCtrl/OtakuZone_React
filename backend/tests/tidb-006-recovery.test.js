import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { planTidb006Recovery, tidb006Contract } from '../src/db/tidb006RecoveryPlan.js'
import { readMigrationCatalog, validateAppliedMigrations } from '../src/db/migrationCatalog.js'
import { evidenceFixture } from './helpers/tidbEvidenceFixture.js'
import { migrateTidb } from '../src/db/tidbMigrate.js'

let connectionAttempts = 0
const originalConnect = net.Socket.prototype.connect
before(() => { net.Socket.prototype.connect = function () { connectionAttempts++; throw new Error('SQL/network prohibited in recovery tests') } })
after(() => { net.Socket.prototype.connect = originalConnect; assert.equal(connectionAttempts, 1) })
const contract = () => tidb006Contract()
const metadata = () => ({ tableType: 'BASE TABLE', engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci', columns: {}, indexes: [], foreignKeys: [], checks: [], triggers: [] })

async function fixture({ columns = [], indexes = false, foreignKey = false, history = false } = {}) {
  const c = contract(), catalog = await readMigrationCatalog('tidb')
  const orders = { ...metadata(), columns: { ...c.baseColumns }, indexes: c.baseIndexes, foreignKeys: [{ name: 'fk_pedidos_usuario', columns: ['usuario_id'], referencedSchema: 'otakuzone_db', referencedTable: 'usuarios', referencedColumns: ['id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT', enforced: true }], checks: [{ name: 'ck_pedidos_moneda', clause: "moneda = 'PEN'", enforced: true }, { name: 'ck_pedidos_envio', clause: 'costo_envio >= 0', enforced: true }] }
  for (const name of columns) orders.columns[name] = c.addedColumns[name]
  if (indexes) orders.indexes.push(...c.newIndexes)
  if (foreignKey) orders.foreignKeys.push(c.cartFk)
  for (const [tableName, table] of [['pedidos', orders], ['historial_pedidos', history ? c.historyDefinition : null]]) {
    if (!table) continue
    for (const [key, type] of [['foreignKeys', 'FOREIGN KEY'], ['checks', 'CHECK']]) {
      for (const restriction of table[key]) {
        delete restriction.enforced
        restriction.enforcementEvidence = evidenceFixture(restriction, tableName, type)
      }
    }
  }
  return {
    format: 'otakuzone-tidb006-snapshot-v2', engine: 'tidb', database: 'otakuzone_db', metadataComplete: true,
    evidenceContext: { captureId: 'synthetic-capture-1', sessionId: 'synthetic-session-1', engineVersion: '8.5.3', versionMapping: 'public-v8.5.3' },
    ledger: catalog.migrations.slice(0, 6).map((item, i) => ({ version: item.file, checksum: item.checksum, status: i === 5 ? 'applying' : 'applied', applied_at: i === 5 ? null : '2026-11-16 00:00:00.000' })),
    tables: { pedidos: orders, carritos: { ...metadata(), columns: { id: c.baseColumns.id }, indexes: [c.baseIndexes[0]] }, historial_pedidos: history ? c.historyDefinition : null },
    data: { ordersCount: 3, historyRows: 0, ordersMissingHistory: 3, duplicateCartGroups: 0, duplicateRequestGroups: 0, orphanCartReferences: 0, orphanHistoryReferences: 0 },
  }
}
const allColumns = ['carrito_origen_id', 'clave_solicitud']

test('estado anterior a 006: plan A–E sin DDL compuesto ni transición de ledger', async () => {
  const s = await fixture(), before = structuredClone(s)
  const plan = await planTidb006Recovery(s)
  assert.deepEqual(plan.actions.map(a => a.phase), ['A', 'A', 'B', 'B', 'C', 'D', 'E'])
  assert.equal(plan.readyForRemoteExecution, false)
  assert.equal(plan.ledgerTransitionAllowed, false)
  assert.equal(plan.allow007, false)
  assert.deepEqual(s, before)
  assert.ok(plan.actions.every(a => /^[a-f0-9]{64}$/.test(a.sha256)))
  assert.ok(!plan.actions.some(a => a.sql.includes('schema_migrations')))
  assert.ok(plan.actions.filter(a => a.phase === 'A').every(a => !a.sql.includes('UNIQUE')))
})

for (const columns of [['carrito_origen_id'], ['clave_solicitud'], allColumns]) {
  test(`columnas equivalentes se omiten: ${columns.join(',')}`, async () => {
    const plan = await planTidb006Recovery(await fixture({ columns }))
    assert.equal(plan.actions.filter(a => a.phase === 'A').length, 2 - columns.length)
  })
}
for (const [key, value] of [['type', 'int unsigned'], ['nullable', false], ['charset', 'utf8mb4'], ['collation', 'utf8mb4_bin'], ['default', 'x'], ['generationExpression', 'lower(email)']]) {
  test(`columna incompatible detiene plan: ${key}`, async () => {
    const s = await fixture({ columns: allColumns })
    s.tables.pedidos.columns.clave_solicitud[key] = value
    await assert.rejects(planTidb006Recovery(s), /columna incompatible/)
  })
}
test('índices equivalentes completos se omiten', async () => {
  const plan = await planTidb006Recovery(await fixture({ columns: allColumns, indexes: true }))
  assert.equal(plan.actions.filter(a => a.phase === 'B').length, 0)
})
for (const kind of ['order', 'nonunique', 'prefix', 'descending', 'invisible', 'expression', 'different-name']) {
  test(`índice incompatible se rechaza: ${kind}`, async () => {
    const s = await fixture({ columns: allColumns, indexes: true })
    const idx = s.tables.pedidos.indexes.at(-1)
    if (kind === 'order') idx.columns.reverse()
    if (kind === 'nonunique') idx.unique = false
    if (kind === 'prefix') idx.columns[1].prefix = 12
    if (kind === 'descending') idx.columns[0].order = 'DESC'
    if (kind === 'invisible') idx.visible = false
    if (kind === 'expression') idx.columns[1].expression = 'lower(clave_solicitud)'
    if (kind === 'different-name') idx.name = 'other_name'
    await assert.rejects(planTidb006Recovery(s), /índice|definición/)
  })
}
test('FK ausente se propone; FK equivalente se omite', async () => {
  const absent = await planTidb006Recovery(await fixture({ columns: allColumns }))
  assert.equal(absent.actions.filter(a => a.phase === 'C').length, 1)
  const exists = await planTidb006Recovery(await fixture({ columns: allColumns, foreignKey: true }))
  assert.equal(exists.actions.filter(a => a.phase === 'C').length, 0)
})
for (const [key, value] of [['onDelete', 'CASCADE'], ['onUpdate', 'CASCADE'], ['referencedTable', 'usuarios'], ['referencedSchema', 'another'], ['enforcementEvidence', null]]) {
  test(`FK incompatible se rechaza: ${key}`, async () => {
    const s = await fixture({ columns: allColumns, foreignKey: true })
    s.tables.pedidos.foreignKeys.at(-1)[key] = value
    await assert.rejects(planTidb006Recovery(s), /incompatible/)
  })
}
test('historial equivalente se conserva; backfill es el NOT EXISTS original', async () => {
  const s = await fixture({ history: true })
  s.data.historyRows = 2
  s.data.ordersMissingHistory = 1
  const plan = await planTidb006Recovery(s)
  assert.ok(!plan.actions.some(a => a.phase === 'D'))
  const sql = plan.actions.find(a => a.phase === 'E').sql
  assert.ok(sql.includes('WHERE NOT EXISTS'))
  assert.ok(sql.includes('SELECT p.id, p.estado, p.creado_en'))
  assert.ok(!/UPDATE|DELETE|REPLACE/.test(sql))
})
test('backfill completado no genera inserción adicional', async () => {
  const s = await fixture({ columns: allColumns, indexes: true, foreignKey: true, history: true })
  s.data.historyRows = 4; s.data.ordersMissingHistory = 0
  const plan = await planTidb006Recovery(s)
  assert.equal(plan.actions.length, 0)
  assert.equal(plan.ledgerTransitionAllowed, false)
})
for (const kind of ['column', 'index', 'fk', 'extra-column', 'trigger']) {
  test(`historial incompatible no se adopta: ${kind}`, async () => {
    const s = await fixture({ history: true }), h = s.tables.historial_pedidos
    if (kind === 'column') h.columns.estado.default = 'pendiente'
    if (kind === 'index') h.indexes[1].columns.reverse()
    if (kind === 'fk') h.foreignKeys[0].onDelete = 'CASCADE'
    if (kind === 'extra-column') h.columns.unexpected = h.columns.estado
    if (kind === 'trigger') h.triggers.push('unexpected')
    await assert.rejects(planTidb006Recovery(s), /incompatible|triggers/)
  })
}
for (const name of ['duplicateCartGroups', 'duplicateRequestGroups', 'orphanCartReferences', 'orphanHistoryReferences']) {
  test(`conflictos bloquean el plan antes de proponer cambios: ${name}`, async () => {
    const s = await fixture({ columns: allColumns, history: true })
    s.data[name] = 1
    await assert.rejects(planTidb006Recovery(s), /conflictos/)
  })
}
test('snapshot incompleto, motor/destino incorrecto y recuentos faltantes fallan cerrado', async () => {
  for (const mutate of [s => { s.metadataComplete = false }, s => { s.engine = 'mysql' }, s => { s.database = 'otakuzone_email_probe' }, s => { delete s.tables.historial_pedidos }, s => { delete s.data.ordersCount }, s => { s.data.ordersMissingHistory = 4 }]) {
    const s = await fixture(); mutate(s)
    await assert.rejects(planTidb006Recovery(s))
  }
})
test('preserva applying/checksum y rechaza ledger incoherente o avance 007', async () => {
  const catalog = await readMigrationCatalog('tidb')
  for (const mutate of [s => { s.ledger[5].checksum = 'f'.repeat(64) }, s => { s.ledger[5].status = 'applied' }, s => { s.ledger[5].applied_at = 'unexpected' }, s => { s.ledger[2].status = 'applying' }, s => { s.ledger.splice(2, 1) }, s => { s.ledger.push({ version: catalog.migrations[6].file }) }, s => { s.tables.schema_migrations = {} }]) {
    const s = await fixture(); mutate(s)
    await assert.rejects(planTidb006Recovery(s))
  }
  const partial = await fixture()
  assert.throws(() => validateAppliedMigrations(catalog, partial.ledger), /parcial/)
})
test('el migrador normal sigue bloqueado antes de DDL o 007 después de planificar', async () => {
  const s = await fixture(), catalog = await readMigrationCatalog('tidb'), calls = []
  await planTidb006Recovery(s)
  const c = {
    query: async sql => { calls.push(sql) },
    execute: async sql => {
      calls.push(sql)
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.includes('information_schema.TABLES')) return [[{ name: 'schema_migrations_tidb' }]]
      if (sql.startsWith('SELECT version')) return [s.ledger]
      return [[]]
    },
  }
  await assert.rejects(migrateTidb(c, catalog, async () => {}, () => {}), /parcial/)
  assert.ok(!calls.some(sql => /^(CREATE|ALTER|INSERT|UPDATE|DELETE)/.test(sql)))
})
test('la herramienta offline no importa driver, entorno, migrador ni un modo execute', async () => {
  const script = await readFile(new URL('../scripts/plan-tidb-006-recovery.js', import.meta.url), 'utf8')
  assert.ok(!/^import .*mysql|^import .*pool|^import .*migrate\.js|^import .*loadEnvironment/m.test(script))
  assert.ok(script.includes("process.argv[2] !== '--snapshot'"))
  const catalog = await readMigrationCatalog('mysql')
  assert.doesNotThrow(() => validateAppliedMigrations(catalog, catalog.migrations.map(m => ({ version: m.file, checksum: m.checksum }))))
})

test('el guardia de pruebas rechaza una conexión remota antes de resolver o abrir socket', () => {
  const socket = new net.Socket()
  try {
    assert.throws(() => socket.connect({ host: 'remote.fixture.test', port: 4000 }), /network prohibited/)
  } finally { socket.destroy() }
})


test('v1 no se convierte autom?ticamente en evidencia v2', async () => {
  const s = await fixture(); s.format = 'otakuzone-tidb006-snapshot-v1'
  await assert.rejects(planTidb006Recovery(s), /snapshot incompleto/)
})
for (const kind of ['legacy', 'unknown', 'disabled', 'functional-negative', 'wrong-definition']) {
  test(`evidencia CHECK bloquea plan: ${kind}`, async () => {
    const s = await fixture(), c = s.tables.pedidos.checks[0]
    if (kind === 'legacy') c.enforced = true
    if (kind === 'unknown') c.enforcementEvidence.configuration = []
    if (kind === 'disabled') c.enforcementEvidence.configuration[0].controls.tidb_enable_check_constraint = false
    if (kind === 'functional-negative') c.enforcementEvidence.functional = [{ ...c.enforcementEvidence.configuration[0], source: 'functional-observation', outcome: false }]
    if (kind === 'wrong-definition') c.enforcementEvidence.declarative[0].ddl = c.enforcementEvidence.declarative[0].ddl.replace('PEN', 'USD')
    await assert.rejects(planTidb006Recovery(s), /evidencia|legado/)
  })
}
for (const kind of ['missing-context', 'other-session', 'other-capture', 'other-version', 'functional-negative-unknown']) {
  test(`v2 adversarial bloquea procedencia/negativos: ${kind}`, async () => {
    const s = await fixture(), e = s.tables.pedidos.foreignKeys[0].enforcementEvidence
    if (kind === 'missing-context') delete s.evidenceContext
    if (kind === 'other-session') e.configuration[0].sessionId = 'another'
    if (kind === 'other-capture') e.configuration[0].captureId = 'another'
    if (kind === 'other-version') s.evidenceContext.engineVersion = '8.5.4'
    if (kind === 'functional-negative-unknown') e.functional = [false, 'unknown'].map(outcome => ({ ...e.configuration[0], source: 'functional-observation', outcome }))
    await assert.rejects(planTidb006Recovery(s), /contexto|evidencia/)
  })
}
test('banderas inyectadas no autorizan ejecución ni autentican evidencia manual', async () => {
  const s = await fixture()
  Object.assign(s, { readyForRemoteExecution: true, ledgerTransitionAllowed: true, allow007: true, evidenceTrust: 'authenticated' })
  const plan = await planTidb006Recovery(s)
  for (const key of ['readyForRemoteExecution', 'ledgerTransitionAllowed', 'allow007']) assert.equal(plan[key], false)
  assert.equal(plan.evidenceTrust, 'manual-unverified')
  assert.ok(plan.enforcementAssessment.every(item => item.functional === 'unknown'))
})
