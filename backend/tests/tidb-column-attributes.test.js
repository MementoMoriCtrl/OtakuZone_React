import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { assertTypedColumn, validateColumnAttribute, deriveNotApplicable, nonTextRuleVersion, reconcileAttributeObservations } from '../src/db/columnAttributeContract.js'
import { adaptTidb006SnapshotV2 } from '../src/db/tidb006SnapshotV3.js'
import { tidb006Contract, planTidb006Recovery } from '../src/db/tidb006RecoveryPlan.js'
import { readMigrationCatalog } from '../src/db/migrationCatalog.js'
import { evidenceFixture } from './helpers/tidbEvidenceFixture.js'

const p = { source: 'synthetic:test-fixture', evidenceRefs: ['synthetic:test-fixture#/column'], engineVersion: '8.5.3', completeness: 'complete', integrity: 'manual-unverified' }
const observed = value => value === null ? { state: 'observed-sql-null', provenance: { ...p } } : { state: 'observed-value', value, provenance: { ...p } }
const missing = () => ({ state: 'unknown', reason: 'not-observed', provenance: { ...p, completeness: 'partial' } })
const options = { sourceRef: 'synthetic:fixture-v2', presentValuePolicy: 'confirmed-v2-transcription-v1' }
const policy = { approvedRules: [nonTextRuleVersion] }

