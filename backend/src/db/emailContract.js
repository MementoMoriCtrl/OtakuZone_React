// SQL literals are shared by the TiDB catalog and metadata verification.
export const emailGuardSql = "'[^a-z0-9_''+@.-]'"
export const emailGrammarSql = "'^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$'"
export const emailCheckSql = `email IS NOT NULL
    AND OCTET_LENGTH(email) BETWEEN 1 AND 254
    AND NOT REGEXP_LIKE(email, ${emailGuardSql}, 'c')
    AND REGEXP_LIKE(email, ${emailGrammarSql}, 'c')`

// Preserve string literal bytes; normalize only SQL formatting outside literals.
export function normalizeCheckSql(sql) {
  const tokens = String(sql).match(/'(?:''|[^'])*'|`[^`]*`|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g) ?? []
  const t = tokens.map(token => token.startsWith("'") ? token : token.replace(/`/g, '').toLowerCase())
  let i = 0
  const take = value => { if (t[i++] !== value) throw new Error('Cláusula CHECK no reconocida.') }
  function primary() {
    if (t[i] === '(') { i++; const node = and(); take(')'); return node }
    const value = t[i++]
    if (!value) throw new Error('Cláusula CHECK incompleta.')
    if (t[i] !== '(') return value
    i++; const args = []
    args.push(primary())
    while (t[i] === ',') { i++; args.push(primary()) }
    take(')'); return ['call', value, args]
  }
  function unary() {
    if (t[i] === 'not') { i++; return ['not', unary()] }
    let node = primary()
    if (t[i] === 'is') { i++; take('not'); take('null'); node = ['not-null', node] }
    if (t[i] === 'between') { i++; const low = primary(); take('and'); node = ['between', node, low, primary()] }
    return node
  }
  function and() {
    const nodes = [unary()]
    while (t[i] === 'and') { i++; nodes.push(unary()) }
    const flat = nodes.flatMap(node => Array.isArray(node) && node[0] === 'and' ? node[1] : [node])
    return flat.length === 1 ? flat[0] : ['and', flat]
  }
  const result = and()
  if (i !== t.length) throw new Error('Cláusula CHECK no reconocida.')
  return JSON.stringify(result)
}
