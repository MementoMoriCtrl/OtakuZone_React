# OtakuZone — Etapa 4.1: contrato tipado de atributos y candidato v3

Fecha: **17 de noviembre de 2026**. Implementación exclusivamente local. La recuperación de 006 no se autoriza ni ejecuta.

## 1. Resultado y archivos

Se implementa un contrato discriminado para atributos de columnas, un adaptador puro y explícito de v2 a v3 y un comparador integrado con el planificador offline. Se crea [el candidato v3](snapshots/tidb-006-snapshot-v3-candidate.json), independiente e incompleto. No se modifica ningún snapshot histórico ni se ejecuta el planificador sobre datos reales.

| Archivo | Cambio |
| --- | --- |
| `backend/src/db/columnAttributeContract.js` | Nuevo contrato/validación, reconciliación de observaciones, regla de no aplicabilidad y comparador |
| `backend/src/db/tidb006SnapshotV3.js` | Nuevo adaptador puro, conservación de fuente y registro de conversiones |
| `backend/src/db/tidb006RecoveryPlan.js` | Comparación tipada para v3 y validación de conflictos; conserva vía v2 estricta |
| `backend/tests/tidb-column-attributes.test.js` | 25 pruebas nuevas |
| `docs/snapshots/tidb-006-snapshot-v3-candidate.json` | Nuevo candidato parcial |
| Este informe | Diseño, procedencia, resultados y límites |

Los demás cambios visibles en Git pertenecen a etapas anteriores. No cambian CLI, intérprete de enforcement, runtime/preflight, migrador normal, SQL, manifests, hashes históricos, .env, certificados o credenciales. No se añade un ejecutor remoto ni se instalan dependencias.

## 2. Versiones y cinco estados

- Snapshot: `otakuzone-tidb006-snapshot-v3`.
- Atributos: `otakuzone-column-attribute-v1`.
- Adaptación: `otakuzone-v2-to-v3-adaptation-v1`.
- Regla semántica: `tidb-8.5.3-nontext-character-attributes-v1`.

Cada una de las siete propiedades de una columna es ahora un objeto tipado: type, nullable, charset, collation, default, extra y generationExpression. Las definiciones esperadas exportadas por tidb006Contract siguen siendo valores canónicos de comparación, no evidencia de producción. El contrato exporta v3 como formato actual y enumera v2/v3 como formatos soportados.

| Estado | Representación / aceptación |
| --- | --- |
| observed-value | value escalar tipado: string, booleano o número finito. No admite null. Debe coincidir exactamente con el valor esperado; string vacío conserva su significado |
| observed-sql-null | Estado explícito sin propiedad value. Se compara solo contra una expectativa canónica null; no equivale a omisión ni a string "NULL" |
| not-applicable | Sin value. Exige regla registrada y aprobada, tipo observado, vínculo a su evidencia y validación de aplicabilidad; no afirma haber leído SQL NULL |
| unknown | Sin value; reason y procedencia parcial. Puede conservar hechos parciales sin decidir un literal. Bloquea un atributo obligatorio |
| conflict | Sin value; conserva dos o más observaciones y su procedencia. Bloquea el snapshot v3 incluso si aparece en una columna fuera del subconjunto estructural anteriormente comprobado |

La procedencia contiene source, evidenceRefs, engineVersion, completeness (`complete` o `partial`) e integrity=`manual-unverified`. capturedAt es opcional: si se proporciona debe ser una fecha UTC ISO válida, sin normalizar fechas imposibles. **No se genera una fecha de captura con la fecha de esta implementación.**

En atributos presentes de v2, complete significa que el valor literal está completamente transcrito en ese candidato; no significa captura SQL autenticada ni metadata global completa. Las referencias son rutas reales a la fuente y JSON pointers, no identificadores inventados de sesiones. Ninguna fuente manual adquiere confianza autenticada.

La reconciliación conserva observaciones coincidentes. Diferencias de estado/valor, hechos parciales, regla/base o versión producen conflicto, sin elegir por mayoría ni ignorar versiones distintas. Un unknown no se transforma en observed-value porque coincida con la expectativa del código.

