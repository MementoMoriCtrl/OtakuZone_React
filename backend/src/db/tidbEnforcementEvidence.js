import { tidbDatabase } from './tidbDatabase.js'
// Pure offline interpretation. No SQL execution, driver, environment or credentials.
export const evidenceFormat = 'otakuzone-enforcement-evidence-v1'
export const interpretationRuleVersion = 'tidb-8.5.3-markers-v2'
const unknown = 'unknown'
const state = value => value === true || value === false || value === unknown
const nonempty = value => typeof value === 'string' && value.trim().length > 0
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'))
}
const supported = record => record.engineVersion === '8.5.3' && record.versionMapping === 'public-v8.5.3'
  || record.engineVersion === '8.0.11-TiDB-v8.5.3-serverless' && record.versionMapping === 'reviewed-serverless-v8.5.3'

function provenance(record, identity, source) {
  return record && record.restrictionName === identity.name && record.restrictionType === identity.type
    && record.database === identity.database && record.tableName === identity.tableName
    && record.source === source && supported(record)
    && record.engineVersion === identity.engineVersion && record.versionMapping === identity.versionMapping
    && record.interpretationRuleVersion === interpretationRuleVersion
    && record.evidenceCompleteness === 'complete'
    && nonempty(identity.captureId) && record.captureId === identity.captureId
    && validDate(record.capturedAt)
}

// Small lexer for SHOW CREATE output, not an SQL parser/executor. Quoted text cannot
// impersonate identifiers/keywords or marker comments. Unsupported syntax is unknown.
function tokens(text) {
  if (typeof text !== 'string' || text.length > 200000 || text.includes('…') || text.includes('...')) return null
  const result = []
  for (let i = 0; i < text.length;) {
    const c = text[i]
    if (/\s/.test(c)) { i++; continue }
    if (text.startsWith('--', i) || c === '#') return null
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) return null
      result.push({ kind: 'comment', value: text.slice(i + 2, end).trim() }); i = end + 2; continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let value = '', closed = false; const quote = c; i++
      while (i < text.length) {
        // SQL_MODE is not part of this interpreter: ambiguous escape syntax is unknown.
        if (text[i] === '\\') return null
        if (text[i] === quote) {
          if (text[i + 1] === quote) { value += quote; i += 2; continue }
          i++; closed = true; break
        }
        value += text[i++]
      }
      if (!closed) return null
      result.push({ kind: quote === '`' ? 'id' : 'string', value }); continue
    }
    const word = /^[a-zA-Z0-9_]+/.exec(text.slice(i))
    if (word) { result.push({ kind: 'word', value: word[0] }); i += word[0].length; continue }
    result.push({ kind: 'symbol', value: c }); i++
  }
  return result
}
const keyword = (token, value) => token?.kind === 'word' && token.value.toUpperCase() === value
const symbol = (token, value) => token?.kind === 'symbol' && token.value === value
const identifier = token => ['word', 'id'].includes(token?.kind)

// tidb-8.5.3-email-check-utf8mb4-v1: the supplied SHOW CREATE representation
// restores all four ASCII regexp/flag literals with explicit utf8mb4 introducers.
// Pin the predicate too: a matching name alone must never authorize equivalence.
const canonicalEmailPredicate = "email IS NOT NULL AND OCTET_LENGTH(email) BETWEEN 1 AND 254 AND NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c') AND REGEXP_LIKE(email, '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$', 'c')"
// tidb-8.5.3-product-image-check-utf8mb4-v1: exact observed IN-list only.
const canonicalProductImagePredicate = "image_key IN ('figura','manga','polo','llavero')"
// tidb-8.5.3-order-currency-check-utf8mb4-v1: exact observed currency literal only.
const canonicalOrderCurrencyPredicate = "moneda = 'PEN'"
// tidb-8.5.3-promotion-destination-check-utf8mb4-v1: exact observed destinations only.
const canonicalPromotionDestinationPredicate = "destino IN ('/animes','/tienda')"

