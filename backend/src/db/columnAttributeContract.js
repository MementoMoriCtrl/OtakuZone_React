import { createHash } from 'node:crypto'

export const columnAttributeFormat = 'otakuzone-column-attribute-v1'
export const nonTextRuleVersion = 'tidb-8.5.3-nontext-character-attributes-v1'
export const columnAttributeKeys = ['type', 'nullable', 'charset', 'collation', 'default', 'extra', 'generationExpression']
const states = ['observed-value', 'observed-sql-null', 'not-applicable', 'unknown', 'conflict']
const text = value => typeof value === 'string' && value.trim().length > 0
export const attributeHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail = label => { throw new Error(`Columna tipada incompatible o no observable: ${label}.`) }

function provenance(p, complete) {
  if (!p || !text(p.source) || !Array.isArray(p.evidenceRefs) || !p.evidenceRefs.length || !p.evidenceRefs.every(text)
    || !text(p.engineVersion) || p.integrity !== 'manual-unverified'
    || !['complete', 'partial'].includes(p.completeness) || complete && p.completeness !== 'complete') return false
  if (Object.hasOwn(p, 'capturedAt')) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.capturedAt)) return false
    const time = Date.parse(p.capturedAt)
    if (!Number.isFinite(time) || new Date(time).toISOString() !== p.capturedAt) return false
  }
  return true
}

export function validateColumnAttribute(a, label = 'atributo') {
  if (!a || !states.includes(a.state) || !provenance(a.provenance, ['observed-value', 'observed-sql-null', 'not-applicable'].includes(a.state))) fail(label)
  if (a.state === 'observed-value') {
    if (!Object.hasOwn(a, 'value') || !['string', 'boolean', 'number'].includes(typeof a.value)
      || typeof a.value === 'number' && !Number.isFinite(a.value)) fail(label)
  } else if (Object.hasOwn(a, 'value')) fail(label)
  if (a.state === 'unknown' && !text(a.reason)) fail(label)
  if (a.state === 'not-applicable' && (!text(a.ruleVersion) || !a.basis)) fail(label)
  if (a.state === 'conflict' && (!Array.isArray(a.observations) || a.observations.length < 2)) fail(label)
  if (a.partialFacts && !['unknown', 'conflict'].includes(a.state)) fail(label)
  if (a.state !== 'conflict' && Object.hasOwn(a, 'observations')) {
    if (!Array.isArray(a.observations) || a.observations.some(o => o.state !== a.state || !Object.is(o.value, a.value)
      || !provenance(o.provenance, true) || o.provenance.engineVersion !== a.provenance.engineVersion)) fail(label)
  }
  return a
}

export function reconcileAttributeObservations(observations) {
  if (!Array.isArray(observations) || !observations.length) fail('observaciones ausentes')
  observations.forEach(a => validateColumnAttribute(a))
  const first = structuredClone(observations[0])
  const signatures = observations.map(a => JSON.stringify([a.state, a.value, a.ruleVersion, a.basis, a.partialFacts, a.provenance.engineVersion]))
  if (signatures.every(s => s === signatures[0])) return { ...first, observations: structuredClone(observations) }
  return { state: 'conflict', provenance: { ...first.provenance, completeness: 'partial' }, observations: structuredClone(observations) }
}

// An explicit semantic rule, not a claim that a NULL metadata cell was observed.
// Narrow allowlist: canonical types already used by the reviewed recovery contract.
export function nonTextRuleApplies(type, field, engineVersion) {
  return ['charset', 'collation'].includes(field)
    && ['8.5.3', '8.0.11-TiDB-v8.5.3-serverless'].includes(engineVersion)
    && ['bigint unsigned', 'decimal(10,2)', 'timestamp(3)'].includes(type)
}

export function deriveNotApplicable(column, field, path, approvedRules = []) {
  const previous = column[field]
  validateColumnAttribute(previous, path)
  validateColumnAttribute(column.type, `${path}.type`)
  if (!approvedRules.includes(nonTextRuleVersion) || column.type.state !== 'observed-value'
    || !nonTextRuleApplies(column.type.value, field, column.type.provenance.engineVersion)) fail(path)
  if (previous.state !== 'unknown') fail('derivación no autorizada sobre atributo observado o conflictivo')
  if (previous.partialFacts?.length) fail('hechos parciales requieren revisión antes de derivar')
  return {
    state: 'not-applicable',
    provenance: { ...column.type.provenance, source: 'docs/DESPLIEGUE_ETAPA_4_1_CONTRATO_TIPADO_V3.md', completeness: 'complete' },
    ruleVersion: nonTextRuleVersion,
    basis: { typeEvidenceRef: `${path.slice(0, path.lastIndexOf('/'))}/type`, typeValue: column.type.value, typeEvidenceSha256: attributeHash(column.type) },
    previous: structuredClone(previous),
  }
}

export function assertTypedColumn(actual, expected, label, { approvedRules = [] } = {}) {
  if (!actual || typeof actual !== 'object') fail(label)
  for (const [key, expectedValue] of Object.entries(expected)) {
    const a = validateColumnAttribute(actual[key], `${label}.${key}`)
    if (a.state === 'unknown' || a.state === 'conflict') fail(`${label}.${key}`)
    if (a.state === 'not-applicable') {
      const t = validateColumnAttribute(actual.type, `${label}.type`)
      const path = `#/tables/${label.split('.')[0]}/columns/${label.split('.')[1]}/type`
      if (expectedValue !== null || a.ruleVersion !== nonTextRuleVersion || !approvedRules.includes(a.ruleVersion)
        || t.state !== 'observed-value' || t.value !== expected.type
        || a.provenance.engineVersion !== t.provenance.engineVersion
        || !nonTextRuleApplies(t.value, key, t.provenance.engineVersion)
        || a.basis.typeEvidenceRef !== path || a.basis.typeValue !== t.value || a.basis.typeEvidenceSha256 !== attributeHash(t)) fail(`${label}.${key}`)
      if (validateColumnAttribute(a.previous, `${label}.${key}.previous`).state !== 'unknown' || a.previous.partialFacts?.length) fail(`${label}.${key}`)
    } else if (a.state === 'observed-sql-null' ? expectedValue !== null : !Object.is(a.value, expectedValue)) fail(`${label}.${key}`)
  }
}

export function validateTypedSnapshotColumns(snapshot) {
  if (snapshot.columnAttributeFormat !== columnAttributeFormat || !Array.isArray(snapshot.columnRules)
    || snapshot.columnRules.some(rule => rule !== nonTextRuleVersion)) fail('formato/reglas')
  for (const [tableName, table] of Object.entries(snapshot.tables ?? {})) {
    if (!table) continue
    for (const [name, column] of Object.entries(table.columns ?? {})) {
      if (!column || Object.keys(column).some(key => !columnAttributeKeys.includes(key))) fail(`${tableName}.${name}`)
      for (const key of columnAttributeKeys) {
        const a = validateColumnAttribute(column[key], `${tableName}.${name}.${key}`)
        if (a.provenance.engineVersion !== snapshot.evidenceContext?.engineVersion) fail(`${tableName}.${name}.${key}: versión de evidencia distinta`)
        if (a.state === 'conflict') fail(`${tableName}.${name}.${key}: conflicto`)
      }
    }
  }
}
