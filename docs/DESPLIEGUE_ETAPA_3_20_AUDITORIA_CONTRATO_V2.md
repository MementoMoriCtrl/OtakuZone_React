# OtakuZone — Etapa 3.20: auditoría adversarial del contrato v2

Fecha: **17 de noviembre de 2026**. Auditoría e implementación local. No se ejecutó SQL, se abrió conexión remota ni se consumió el snapshot real con el planificador.

## A. Vulnerabilidades encontradas

Se revisaron intérprete, planificador, pruebas, CLI, candidato e informe 3.19. Los defectos afectan a la **aceptación de evidencia para una propuesta offline**. La herramienta no tiene ejecutor SQL y sus banderas de autorización permanecieron false incluso antes de estas correcciones; no se identifica una vía de ejecución remota.

| Hallazgo | Comportamiento anterior y riesgo | Corrección |
| --- | --- | --- |
| Negativo funcional diluido | `[false, "unknown"]` se agregaba como unknown. La guardia permitía unknown funcional y podía aceptar esa evidencia negativa | Un resultado funcional negativo válido se conserva como false; las contradicciones siguen bloqueando |
| Estructura funcional inválida ignorada | `functional={outcome:false}` se trataba como dimensión vacía; procedencia funcional inválida también podía perder su capacidad de bloqueo | `invalidEvidence` distingue evidencia malformada de ausencia legítima de ensayo; la guardia bloquea |
| Sufijo DDL insuficientemente validado | Se aceptaban `DEFAULT CHARSET=`, `COLLATE=`, `AUTO_INCREMENT=`, texto arbitrario y `DROP TABLE pedidos` sin separador después de ENGINE. No se ejecutaban, pero daban evidencia declarativa positiva | Gramática limitada de opciones completas, sin texto sobrante ni opciones duplicadas |
| Configuración sin vínculo de sesión/captura | `scope=session` no identificaba qué sesión se había observado. Podían mezclarse observaciones de sesiones o capturas distintas | Contexto requerido y comparación de identificadores en cada observación aplicable |
| Ámbito de cada control implícito | Los booleanos planos no diferenciaban un foreign_key_checks global del valor efectivo de sesión | `controlScopes` obligatorio: controles tidb_enable_* globales; foreign_key_checks de sesión |
| Fechas imposibles aceptadas | Date.parse normalizaba, por ejemplo, 2026-02-30 a marzo | Validación ISO mediante comparación con la fecha normalizada; una fecha imposible queda desconocida |
| Duplicados ocultos por comentarios | Una cláusula precedida por comentario no participaba en la búsqueda de nombres; podía ocultarse una segunda restricción | Se rechazan comentarios no soportados y posiciones ambiguas, incluidos comentarios que preceden cláusulas |
| Comparación que alteraba identificadores | Se convertían también los identificadores entre backticks a minúsculas, aceptando usuarios y USUARIOS sin acreditar equivalencia | Se conserva el casing de identificadores citados |
| Canonización con delimitador ambiguo | Un identificador compuesto podía contener el texto usado para unir tokens y simular varias partes de una FK | Comparación mediante arrays de pares serializados con JSON, sin colisiones por separadores |
| Intérprete sin definición esperada | La API pura admitía interpretar una FK de forma parcial cuando el consumidor omitía la definición contra la que contrastarla. El planificador sí suministraba esa definición | Se exige una definición estructural válida antes de interpretar |

Los casos de fecha, sintaxis, identidad y canonización no son pruebas de que la base remota esté incorrecta: se reprodujeron con evidencia sintética local. La colisión de tokens se demuestra con una FK compuesta sintética; las FK actuales de recuperación son simples.

## B. Casos adversariales ejecutados

La primera ejecución adversarial produjo **31 aprobadas y 10 fallidas de 41**: preservó las pruebas del intérprete de 3.19 y reprodujo los huecos iniciales antes de corregirlos. No se ocultaron esos fallos cambiando expectativas positivas para admitir entradas inseguras.

Se añadieron después casos dirigidos a los huecos de procedencia y contrato observados:

- Mezcla funcional false/unknown y evidencia funcional de estructura o procedencia ilegible.
- DDL truncado en opciones de tabla, texto extra, duplicados simples y duplicados precedidos por comentarios.
- Diferencia de casing en destinos FK y colisión de delimitadores dentro de identificadores.
- Captura, sesión o versión diferentes o ausentes.
- Ámbitos global/sesión intercambiados y controles contradictorios con procedencia completa.
- Regla de interpretación anterior y ausencia de definición esperada.
- Texto FOREIGN KEY INVALID dentro de un literal COMMENT: no se confunde con el marcador de la restricción.
- Inyección de banderas true y de una supuesta confianza authenticated en un snapshot sintético: la salida conserva las tres banderas false y confianza manual.

Se conservan los casos previos de NOT ENFORCED, FOREIGN KEY INVALID, marcadores ausentes, literales, versiones, truncamiento, desconocidos y contradicciones, además de todas las regresiones estructurales y de ledger.

## C. Correcciones y contrato endurecido

El formato del snapshot permanece `otakuzone-tidb006-snapshot-v2` y el de evidencia `otakuzone-enforcement-evidence-v1`. La regla se incrementa a **`tidb-8.5.3-markers-v2`** para no atribuir las nuevas garantías a interpretaciones anteriores. La regla markers-v1 deja de aprobar observaciones. No hay conversión automática.

Se requiere en snapshots v2 un nuevo contexto explícito:

```text
evidenceContext:
  captureId: identificador no vacío de la captura revisada
  sessionId: identificador no vacío de la sesión observada
  engineVersion: versión exacta declarada
  versionMapping: correspondencia explícitamente revisada
```

No se generan identificadores de producción, fechas ni evidencias por esta etapa. Los identificadores relacionan observaciones manuales; no son tokens de acceso, firmas ni una prueba de identidad emitida por TiDB.

Cada observación declarativa debe pertenecer al captureId y versión del contexto. Las observaciones de configuración y funcionales deben corresponder además al sessionId. Se rechazan así mezclas entre restricciones que individualmente parecían coherentes pero pertenecían a versiones o sesiones distintas. `tidb006Contract()` exporta los nombres de los cuatro campos requeridos.

La configuración conserva `controls`, y añade:

```text
controlScopes.tidb_enable_check_constraint = global
controlScopes.tidb_enable_foreign_key = global
controlScopes.foreign_key_checks = session
```

Solo se exigen los controles aplicables a cada tipo. Un control global puede haberse leído desde la sesión identificada sin convertirse por ello en una variable de sesión. La ausencia o contradicción de su ámbito no se corrige por inferencia.

`invalidEvidence=true` bloquea evidencia malformada. Una lista funcional vacía sigue representando ausencia de ensayo y functional=unknown; **no se convierte en true**. La política sigue permitiendo únicamente una propuesta offline con declarative=true y configuration=true, functional desconocido y sin negativos, contradicciones ni evidencia inválida. No permite ejecutar esa propuesta.

Los sufijos SHOW CREATE soportados se limitan a CHARSET, COLLATE, AUTO_INCREMENT numérico y COMMENT textual, con asignaciones completas y un eventual punto y coma final. DEFAULT solo se admite donde corresponde a CHARSET/COLLATE. Otras representaciones exigen revisión y permanecen unknown; no se intenta ejecutar o reparar DDL.

La salida añade **`evidenceTrust=manual-unverified`**, fijado por el programa. Ningún atributo del snapshot puede convertirlo en authenticated. Se conserva `reviewed-serverless-v8.5.3` como declaración manual de correspondencia para interpretación offline, vinculada al contexto; **no demuestra equivalencia del binario administrado con el código público**. El endurecimiento no añade una certificación de esa correspondencia.

## D. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `backend/src/db/tidbEnforcementEvidence.js` | Agregación segura, validación de procedencia/fechas/ámbitos y análisis declarativo endurecido |
| `backend/src/db/tidb006RecoveryPlan.js` | Contexto obligatorio, propagación a guardias y confianza manual explícita |
| `backend/tests/tidb-enforcement-evidence.test.js` | 24 pruebas adversariales adicionales; conserva las 31 anteriores |
| `backend/tests/tidb-006-recovery.test.js` | Seis casos adicionales de integración; conserva los 46 anteriores |
| `backend/tests/helpers/tidbEvidenceFixture.js` | Solo fixtures: contexto y ámbitos sintéticos explícitos |
| Este informe | Hallazgos, resultados, compatibilidad y límites |