// Optional diagnostics carry only fixed reason codes, never input SQL or token values.
function tableDeclaration(ddl, identity, diagnostics) {
  const reject = detailReason => { if (diagnostics) diagnostics.detailReason = detailReason; return unknown }
  const ts = tokens(ddl)
  if (!ts) return reject('ddl-lexically-uninterpretable')
  if (!keyword(ts[0], 'CREATE') || !keyword(ts[1], 'TABLE')) return reject('create-table-header-invalid')
  let start = 2
  if (!identifier(ts[start])) return reject('table-identifier-invalid')
  let tableName = ts[start++].value
  if (symbol(ts[start], '.')) {
    if (tableName !== identity.database || !identifier(ts[start + 1])) return reject('table-schema-mismatch-or-invalid')
    tableName = ts[start + 1].value; start += 2
  }
  if (tableName !== identity.tableName || !symbol(ts[start], '(')) return reject('table-name-or-body-invalid')
  let depth = 1, from = start + 1, end = -1; const clauses = []
  for (let i = from; i < ts.length; i++) {
    if (symbol(ts[i], '(')) depth++
    if (symbol(ts[i], ')')) depth--
    if (depth < 0) return reject('ddl-parentheses-invalid')
    if (depth === 0) { clauses.push(ts.slice(from, i)); end = i; break }
    if (depth === 1 && symbol(ts[i], ',')) { clauses.push(ts.slice(from, i)); from = i + 1 }
  }
  if (end < 0 || !keyword(ts[end + 1], 'ENGINE') || !symbol(ts[end + 2], '=') || !keyword(ts[end + 3], 'INNODB')) return reject('table-body-or-engine-invalid')
  // Only a bounded grammar of known SHOW CREATE table options is supported.
  const suffix = ts.slice(end + 4), options = new Set()
  for (let i = 0; i < suffix.length;) {
    if (symbol(suffix[i], ';') && i === suffix.length - 1) break
    const hasDefault = keyword(suffix[i], 'DEFAULT')
    if (hasDefault) i++
    const option = suffix[i++]
    if (option?.kind !== 'word' || !['CHARSET', 'COLLATE', 'AUTO_INCREMENT', 'COMMENT'].includes(option.value.toUpperCase())) return reject('table-option-unsupported')
    const name = option.value.toUpperCase()
    if (hasDefault && !['CHARSET', 'COLLATE'].includes(name)) return reject('table-option-default-invalid')
    if (options.has(name) || !symbol(suffix[i++], '=')) return reject('table-option-duplicate-or-incomplete')
    options.add(name)
    const value = suffix[i++]
    if (name === 'COMMENT' ? value?.kind !== 'string'
      : name === 'AUTO_INCREMENT' ? value?.kind !== 'word' || !/^\d+$/.test(value.value)
        : !identifier(value)) return reject('table-option-value-invalid')
  }
  // Comments preceding a clause or executable comments can hide duplicate objects.
  if (clauses.some(c => !c.length || c.some((t, i) => t.kind === 'comment'
    && (!keyword(c[0], 'CONSTRAINT') || i !== c.length - 1
      || !['!80016 NOT ENFORCED', 'FOREIGN KEY INVALID'].includes(t.value))
      && !(identity.declarationMode === 'runtime-v1' && i === c.length - 1 && !keyword(c[0], 'CONSTRAINT') && /^T!\[clustered_index\]\s+(?:CLUSTERED|NONCLUSTERED)$/.test(t.value))))) return reject('clause-comment-unsupported-or-ambiguous')
  return clauses
}