## 3. Regla explícita de no aplicabilidad

El alcance aprobado e implementado es deliberadamente estrecho:

| Condición | Requisito |
| --- | --- |
| Campo | Solo charset o collation |
| Tipo | Solo `bigint unsigned`, `decimal(10,2)` o `timestamp(3)`, exactamente en forma canónica y con estado observed-value |
| Versión declarada | `8.5.3` o `8.0.11-TiDB-v8.5.3-serverless` |
| Autorización local de regla | Nombre exacto presente en approvedRules del adaptador y columnRules del v3; solo se admiten reglas del registro compilado |
| Estado previo | unknown, sin hechos parciales que requieran otra revisión |
| Expectativa del comparador | null canónico para ese campo; tipo observado igual al esperado |

La regla interpreta **aplicabilidad semántica del atributo**, no la representación de una celda remota ni la equivalencia del binario administrado. El manual MySQL describe CHARACTER_SET_NAME/COLLATION_NAME como atributos de columnas de cadenas de caracteres. Es el fundamento de esta clasificación limitada; no se usa para inventar celdas SQL NULL de TiDB. [Referencia oficial COLUMNS](https://dev.mysql.com/doc/refman/8.0/en/information-schema-columns-table.html).

La derivación conserva el atributo unknown previo en previous y registra ruleVersion, typeEvidenceRef, typeValue y SHA-256 de la evidencia tipada del tipo. El comparador recalcula el vínculo y comprueba versión/coherencia. Cambiar después el tipo invalida la derivación. El previous se mantiene como antecedente, no como estado actual pendiente de ese mismo campo.

No hay regla para default, extra, nullable o generationExpression; tampoco se extiende a todos los tipos numéricos/temporales por una expresión regular permisiva. Los tipos no incluidos, representaciones distintas o reglas desconocidas bloquean la derivación. No se reemplaza un valor observado por not-applicable para hacer coincidir el contrato.

Esta es una decisión semántica versionada dentro del alcance local autorizado, **no una certificación Serverless ni una relajación de enforcement**. No cambia la comprobación runtime ENFORCED ni resuelve su incompatibilidad conocida.

## 4. Adaptador explícito y conservación

API pura: `adaptTidb006SnapshotV2(sourceText, options)`. No lee archivos, carga .env, obtiene credenciales, conecta ni ejecuta SQL. El llamador controla explícitamente la lectura/escritura local.

Se requieren sourceRef real y `presentValuePolicy=confirmed-v2-transcription-v1`: el llamador declara que los valores presentes en ese v2 son transcripciones confirmadas según su convención. No hay interpretación automática de placeholders v1. Una entrada v1, política omitida, regla desconocida, columnas ya tipadas o banderas de ejecución true se rechazan.

Conversiones:

1. Propiedad presente no null → observed-value, conservando tipo y literal.
2. Propiedad presente null → observed-sql-null, únicamente bajo la política explícita de transcripción confirmada de v2.
3. Propiedad omitida → unknown. Su referencia apunta al objeto de columna en la fuente; no finge una celda SQL observada.
4. Reglas expresamente aprobadas pueden derivar not-applicable, conservando el unknown anterior. Sin aprobación, el campo permanece unknown.
5. Hechos parciales adicionales se adjuntan solo a unknown, con fuente/referencias explícitas. Un hecho no cambia su valor; hechos contradictorios pasan a conflict.

`adaptation.originalSnapshot` conserva **todo el objeto v2 original**, incluidos ledger, flags, contexto, datos, columnas, propiedades y evidencia. sourceSha256 identifica los bytes UTF-8 de entrada; originalCanonicalSha256 identifica su objeto JSON serializado. No confundir la segunda huella con la huella del archivo original. La conversión conserva información JSON y su huella de origen, sin prometer reconstrucción del formato/espacios del archivo.

`adaptation.conversions` registra las conversiones de atributos, cambios de formato/política de completitud y hechos parciales/derivaciones. Las reglas aplicadas se conservan en columnRules. El adaptador **siempre produce metadataComplete=false**, metadataApproval=false y las tres banderas false, incluso si la fuente sintética estuviera completa. Se requiere revisión independiente para cualquier evaluación posterior; no existe un modo de aprobar automáticamente metadata.

## 5. Candidato real creado

Fuente: `docs/snapshots/tidb-006-snapshot-v2-candidate.json`, sin reescribirla. Las observaciones presentes se transcriben desde ese archivo y su procedencia manual documentada. No se copian valores de las migraciones, contratos o fixtures para rellenar datos reales.

Se aplicó explícitamente la regla de no aplicabilidad a estos diez campos:

- pedidos.id: charset/collation.
- pedidos.usuario_id: charset/collation.
- pedidos.costo_envio: charset/collation.
- pedidos.creado_en: charset/collation.
- carritos.id: charset/collation.

**No se declara que se observaron diez SQL NULL.** El estado de esos campos es not-applicable y contiene su derivación.

Se preservaron además seis hechos parciales respaldados por [3.21](DESPLIEGUE_ETAPA_3_21_SNAPSHOT_V2.md): default_is_null=0 para pedidos.usuario_id.default y extra_is_null=0 para los cinco EXTRA pendientes. Cada hecho incluye ruta/fuente y referencia al informe; no tiene fecha ni identificador inventados. El valor literal de default/EXTRA no se deduce de esos indicadores.

Balance del candidato, 12 columnas × siete atributos:

| Estado actual | Cantidad |
| --- | --- |
| observed-value | 31 |
| observed-sql-null | 2, los defaults de ambos id confirmados |
| not-applicable | 10, derivados explícitamente |
| unknown | 41 |
| conflict | 0 detectados con esta evidencia |

Se registran **103 entradas de conversión**: 84 envoltorios de atributos, diez derivaciones, seis hechos parciales y tres registros de formato/completitud/confianza. No son 103 lecturas remotas ni acciones SQL.

Los seis unknown que todavía bloquean las columnas obligatorias son:

| Atributo | Hecho conocido que no resuelve el literal |
| --- | --- |
| pedidos.usuario_id.default | default_is_null=0 |
| pedidos.usuario_id.extra | extra_is_null=0 |
| pedidos.estado.extra | extra_is_null=0 |
| pedidos.moneda.extra | extra_is_null=0 |
| pedidos.costo_envio.extra | extra_is_null=0 |
| pedidos.creado_en.extra | extra_is_null=0 |

Los otros 35 unknown son siete atributos de cada una de las cinco columnas de carritos distintas de id. Se conservan explícitos aunque el alcance estructural previo no los exija todos. El hecho de que usuario_activo_id sea STORED GENERATED sigue documentado históricamente; no se reconstruyen su expresión ni atributos incompletos.

El contexto sigue sin captureId/sessionId/versionMapping y las cuatro estructuras de enforcement conservan sus listas vacías. No se eleva declarative, configuration ni functional a true. Ledger idéntico a v2: cinco applied, 006 applying, sin fila 007.

## 6. Comparador y compatibilidad

El planificador soporta v2 y v3 mediante ramas explícitas. **V2 conserva la comparación cruda estricta anterior** y sus guardias de integridad; no se convierte silenciosamente. V1 continúa rechazado. V3 exige el formato de atributos, reglas registradas y siete estados válidos por columna; no admite mezclar escalares crudos con nodos tipados.

En v3, unknown bloquea donde el atributo es obligatorio; conflict bloquea globalmente en los atributos de tablas declaradas. observed-value debe coincidir exactamente, incluido el tipo JS. observed-sql-null no equivale a ausencia. not-applicable necesita regla y vínculo comprobados. Las versiones de procedencia deben coincidir con el contexto del snapshot.

Se conservan todas las guardias previas de hashes, destino, ledger parcial, restricciones, índices, datos y procedencia de enforcement. Las comparaciones de columnas añadidas e historial existente también utilizan el comparador tipado en v3. No se cambia el SQL generado ni se amplía la herramienta a ejecución.

Las salidas mantienen las tres banderas false y confianza manual. Su formato es recovery-plan-v3 para fixtures v3, conservando recovery-plan-v2 para v2. Cambiar snapshotFormat exportado a v3 no convierte las definiciones canónicas baseColumns en observaciones: quien cree v3 debe usar el adaptador/contrato tipado.

## 7. Pruebas y validaciones reales

Comando final ejecutado, solo fixtures/dobles:

```text
node --test backend/tests/tidb-column-attributes.test.js backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js
```

**171/171 aprobadas, sin fallidas/omitidas/canceladas:** 25 nuevas del contrato/adaptador/comparador y 146 regresiones relacionadas conservadas. Cubren cinco estados, vacío frente a NULL/ausencia, valor no coincidente, procedencia/fecha, conflictos y versiones, reglas aprobadas/rechazadas, cambios de base de derivación, conservación de fuente, conversiones explícitas, hechos parciales y contradicciones, integridad de snapshots históricos y bloqueo de planificación sintética ante unknown/conflict.

La ejecución fuera del sandbox fue autorizada para el runner. Los planes calculados en tests son exclusivamente sintéticos; el fixture marca metadataComplete=true solo para ejercitar aceptación o rechazo. Las referencias al migrador usan dobles y se conserva el guardia de sockets de la suite de recuperación. No se ejecuta SQL contra servidores.

`npm run lint`: aprobado. No se instala nada ni se ejecuta build frontend. No se modifican pruebas históricas para hacerlas pasar.

Validación estructural del candidato v3 real: JSON y estados válidos, archivo original archivado idéntico a v2, hash de fuente correcto, ledger idéntico y seis unknown obligatorios enumerados. Se verifican únicamente mediante el contrato/comparador puro las columnas id de pedidos/carritos ya resueltas; **no se llama al planificador ni a su CLI con el candidato real**.

## 8. Preservación y limitaciones

| Snapshot histórico | SHA-256 preservado |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |

Ambos se comparan al inicio y al cierre y tienen pruebas de regresión de su huella. Sus valores de metadataComplete siguen false. Los informes históricos y los SQL/MySQL/TiDB, ledgers/manifests se verifican sin cambios. La consulta runtime ENFORCED permanece intacta y su bloqueo conocido no queda resuelto por esta etapa.

Límites vigentes:

- La fuente v2 es transcripción manual. Archivar el original y sus hashes garantiza trazabilidad local, no autenticidad del servidor ni vigencia de las capturas.
- El adaptador exige la política explícita sobre valores presentes; no puede detectar una mentira coherente en esa declaración. V1 se rechaza precisamente para no interpretar sus placeholders como observaciones.
- Fechas de captura faltantes siguen ausentes. La completitud de un literal no acredita contexto/sesión de enforcement ni habilita operaciones remotas.
- La regla semántica es estrecha; tipos/formatos/versiones fuera de su lista necesitan revisión explícita. No cubre defecto de default ni atributos EXTRA desconocidos.
- La conservación del original no elimina la necesidad de revisar cualquier enriquecimiento posterior. Las huellas de evidencia tipada son estrictas respecto de su serialización; una representación distinta puede requerir revisión, sin alterar significado o guardias automáticamente.
- No se implementan ejecutor, bitácora remota, cierre recuperado del ledger, ni solución runtime. El esquema efectivo y el binario administrado no se certifican con tests locales.

## 9. Estado final

El modelo y comparador están implementados y probados localmente. El candidato v3 sigue con **metadataComplete=false**, seis atributos obligatorios unknown y enforcement/contexto incompletos. No se convierte ningún desconocido en valor observado; las diez derivaciones llevan estado y procedencia propios.

Se mantienen `readyForRemoteExecution=false`, `ledgerTransitionAllowed=false` y `allow007=false`. No hubo conexiones TiDB/MySQL, SQL real, migraciones, recuperación, cambios de ledger/hashes históricos, usuarios/permisos, datos, probe, .env, certificados, credenciales, despliegues o commits. No se continúa automáticamente a otra etapa.