No se modifica el informe histórico 3.19. Sus descripciones de la regla anterior y del contexto son históricas; este documento especifica el endurecimiento vigente. Tampoco se modifican CLI, runtime, migrador normal, preflight ni los archivos ya modificados por etapas anteriores fuera de esta lista.

## E. Resultado completo de pruebas y lint

Comando final:

```text
node --test backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js
```

**146/146 aprobadas, 0 fallidas, 0 omitidas/canceladas:**

| Grupo | Resultado |
| --- | --- |
| Intérprete | 55/55: 31 anteriores + 24 nuevas |
| Recuperación offline | 52/52: 46 anteriores + seis nuevas |
| Regresiones relacionadas | 39/39 |

`npm run lint`: aprobado. No se instalaron dependencias ni se ejecutó build frontend. Las pruebas se ejecutaron con autorización fuera del sandbox por las restricciones conocidas del runner; solo fixtures/dobles y HTTP local. Las llamadas del migrador de regresión se entregan a dobles, no a una base de datos. El guardia de sockets de la suite de recuperación permanece activo y conserva su comprobación de bloqueo previo a conexión.

`git diff --check`: sin errores; advertencias LF/CRLF sobre archivos ya modificados de etapas anteriores. Como los archivos de recuperación aún aparecen como no rastreados en Git, esa comprobación por sí sola no cubre su contenido; se revisan también sintaxis/lint y espacios finales de los archivos de esta etapa.

No se invocó la CLI ni la API del planificador con el candidato real. Los únicos planes calculados son los de fixtures de los tests.

## F. Riesgos que permanecen abiertos

1. **Procedencia manual:** captureId, sessionId, versión, fecha y reviewed-serverless-v8.5.3 siguen siendo afirmaciones del productor. Su concordancia no las autentica ni demuestra que se recogieran en TiDB. Evidencia inventada pero internamente coherente puede producir una propuesta offline; no concede ejecución.
2. **Correspondencia Serverless:** no se certificó que la implementación administrada coincida íntegramente con el tag público. No se debe interpretar evidenceTrust manual como validación del proveedor.
3. **Vigencia:** una fecha válida no garantiza frescura, ausencia de cambios posteriores, exclusión de escritores ni configuración de la futura sesión de recuperación. No se aplica una caducidad arbitraria ni se usa el reloj para aprobar evidencia. Una futura etapa remota deberá revalidar condiciones en su conexión real.
4. **Analizador limitado:** no es un parser SQL completo. Rechaza formas no soportadas y puede generar falsos bloqueos; no demuestra que todas las columnas o expresiones de un DDL sean válidas. Tampoco detecta una omisión deliberada que deje texto aparentemente completo junto a una declaración falsa de completitud. Las guardias estructurales del snapshot y la revisión humana siguen siendo necesarias.
5. **Alcance:** carritos conserva el alcance anterior de comprobación de id/PK; no se amplía silenciosamente a auditoría integral de sus restricciones. Functional unknown sigue siendo desconocido y nunca acredita rechazo funcional individual.
6. **Representación estricta:** comparaciones de columnas/índices y determinadas formas de expresiones siguen siendo estrictas. No se eliminaron guardias ni se normalizaron diferencias no revisadas para hacer pasar el candidato.

No se encontraron rutas que cambien las banderas de seguridad a true, conviertan v1 automáticamente o ejecuten SQL. Esto no transforma el planificador offline en una herramienta segura de ejecución: tal ejecutor no existe en este alcance.

## G. Preservación y cierre

El snapshot real sigue en **v1**, `metadataComplete=false`, con la misma huella SHA-256 al inicio y al cierre. No se modificó, normalizó ni migró su contenido. Sus datos desconocidos continúan pendientes.

Se mantienen explícitamente:

```text
readyForRemoteExecution=false
ledgerTransitionAllowed=false
allow007=false
```

No hubo conexiones TiDB/MySQL, SQL real, DDL/DML, migraciones, recuperación, cambios de ledger, hashes históricos, SQL 001–007, .env, certificados, credenciales, datos, probe, usuarios/grants, despliegues o commits. Se entrega la auditoría local corregida y se detiene el trabajo; no se autoriza avanzar a recuperación.