// Pure syntax/marker interpretation, without fabricating offline capture provenance.
export function inspectConstraintDeclaration(ddl, identity, diagnostics) {
  const reject = detailReason => { if (diagnostics) diagnostics.detailReason = detailReason; return unknown }
  if (!['8.5.3', '8.0.11-TiDB-v8.5.3-serverless'].includes(identity?.engineVersion)
    || !identity.definition || !['CHECK', 'FOREIGN KEY'].includes(identity.type)) return reject('interpretation-context-unsupported')
  const clauses = tableDeclaration(ddl, identity, diagnostics)
  if (!Array.isArray(clauses)) return unknown
  const matches = clauses.filter(c => keyword(c[0], 'CONSTRAINT') && identifier(c[1]) && c[1].value === identity.name)
  if (matches.length !== 1) return reject(matches.length ? 'constraint-duplicate' : 'constraint-absent')
  const clause = matches[0]
  const comments = clause.filter(t => t.kind === 'comment').map(t => t.value)
  if (comments.some(c => c !== '!80016 NOT ENFORCED' && c !== 'FOREIGN KEY INVALID')) return reject('constraint-syntax-or-marker-unsupported')
  const body = clause.filter(t => t.kind !== 'comment')
  // Preserve quoted identifier case; JSON tuple encoding cannot collide on '|'.
  const canonical = list => JSON.stringify(list.map(t => ['word', 'id'].includes(t.kind)
    ? ['identifier', t.kind === 'word' ? t.value.toLowerCase() : t.value] : [t.kind, t.value]))
  if (identity.type === 'CHECK') {
    if (!keyword(body[2], 'CHECK') || !symbol(body[3], '(')) return reject('constraint-syntax-or-marker-unsupported')
    const disabled = comments.includes('!80016 NOT ENFORCED')
    if (comments.includes('FOREIGN KEY INVALID')) return reject('constraint-syntax-or-marker-unsupported')
    const enabled = keyword(body.at(-1), 'ENFORCED') && !keyword(body.at(-2), 'NOT')
    const explicitDisabled = keyword(body.at(-2), 'NOT') && keyword(body.at(-1), 'ENFORCED')
    if (enabled && disabled) return reject('constraint-syntax-or-marker-unsupported')
    if (!symbol(body.at(-1), ')') && !enabled && !explicitDisabled) return reject('constraint-syntax-or-marker-unsupported')
    let expression = body.slice(3, explicitDisabled ? -2 : enabled ? -1 : undefined)
    const unwrap = list => {
      while (symbol(list[0], '(') && symbol(list.at(-1), ')')) {
        let n = 0, wraps = true
        for (let i = 0; i < list.length - 1; i++) {
          if (symbol(list[i], '(')) n++
          if (symbol(list[i], ')')) n--
          if (!n) { wraps = false; break }
        }
        if (!wraps) break
        list = list.slice(1, -1)
      }
      return list
    }
    expression = unwrap(expression)
    const expectedExpression = unwrap(tokens(identity.definition.clause) ?? [])
    const exactMatch = canonical(expression) === canonical(expectedExpression)
    // Runtime already checks usuarios.email VARCHAR(254)/utf8mb4_0900_bin.
    // Compare a second, fully specified token sequence; never strip arbitrary
    // charsets, COLLATE clauses, literals, grouping, operators or comments.
    const restoredEmailMatch = !exactMatch && identity.declarationMode === 'runtime-v1'
      && identity.database === 'otakuzone_prod' && identity.tableName === 'usuarios' && identity.name === 'ck_usuarios_email_canonical'
      && canonical(expectedExpression) === canonical(tokens(canonicalEmailPredicate))
      && canonical(expression) === canonical(expectedExpression.flatMap(t => t.kind === 'string' ? [{ kind: 'word', value: '_utf8mb4' }, t] : [t]))
    const restoredProductImageMatch = !exactMatch && identity.declarationMode === 'runtime-v1'
      && identity.database === 'otakuzone_prod' && identity.tableName === 'productos' && identity.name === 'ck_productos_image'
      && canonical(expectedExpression) === canonical(tokens(canonicalProductImagePredicate))
      && canonical(expression) === canonical(expectedExpression.flatMap(t => t.kind === 'string' ? [{ kind: 'word', value: '_utf8mb4' }, t] : [t]))
    const restoredOrderCurrencyMatch = !exactMatch && identity.declarationMode === 'runtime-v1'
      && identity.database === 'otakuzone_prod' && identity.tableName === 'pedidos' && identity.name === 'ck_pedidos_moneda'
      && canonical(expectedExpression) === canonical(tokens(canonicalOrderCurrencyPredicate))
      && canonical(expression) === canonical(expectedExpression.flatMap(t => t.kind === 'string' ? [{ kind: 'word', value: '_utf8mb4' }, t] : [t]))
    const restoredPromotionDestinationMatch = !exactMatch && identity.declarationMode === 'runtime-v1'
      && identity.database === 'otakuzone_prod' && identity.tableName === 'promociones' && identity.name === 'ck_promociones_destino'
      && canonical(expectedExpression) === canonical(tokens(canonicalPromotionDestinationPredicate))
      && canonical(expression) === canonical(expectedExpression.flatMap(t => t.kind === 'string' ? [{ kind: 'word', value: '_utf8mb4' }, t] : [t]))
    if (!expression.length || !exactMatch && !restoredEmailMatch && !restoredProductImageMatch && !restoredOrderCurrencyMatch && !restoredPromotionDestinationMatch) return reject('check-expression-unknown-or-different')
    return disabled || explicitDisabled ? false : true
  }
  if (!keyword(body[2], 'FOREIGN') || !keyword(body[3], 'KEY') || !symbol(body[4], '(')
    || !body.some(t => keyword(t, 'REFERENCES')) || comments.includes('!80016 NOT ENFORCED')) return reject('constraint-syntax-or-marker-unsupported')
  if (identity.declarationMode === 'runtime-v1') {
    const reference = body.findIndex(t => keyword(t, 'REFERENCES'))
    if (identifier(body[reference + 1]) && symbol(body[reference + 2], '(')) body.splice(reference + 1, 0, { kind: 'id', value: identity.database }, { kind: 'symbol', value: '.' })
    for (const action of ['DELETE', 'UPDATE']) {
      const at = body.findIndex((t, i) => keyword(t, 'ON') && keyword(body[i + 1], action))
      if (at < 0) body.push({ kind: 'word', value: 'ON' }, { kind: 'word', value: action }, { kind: 'word', value: 'RESTRICT' })
      else if (keyword(body[at + 2], 'NO') && keyword(body[at + 3], 'ACTION')) body.splice(at + 2, 2, { kind: 'word', value: 'RESTRICT' })
    }
  }
  if (identity.definition) {
    const d = identity.definition
    const ids = names => names.map(name => `\`${name}\``).join(',')
    const expected = tokens(`CONSTRAINT \`${identity.name}\` FOREIGN KEY (${ids(d.columns)}) REFERENCES \`${d.referencedSchema}\`.\`${d.referencedTable}\` (${ids(d.referencedColumns)}) ON DELETE ${d.onDelete} ON UPDATE ${d.onUpdate}`)
    if (canonical(body) !== canonical(expected)) return reject('fk-definition-unknown-or-different')
  }
  return comments.includes('FOREIGN KEY INVALID') ? false : true
}

