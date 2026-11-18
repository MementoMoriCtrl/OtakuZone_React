import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretEnforcementEvidence, requireEnforcementEvidence } from '../src/db/tidbEnforcementEvidence.js'
import { evidenceFixture } from './helpers/tidbEvidenceFixture.js'

const check = { name: 'ck_pedidos_moneda', clause: "moneda = 'PEN'" }
const fk = { name: 'fk_pedidos_usuario', columns: ['usuario_id'], referencedSchema: 'otakuzone_db', referencedTable: 'usuarios', referencedColumns: ['id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' }
const identity = (type = 'CHECK') => ({ name: type === 'CHECK' ? check.name : fk.name, type, tableName: 'pedidos', database: 'otakuzone_db', captureId: 'synthetic-capture-1', sessionId: 'synthetic-session-1', engineVersion: '8.5.3', versionMapping: 'public-v8.5.3', definition: type === 'CHECK' ? check : fk })
const fixture = (type = 'CHECK') => evidenceFixture(type === 'CHECK' ? check : fk, 'pedidos', type)
const interpret = (e, type = 'CHECK') => interpretEnforcementEvidence(e, identity(type))

for (const type of ['CHECK', 'FOREIGN KEY']) {
  test(`${type}: definición completa no confunde habilitación con prueba funcional`, () => {
    const e = fixture(type), before = structuredClone(e)
    assert.deepEqual(interpret(e, type), { declarative: true, configuration: true, functional: 'unknown', contradictory: false, invalidEvidence: false })
    assert.doesNotThrow(() => requireEnforcementEvidence(e, identity(type)))
    assert.deepEqual(e, before)
  })
  test(`${type}: marcador deshabilitado bloquea`, () => {
    const e = fixture(type), marker = type === 'CHECK' ? '/*!80016 NOT ENFORCED */' : '/* FOREIGN KEY INVALID */'
    e.declarative[0].ddl = e.declarative[0].ddl.replace(') ENGINE', ` ${marker}) ENGINE`)
    assert.equal(interpret(e, type).declarative, false)
    assert.throws(() => requireEnforcementEvidence(e, identity(type)))
  })
  test(`${type}: sin configuración la definición sigue habilitada, sesión desconocida`, () => {
    const e = fixture(type); e.configuration = []
    assert.equal(interpret(e, type).declarative, true)
    assert.equal(interpret(e, type).configuration, 'unknown')
    assert.throws(() => requireEnforcementEvidence(e, identity(type)))
  })
  test(`${type}: truncamiento declarado no certifica ausencia de marcador`, () => {
    const e = fixture(type); e.declarative[0].evidenceCompleteness = 'partial'
    assert.equal(interpret(e, type).declarative, 'unknown')
  })
}
for (const mutation of [
  e => { e.declarative[0].ddl = e.declarative[0].ddl.slice(0, -10) },
  e => { e.declarative[0].ddl += '; SELECT 1' },
  e => { e.declarative[0].ddl = e.declarative[0].ddl.replace('ENGINE', '...ENGINE') },
  e => { e.declarative[0].ddl = e.declarative[0].ddl.replace("'PEN'", "'USD'") },
  e => { e.declarative[0].restrictionName = 'other' },
  e => { e.declarative[0].tableName = 'other' },
  e => { e.declarative[0].engineVersion = '8.5.4' },
  e => { e.declarative[0].capturedAt = 'not-a-date' },
  e => { e.declarative[0].interpretationRuleVersion = 'future' },
  e => { e.declarative[0].source = 'global-variable' },
]) {
  test(`evidencia inválida/desconocida falla cerrado: ${mutation.toString()}`, () => {
    const e = fixture(); mutation(e)
    assert.equal(interpret(e).declarative, 'unknown')
    assert.throws(() => requireEnforcementEvidence(e, identity()))
  })
}
test('Serverless necesita correspondencia versionada explícitamente revisada', () => {
  const e = fixture()
  const expected = { ...identity(), engineVersion: '8.0.11-TiDB-v8.5.3-serverless', versionMapping: 'reviewed-serverless-v8.5.3' }
  for (const record of [...e.declarative, ...e.configuration]) record.engineVersion = '8.0.11-TiDB-v8.5.3-serverless'
  assert.equal(interpret(e).declarative, 'unknown')
  for (const record of [...e.declarative, ...e.configuration]) record.versionMapping = 'reviewed-serverless-v8.5.3'
  assert.equal(interpretEnforcementEvidence(e, expected).declarative, true)
})
test('foreign_key_checks=false bloquea aunque la FK sea declarativamente válida', () => {
  const e = fixture('FOREIGN KEY'); e.configuration[0].controls.foreign_key_checks = false
  assert.equal(interpret(e, 'FOREIGN KEY').declarative, true)
  assert.equal(interpret(e, 'FOREIGN KEY').configuration, false)
  assert.throws(() => requireEnforcementEvidence(e, identity('FOREIGN KEY')))
})
test('variable global aislada no sustituye evidencia de sesión FK', () => {
  const e = fixture('FOREIGN KEY'); delete e.configuration[0].controls.foreign_key_checks
  assert.equal(interpret(e, 'FOREIGN KEY').configuration, 'unknown')
})
test('configuración no admite booleanos escritos como strings', () => {
  const e = fixture(); e.configuration[0].controls.tidb_enable_check_constraint = 'true'
  assert.equal(interpret(e).configuration, 'unknown')
})
test('evidencia declarativa contradictoria bloquea', () => {
  const e = fixture(), disabled = structuredClone(e.declarative[0])
  disabled.ddl = disabled.ddl.replace(') ENGINE', ' /*!80016 NOT ENFORCED */) ENGINE')
  e.declarative.push(disabled)
  assert.equal(interpret(e).contradictory, true)
  assert.throws(() => requireEnforcementEvidence(e, identity()))
})
for (const outcome of [true, false, 'unknown']) {
  test(`funcional permanece separado: ${outcome}`, () => {
    const e = fixture()
    e.functional = [{ ...e.configuration[0], source: 'functional-observation', outcome }]
    assert.equal(interpret(e).functional, outcome)
    if (outcome === false) assert.throws(() => requireEnforcementEvidence(e, identity()))
  })
}
test('marcador dentro de literal no deshabilita CHECK', () => {
  const d = { name: check.name, clause: "moneda <> 'NOT ENFORCED'" }
  const e = evidenceFixture(d, 'pedidos', 'CHECK')
  assert.equal(interpretEnforcementEvidence(e, { ...identity(), definition: d }).declarative, true)
})
test('FK con destino distinto no respalda el objeto del snapshot', () => {
  const e = fixture('FOREIGN KEY'); e.declarative[0].ddl = e.declarative[0].ddl.replace('`usuarios`', '`other`')
  assert.equal(interpret(e, 'FOREIGN KEY').declarative, 'unknown')
})
test('resultados funcionales contradictorios no se resuelven por mayoría', () => {
  const e = fixture()
  e.functional = [true, false, true].map(outcome => ({ ...e.configuration[0], source: 'functional-observation', outcome }))
  assert.equal(interpret(e).contradictory, true)
  assert.throws(() => requireEnforcementEvidence(e, identity()))
})
test('observación global no demuestra configuración de la sesión', () => {
  const e = fixture('FOREIGN KEY'); e.configuration[0].scope = 'global'
  assert.equal(interpret(e, 'FOREIGN KEY').configuration, 'unknown')
})
test('booleano legado y ausencia de evidencia no se convierten', () => {
  for (const e of [undefined, { enforced: true }, { format: 'future' }]) {
    assert.equal(interpret(e).declarative, 'unknown')
    assert.throws(() => requireEnforcementEvidence(e, identity()))
  }
})

// 3.20: regressions for concrete adversarial gaps, not synthetic SQL execution.
test('un resultado funcional negativo no desaparece al mezclar unknown', () => {
  const e = fixture()
  e.functional = [false, 'unknown'].map(outcome => ({ ...e.configuration[0], source: 'functional-observation', outcome }))
  assert.equal(interpret(e).functional, false)
  assert.throws(() => requireEnforcementEvidence(e, identity()))
})
for (const suffix of [' DEFAULT CHARSET=', ' DROP TABLE pedidos', ' COLLATE=', ' nonsense', ' AUTO_INCREMENT=']) {
  test(`sufijo DDL incompleto/no soportado bloquea: ${suffix}`, () => {
    const e = fixture(); e.declarative[0].ddl += suffix
    assert.equal(interpret(e).declarative, 'unknown')
    assert.throws(() => requireEnforcementEvidence(e, identity()))
  })
}
test('fecha imposible no es evidencia completa', () => {
  const e = fixture(); e.declarative[0].capturedAt = '2026-02-30T12:00:00.000Z'
  assert.equal(interpret(e).declarative, 'unknown')
})
test('comentario previo no permite ocultar una restricción duplicada', () => {
  const e = fixture()
  e.declarative[0].ddl = e.declarative[0].ddl.replace(') ENGINE', ", /* hidden */ CONSTRAINT `ck_pedidos_moneda` CHECK (moneda = 'USD')) ENGINE")
  assert.equal(interpret(e).declarative, 'unknown')
})
test('un nombre FK con casing distinto no equivale automáticamente en otro servidor', () => {
  const e = fixture('FOREIGN KEY'); e.declarative[0].ddl = e.declarative[0].ddl.replace('`usuarios`', '`USUARIOS`')
  assert.equal(interpret(e, 'FOREIGN KEY').declarative, 'unknown')
})
test('evidencia funcional de estructura inválida no se ignora', () => {
  const e = fixture(); e.functional = { outcome: false }
  assert.throws(() => requireEnforcementEvidence(e, identity()))
})
for (const [field, value] of [['sessionId', 'other-session'], ['sessionId', undefined], ['captureId', 'other-capture'], ['captureId', undefined], ['engineVersion', '8.5.4']]) {
  test(`configuración de otra procedencia bloquea: ${field}=${value}`, () => {
    const e = fixture('FOREIGN KEY'); e.configuration[0][field] = value
    assert.equal(interpret(e, 'FOREIGN KEY').configuration, 'unknown')
    assert.throws(() => requireEnforcementEvidence(e, identity('FOREIGN KEY')))
  })
}
for (const name of ['tidb_enable_foreign_key', 'foreign_key_checks']) {
  test(`el ámbito de ${name} no se presume por el nombre del control`, () => {
    const e = fixture('FOREIGN KEY'); e.configuration[0].controlScopes[name] = name === 'foreign_key_checks' ? 'global' : 'session'
    assert.equal(interpret(e, 'FOREIGN KEY').configuration, 'unknown')
  })
}
test('regla anterior no se interpreta con las nuevas garantías', () => {
  const e = fixture(); e.declarative[0].interpretationRuleVersion = 'tidb-8.5.3-markers-v1'
  assert.equal(interpret(e).declarative, 'unknown')
})
test('sin definición esperada no se aprueba una FK parcialmente analizada', () => {
  const expected = identity('FOREIGN KEY'); delete expected.definition
  assert.equal(interpretEnforcementEvidence(fixture('FOREIGN KEY'), expected).declarative, 'unknown')
  assert.throws(() => requireEnforcementEvidence(fixture('FOREIGN KEY'), expected))
})
test('restricción duplicada y tipo CHECK/FK intercambiado no se aceptan', () => {
  const e = fixture()
  e.declarative[0].ddl = e.declarative[0].ddl.replace(') ENGINE', ", CONSTRAINT `ck_pedidos_moneda` CHECK (moneda = 'PEN')) ENGINE")
  assert.equal(interpret(e).declarative, 'unknown')
  const wrongType = fixture(); wrongType.declarative[0].ddl = fixture('FOREIGN KEY').declarative[0].ddl.replace(fk.name, check.name)
  assert.equal(interpret(wrongType).declarative, 'unknown')
})
test('texto FOREIGN KEY INVALID en COMMENT no es marcador de la FK', () => {
  const e = fixture('FOREIGN KEY'); e.declarative[0].ddl += " DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='FOREIGN KEY INVALID';"
  assert.equal(interpret(e, 'FOREIGN KEY').declarative, true)
})
test('controles contradictorios bloquean aunque ambos tengan procedencia completa', () => {
  const e = fixture('FOREIGN KEY'), opposite = structuredClone(e.configuration[0])
  opposite.controls.foreign_key_checks = false; e.configuration.push(opposite)
  assert.equal(interpret(e, 'FOREIGN KEY').contradictory, true)
  assert.throws(() => requireEnforcementEvidence(e, identity('FOREIGN KEY')))
})
test('configuración ilegible y evidencia funcional negativa ilegible no habilitan nada', () => {
  const e = fixture(); e.functional = [{ ...e.configuration[0], source: 'functional-observation', outcome: false, capturedAt: 'bad' }]
  assert.equal(interpret(e).invalidEvidence, true)
  assert.throws(() => requireEnforcementEvidence(e, identity()))
})
test('delimitadores dentro de un identificador no simulan varias columnas FK', () => {
  const definition = { ...fk, columns: ['a', 'b'], referencedColumns: ['x', 'y'] }
  const e = evidenceFixture(definition, 'pedidos', 'FOREIGN KEY')
  e.declarative[0].ddl = e.declarative[0].ddl.replace('`a`,`b`', '`a|symbol:,|b`')
  assert.equal(interpretEnforcementEvidence(e, { ...identity('FOREIGN KEY'), definition }).declarative, 'unknown')
})