async function fixture() {
  const c = tidb006Contract(), catalog = await readMigrationCatalog('tidb')
  const meta = { tableType: 'BASE TABLE', engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci', checks: [], foreignKeys: [], indexes: [], triggers: [] }
  const fk = { name: 'fk_pedidos_usuario', columns: ['usuario_id'], referencedSchema: 'otakuzone_db', referencedTable: 'usuarios', referencedColumns: ['id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' }
  fk.enforcementEvidence = evidenceFixture(fk)
  const checks = [{ name: 'ck_pedidos_moneda', clause: "moneda = 'PEN'" }, { name: 'ck_pedidos_envio', clause: 'costo_envio >= 0' }]
  for (const check of checks) check.enforcementEvidence = evidenceFixture(check, 'pedidos', 'CHECK')
  return {
    format: 'otakuzone-tidb006-snapshot-v2', engine: 'tidb', database: 'otakuzone_db', metadataComplete: true,
    evidenceContext: { captureId: 'synthetic-capture-1', sessionId: 'synthetic-session-1', engineVersion: '8.5.3', versionMapping: 'public-v8.5.3' },
    tables: { pedidos: { ...meta, columns: c.baseColumns, indexes: c.baseIndexes, foreignKeys: [fk], checks }, carritos: { ...meta, columns: { id: c.baseColumns.id }, indexes: [c.baseIndexes[0]] }, historial_pedidos: null },
    ledger: catalog.migrations.slice(0, 6).map((m, i) => ({ version: m.file, checksum: m.checksum, status: i === 5 ? 'applying' : 'applied', applied_at: i === 5 ? null : '2026-11-17 00:00:00.000' })),
    data: { ordersCount: 0, historyRows: 0, ordersMissingHistory: 0 },
  }
}

test('valor vacío, SQL NULL, propiedad ausente y string NULL son distintos', () => {
  assert.doesNotThrow(() => assertTypedColumn({ extra: observed('') }, { extra: '' }, 'pedidos.id'))
  assert.doesNotThrow(() => assertTypedColumn({ default: observed(null) }, { default: null }, 'pedidos.id'))
  assert.throws(() => assertTypedColumn({}, { default: null }, 'pedidos.id'))
  assert.throws(() => assertTypedColumn({ default: observed('NULL') }, { default: null }, 'pedidos.id'))
  assert.throws(() => assertTypedColumn({ extra: observed(null) }, { extra: '' }, 'pedidos.id'))
})
test('unknown y conflicto bloquean incluso con valor esperado conocido', () => {
  assert.throws(() => assertTypedColumn({ extra: missing() }, { extra: '' }, 'pedidos.id'))
  const conflict = reconcileAttributeObservations([observed(''), observed('auto_increment')])
  assert.equal(conflict.state, 'conflict')
  assert.throws(() => assertTypedColumn({ extra: conflict }, { extra: '' }, 'pedidos.id'))
  assert.equal(conflict.observations.length, 2)
})
test('corroboraciones iguales conservan fuentes sin elegir por mayoría', () => {
  const equal = reconcileAttributeObservations([observed(''), observed('')])
  assert.equal(equal.state, 'observed-value'); assert.equal(equal.observations.length, 2)
  assert.equal(reconcileAttributeObservations([observed(''), observed(''), observed(null)]).state, 'conflict')
})
test('procedencia incompleta, valor falso mal tipado o fecha imposible no se aprueban', () => {
  for (const mutate of [a => { a.value = null }, a => { a.provenance.source = '' }, a => { a.provenance.evidenceRefs = [] }, a => { a.provenance.completeness = 'partial' }, a => { a.provenance.capturedAt = '2026-02-30T00:00:00.000Z' }]) {
    const a = observed(''); mutate(a); assert.throws(() => validateColumnAttribute(a))
  }
  assert.throws(() => assertTypedColumn({ nullable: observed('false') }, { nullable: false }, 'pedidos.id'))
  assert.doesNotThrow(() => validateColumnAttribute(observed('')))
})
for (const type of ['bigint unsigned', 'decimal(10,2)', 'timestamp(3)']) {
  test(`regla explícita deriva no aplicabilidad para ${type}, no SQL NULL observado`, () => {
    const column = { type: observed(type), charset: missing(), collation: missing() }
    for (const key of ['charset', 'collation']) column[key] = deriveNotApplicable(column, key, `#/tables/pedidos/columns/id/${key}`, policy.approvedRules)
    assert.equal(column.charset.state, 'not-applicable'); assert.equal(Object.hasOwn(column.charset, 'value'), false)
    assert.doesNotThrow(() => assertTypedColumn(column, { type, charset: null, collation: null }, 'pedidos.id', policy))
    assert.throws(() => assertTypedColumn(column, { type, charset: null }, 'pedidos.id'))
  })
}
for (const type of ['char(3)', 'varchar(32)', 'enum(\'a\')', 'json', 'datetime(3)', 'BIGINT UNSIGNED']) {
  test(`tipo fuera de la lista revisada no recibe derivación: ${type}`, () => {
    assert.throws(() => deriveNotApplicable({ type: observed(type), charset: missing() }, 'charset', '#/tables/pedidos/columns/id/charset', policy.approvedRules))
  })
}
test('ninguna regla deriva default o EXTRA, ni reemplaza un valor observado', () => {
  for (const key of ['default', 'extra']) assert.throws(() => deriveNotApplicable({ type: observed('bigint unsigned'), [key]: missing() }, key, `#/tables/pedidos/columns/id/${key}`, policy.approvedRules))
  assert.throws(() => deriveNotApplicable({ type: observed('bigint unsigned'), charset: observed('ascii') }, 'charset', '#/tables/pedidos/columns/id/charset', policy.approvedRules))
})
test('base de derivación alterada o regla inventada se rechaza', () => {
  const column = { type: observed('bigint unsigned'), charset: missing() }
  column.charset = deriveNotApplicable(column, 'charset', '#/tables/pedidos/columns/id/charset', policy.approvedRules)
  column.type = observed('timestamp(3)')
  assert.throws(() => assertTypedColumn(column, { type: 'timestamp(3)', charset: null }, 'pedidos.id', policy))
  assert.throws(() => deriveNotApplicable({ type: observed('bigint unsigned'), charset: missing() }, 'charset', '#/tables/pedidos/columns/id/charset', ['invented-rule']))
})
test('adaptador conserva entrada completa, ledger, evidencia y conversiones sin aprobar metadata', async () => {
  const source = await fixture(), before = structuredClone(source), raw = JSON.stringify(source)
  const v3 = adaptTidb006SnapshotV2(raw, options)
  assert.deepEqual(source, before); assert.deepEqual(v3.adaptation.originalSnapshot, source)
  assert.deepEqual(v3.ledger, source.ledger); assert.deepEqual(v3.tables.pedidos.foreignKeys, source.tables.pedidos.foreignKeys)
  assert.equal(v3.metadataComplete, false)
  assert.equal(v3.adaptation.sourceSha256, createHash('sha256').update(raw).digest('hex'))
  assert.equal(v3.tables.pedidos.columns.usuario_id.default.state, 'observed-sql-null')
  assert.equal(v3.adaptation.conversions.some(c => c.path.endsWith('/default')), true)
})
test('conversiones no autorizadas no se hacen automáticamente', async () => {
  const source = await fixture(), raw = JSON.stringify(source)
  assert.throws(() => adaptTidb006SnapshotV2(raw, { sourceRef: 'synthetic' }))
  assert.throws(() => adaptTidb006SnapshotV2(raw, { ...options, approvedRules: ['invented'] }))
  source.format = 'otakuzone-tidb006-snapshot-v1'
  assert.throws(() => adaptTidb006SnapshotV2(JSON.stringify(source), options))
})
test('ausencia y hecho parcial nunca se convierten en default observado', async () => {
  const source = await fixture(); delete source.tables.pedidos.columns.usuario_id.default
  const fact = { path: '#/tables/pedidos/columns/usuario_id/default', name: 'default_is_null', value: 0, source: 'synthetic:summary', evidenceRefs: ['synthetic:summary#default'] }
  const v3 = adaptTidb006SnapshotV2(JSON.stringify(source), { ...options, partialFacts: [fact] })
  const attr = v3.tables.pedidos.columns.usuario_id.default
  assert.equal(attr.state, 'unknown'); assert.equal(Object.hasOwn(attr, 'value'), false)
  assert.deepEqual(attr.partialFacts, [fact])
  v3.metadataComplete = true // Synthetic fixture only, to exercise the real guard.
  await assert.rejects(planTidb006Recovery(v3), /tipada/)
})
test('planificador v3 con fixture completo mantiene banderas false', async () => {
  const v3 = adaptTidb006SnapshotV2(JSON.stringify(await fixture()), options)
  v3.metadataComplete = true // Only synthetic fixture.
  const result = await planTidb006Recovery(v3)
  assert.equal(result.format, 'otakuzone-tidb006-recovery-plan-v3')
  for (const key of ['readyForRemoteExecution', 'ledgerTransitionAllowed', 'allow007']) assert.equal(result[key], false)
})
test('conflicto bloquea incluso una columna que no pertenecía al subconjunto auditado', async () => {
  const source = await fixture(); source.tables.carritos.columns.other = structuredClone(source.tables.carritos.columns.id)
  const v3 = adaptTidb006SnapshotV2(JSON.stringify(source), options)
  v3.tables.carritos.columns.other.extra = reconcileAttributeObservations([observed(''), observed('auto_increment')])
  v3.metadataComplete = true
  await assert.rejects(planTidb006Recovery(v3), /conflicto/)
})
test('snapshots históricos permanecen intactos; no se planifican datos reales', async () => {
  for (const [name, hash] of [['tidb-006-snapshot-candidate.json', '1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec'], ['tidb-006-snapshot-v2-candidate.json', '3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64']]) {
    const bytes = await readFile(new URL(`../../docs/snapshots/${name}`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
    assert.equal(JSON.parse(bytes.toString()).metadataComplete, false)
  }
})
test('hechos parciales contradictorios quedan como conflicto, no se elige el último', async () => {
  const s = await fixture(); delete s.tables.pedidos.columns.usuario_id.default
  const base = { path: '#/tables/pedidos/columns/usuario_id/default', name: 'default_is_null', source: 'synthetic:summary', evidenceRefs: ['synthetic:summary'] }
  const v3 = adaptTidb006SnapshotV2(JSON.stringify(s), { ...options, partialFacts: [0, 1].map(value => ({ ...base, value })) })
  assert.equal(v3.tables.pedidos.columns.usuario_id.default.state, 'conflict')
  v3.metadataComplete = true
  await assert.rejects(planTidb006Recovery(v3), /conflicto/)
})
test('v3 no omite la comprobación de versiones ni acepta escalares sin tipar', async () => {
  const v3 = adaptTidb006SnapshotV2(JSON.stringify(await fixture()), options)
  v3.metadataComplete = true
  v3.tables.pedidos.columns.id.type.provenance.engineVersion = '8.5.4'
  await assert.rejects(planTidb006Recovery(v3), /versión/)
  const raw = adaptTidb006SnapshotV2(JSON.stringify(await fixture()), options)
  raw.metadataComplete = true; raw.tables.pedidos.columns.id.type = 'bigint unsigned'
  await assert.rejects(planTidb006Recovery(raw), /tipada/)
})
test('sin aprobación explícita los diez huecos no se derivan; con regla quedan trazados', async () => {
  const s = await fixture()
  delete s.tables.pedidos.columns.id.charset; delete s.tables.pedidos.columns.id.collation
  const noRule = adaptTidb006SnapshotV2(JSON.stringify(s), options)
  assert.equal(noRule.tables.pedidos.columns.id.charset.state, 'unknown')
  const withRule = adaptTidb006SnapshotV2(JSON.stringify(s), { ...options, ...policy })
  assert.equal(withRule.tables.pedidos.columns.id.charset.state, 'not-applicable')
  assert.equal(withRule.tables.pedidos.columns.id.charset.previous.state, 'unknown')
  withRule.metadataComplete = true
  assert.equal((await planTidb006Recovery(withRule)).allow007, false)
})
test('corroboraciones de versiones distintas no ocultan conflicto de procedencia', () => {
  const a = observed(''), b = observed(''); b.provenance.engineVersion = '8.5.4'
  assert.equal(reconcileAttributeObservations([a, b]).state, 'conflict')
  assert.throws(() => validateColumnAttribute({ ...a, observations: [b] }))
})