function declarative(record, identity) {
  if (!provenance(record, identity, 'show-create-table')) return unknown
  return inspectConstraintDeclaration(record.ddl, identity)
}

export function declaredConstraintNames(ddl, identity, diagnostics) {
  const clauses = tableDeclaration(ddl, identity, diagnostics)
  if (!Array.isArray(clauses)) return null
  const names = []
  for (const c of clauses) {
    if (!keyword(c[0], 'CONSTRAINT')) continue
    if (!identifier(c[1]) || !(keyword(c[2], 'CHECK') || keyword(c[2], 'FOREIGN') && keyword(c[3], 'KEY'))) {
      if (diagnostics) diagnostics.detailReason = 'constraint-header-uninterpretable'
      return null
    }
    names.push(c[1].value)
  }
  return names
}

// This reader is only for checksum-validated local catalog SQL. It never executes it.
export function catalogConstraintDefinitions(sql, target) {
  const database = tidbDatabase(target)
  const ts = tokens(sql.replace(/^\s*--.*$/gm, ''))
  if (!ts) throw new Error('Catálogo: definición SQL no interpretable.')
  const statements = []; let current = []
  for (const t of ts) { if (symbol(t, ';')) { statements.push(current); current = [] } else current.push(t) }
  if (current.length) throw new Error('Catálogo: sentencia incompleta.')
  const render = list => list.map(t => t.kind === 'string' ? `'${t.value.replaceAll("'", "''")}'`
    : t.kind === 'id' ? `\`${t.value.replaceAll('`', '``')}\`` : t.value).join(' ')
  const definitions = []
  for (const statement of statements) {
    let start, tableName
    if (keyword(statement[0], 'CREATE') && keyword(statement[1], 'TABLE')) {
      start = keyword(statement[2], 'IF') ? 5 : 2
      tableName = statement[start++]?.value
      if (!symbol(statement[start], '(')) throw new Error('Catálogo: tabla no interpretable.')
      start++
    } else if (keyword(statement[0], 'ALTER') && keyword(statement[1], 'TABLE')) {
      tableName = statement[2]?.value; start = 3
    } else continue
    let depth = 0, clause = []; const clauses = []
    for (let i = start; i < statement.length; i++) {
      const t = statement[i]
      if (symbol(t, '(')) depth++
      if (symbol(t, ')')) { if (depth === 0) { clauses.push(clause); break } depth-- }
      if (depth === 0 && symbol(t, ',')) { clauses.push(clause); clause = [] } else clause.push(t)
      if (i === statement.length - 1) clauses.push(clause)
    }
    for (let c of clauses) {
      if (keyword(c[0], 'ADD')) c = c.slice(1)
      if (!keyword(c[0], 'CONSTRAINT')) continue
      const name = c[1]?.value
      if (keyword(c[2], 'CHECK')) {
        const body = keyword(c.at(-1), 'ENFORCED') ? c.slice(3, -1) : c.slice(3)
        definitions.push({ name, type: 'CHECK', tableName, definition: { name, clause: render(body) } })
      } else if (keyword(c[2], 'FOREIGN') && keyword(c[3], 'KEY')) {
        const reference = c.findIndex(t => keyword(t, 'REFERENCES'))
        const onDelete = c.findIndex((t, i) => keyword(t, 'ON') && keyword(c[i + 1], 'DELETE'))
        const onUpdate = c.findIndex((t, i) => keyword(t, 'ON') && keyword(c[i + 1], 'UPDATE'))
        if (reference < 0) throw new Error('Catálogo: FK incompleta.')
        const close = c.findIndex((t, i) => i > reference + 1 && symbol(t, ')'))
        const names = list => list.filter(identifier).map(t => t.value)
        const definition = { name, columns: names(c.slice(5, reference - 1)), referencedSchema: database, referencedTable: c[reference + 1]?.value,
          referencedColumns: names(c.slice(reference + 3, close)), onDelete: onDelete < 0 ? 'RESTRICT' : c[onDelete + 2]?.value.toUpperCase(), onUpdate: onUpdate < 0 ? 'RESTRICT' : c[onUpdate + 2]?.value.toUpperCase() }
        definitions.push({ name, type: 'FOREIGN KEY', tableName, definition })
      } else throw new Error('Catálogo: tipo de restricción no interpretable.')
    }
  }
  return definitions
}

export function interpretEnforcementEvidence(evidence, identity) {
  const result = { declarative: unknown, configuration: unknown, functional: unknown, contradictory: false, invalidEvidence: false }
  if (!['CHECK', 'FOREIGN KEY'].includes(identity?.type) || evidence?.format !== evidenceFormat) return result
  const d = identity.definition
  if (!d || !nonempty(identity.name) || !nonempty(identity.tableName) || !nonempty(identity.database)) return result
  if (identity.type === 'CHECK' ? !nonempty(d.clause)
    : ![d.columns, d.referencedColumns].every(list => Array.isArray(list) && list.length && list.every(nonempty))
      || ![d.referencedSchema, d.referencedTable, d.onDelete, d.onUpdate].every(nonempty)) return result
  for (const dimension of ['declarative', 'configuration', 'functional']) {
    const records = evidence[dimension]
    if (!Array.isArray(records)) { result.invalidEvidence = true; continue }
    if (!records.length) continue
    const values = records.map(record => {
      if (dimension === 'declarative') return declarative(record, identity)
      if (dimension === 'functional') {
        if (!provenance(record, identity, 'functional-observation') || !state(record.outcome)
          || !nonempty(identity.sessionId) || record.sessionId !== identity.sessionId) { result.invalidEvidence = true; return unknown }
        return record.outcome
      }
      if (!provenance(record, identity, 'session-observation') || record.scope !== 'session'
        || !nonempty(identity.sessionId) || record.sessionId !== identity.sessionId) return unknown
      const names = identity.type === 'CHECK' ? ['tidb_enable_check_constraint'] : ['tidb_enable_foreign_key', 'foreign_key_checks']
      if (names.some(name => record.controlScopes?.[name] !== (name === 'foreign_key_checks' ? 'session' : 'global'))) return unknown
      const controls = names.map(name => record.controls?.[name])
      if (controls.some(value => !state(value))) return unknown
      return controls.includes(false) ? false : controls.includes(unknown) ? unknown : true
    })
    if (values.includes(true) && values.includes(false)) result.contradictory = true
    // A valid negative functional observation must never be diluted into unknown.
    result[dimension] = dimension === 'functional' && values.includes(false) ? false : new Set(values).size === 1 ? values[0] : unknown
  }
  const records = ['declarative', 'configuration', 'functional'].flatMap(key => Array.isArray(evidence[key]) ? evidence[key] : [])
  if (new Set(records.map(r => `${r?.engineVersion}/${r?.versionMapping}`)).size > 1) result.contradictory = true
  if (result.functional === true && (result.declarative === false || result.configuration === false)) result.contradictory = true
  return result
}

export function requireEnforcementEvidence(evidence, identity) {
  const result = interpretEnforcementEvidence(evidence, identity)
  if (result.invalidEvidence || result.contradictory || result.declarative !== true || result.configuration !== true || result.functional === false) {
    throw new Error(`Plan 006 bloqueado: evidencia incompatible o desconocida: ${identity.name}.`)
  }
  return result
}
