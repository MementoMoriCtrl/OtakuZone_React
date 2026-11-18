import { createHash } from 'node:crypto'
import { columnAttributeFormat, columnAttributeKeys, nonTextRuleVersion, deriveNotApplicable } from './columnAttributeContract.js'

export const snapshotV3Format = 'otakuzone-tidb006-snapshot-v3'
const sha = text => createHash('sha256').update(text).digest('hex')
const fail = () => { throw new Error('Adaptación v2 a v3 rechazada: entrada, procedencia o conversión no autorizada.') }

// Explicit, pure, offline conversion. Does not load files or approve completeness.
export function adaptTidb006SnapshotV2(sourceText, { sourceRef, presentValuePolicy, approvedRules = [], partialFacts = [] } = {}) {
  if (typeof sourceText !== 'string' || typeof sourceRef !== 'string' || !sourceRef.trim()
    || presentValuePolicy !== 'confirmed-v2-transcription-v1'
    || !Array.isArray(approvedRules) || approvedRules.some(rule => rule !== nonTextRuleVersion) || !Array.isArray(partialFacts)) fail()
  const original = JSON.parse(sourceText.replace(/^\uFEFF/, ''))
  if (original.format !== 'otakuzone-tidb006-snapshot-v2' || original.engine !== 'tidb' || original.database !== 'otakuzone_db'
    || typeof original.metadataComplete !== 'boolean' || !original.tables || !original.evidenceContext?.engineVersion) fail()
  for (const key of ['readyForRemoteExecution', 'ledgerTransitionAllowed', 'allow007']) if (original[key] !== undefined && original[key] !== false) fail()
  const snapshot = structuredClone(original), conversions = [
    { path: '#/format', from: original.format, to: snapshotV3Format },
    { path: '#/metadataComplete', from: original.metadataComplete, to: false, operation: 'require-independent-review' },
    { path: '#/evidenceTrust', from: original.evidenceTrust ?? 'absent', to: 'manual-unverified' },
  ]
  snapshot.format = snapshotV3Format
  snapshot.columnAttributeFormat = columnAttributeFormat
  snapshot.columnRules = [...approvedRules]
  snapshot.metadataComplete = false
  snapshot.evidenceTrust = 'manual-unverified'
  for (const key of ['readyForRemoteExecution', 'ledgerTransitionAllowed', 'allow007']) snapshot[key] = false
  for (const [tableName, table] of Object.entries(snapshot.tables)) {
    if (!table) continue
    if (!table.columns || typeof table.columns !== 'object') fail()
    for (const [name, column] of Object.entries(table.columns)) {
      if (!column || Object.keys(column).some(key => !columnAttributeKeys.includes(key))) fail()
      const typed = {}
      for (const key of columnAttributeKeys) {
        const present = Object.hasOwn(column, key), value = column[key]
        if (present && value !== null && !['string', 'boolean', 'number'].includes(typeof value)) fail()
        const path = `#/tables/${tableName}/columns/${name}/${key}`
        const provenance = {
          source: sourceRef, evidenceRefs: [`${sourceRef}${present ? path : path.slice(0, path.lastIndexOf('/'))}`],
          engineVersion: original.evidenceContext.engineVersion, completeness: present ? 'complete' : 'partial', integrity: 'manual-unverified',
        }
        typed[key] = !present ? { state: 'unknown', reason: 'missing-v2-attribute', provenance }
          : value === null ? { state: 'observed-sql-null', provenance } : { state: 'observed-value', value, provenance }
        conversions.push({ path, from: present ? { present, value } : { present }, toState: typed[key].state })
      }
      table.columns[name] = typed
    }
  }
  for (const fact of partialFacts) {
    if (!fact || typeof fact.source !== 'string' || !fact.source.trim() || !Array.isArray(fact.evidenceRefs) || !fact.evidenceRefs.length
      || !fact.evidenceRefs.every(ref => typeof ref === 'string' && ref.trim()) || !['default_is_null', 'extra_is_null'].includes(fact.name) || ![0, 1].includes(fact.value)) fail()
    const match = /^#\/tables\/([^/]+)\/columns\/([^/]+)\/(default|extra)$/.exec(fact.path)
    if (!match || fact.name !== `${match[3] === 'default' ? 'default' : 'extra'}_is_null`) fail()
    const a = snapshot.tables[match[1]]?.columns?.[match[2]]?.[match[3]]
    if (a?.state !== 'unknown') fail()
    const before = structuredClone(a)
    a.partialFacts ??= []
    a.partialFacts.push(structuredClone(fact))
    if (before.partialFacts?.some(previous => previous.name === fact.name && previous.value !== fact.value)) {
      a.state = 'conflict'; a.observations = [before, { ...structuredClone(before), partialFacts: [structuredClone(fact)] }]
    }
    conversions.push({ path: fact.path, operation: 'attach-partial-fact', fact: structuredClone(fact), toState: a.state })
  }
  if (approvedRules.includes(nonTextRuleVersion)) {
    for (const [tableName, table] of Object.entries(snapshot.tables)) {
      for (const [name, column] of Object.entries(table?.columns ?? {})) {
        if (column.type.state !== 'observed-value') continue
        for (const field of ['charset', 'collation']) {
          if (column[field].state !== 'unknown') continue
          if (!['bigint unsigned', 'decimal(10,2)', 'timestamp(3)'].includes(column.type.value)) continue
          const path = `#/tables/${tableName}/columns/${name}/${field}`
          column[field] = deriveNotApplicable(column, field, path, approvedRules)
          conversions.push({ path, fromState: 'unknown', toState: 'not-applicable', ruleVersion: nonTextRuleVersion })
        }
      }
    }
  }
  snapshot.adaptation = {
    format: 'otakuzone-v2-to-v3-adaptation-v1', sourceRef, sourceSha256: sha(sourceText),
    originalSnapshot: original, originalCanonicalSha256: sha(JSON.stringify(original)), presentValuePolicy, conversions,
    metadataApproval: false,
  }
  return snapshot
}
