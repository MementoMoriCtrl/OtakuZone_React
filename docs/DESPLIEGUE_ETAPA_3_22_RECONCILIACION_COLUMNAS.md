# OtakuZone — Etapa 3.22: reconciliación final de atributos de columnas

Fecha: **17 de noviembre de 2026**. Revisión exclusivamente local. **Ningún atributo nuevo pudo resolverse con evidencia literal adicional. Ambos snapshots se conservan byte a byte.** Único archivo creado: este informe.

## A. Alcance y fuentes

Se contrastaron ambos candidatos, `tidb006Contract()`, `assertColumn()` y las referencias de evidencia de los informes 3.12–3.21, incluido el cierre acumulado 3.13.2–3.17. Se buscaron resultados literales de COLUMNS/default/EXTRA y archivos de captura o exportación dentro de docs. Los archivos gráficos enumerados corresponden por su identificación a evidencias de interfaz; no se presentan como resultados SQL inspeccionados. No se encontró una exportación SQL/CSV/TSV ni una captura identificable con los valores que faltan.

Se distinguen estas fuentes reutilizables:

- **E1:** [3.21, columnas transcritas y pendientes](DESPLIEGUE_ETAPA_3_21_SNAPSHOT_V2.md): conserva el resumen manual de siete filas. EXTRA es no SQL NULL en las siete, pero solo se conoce su texto auto_increment en ambos id. generationExpression vacío confirmado ya está transcrito y no pertenece a estos 16 pendientes.
- **E2:** [3.13, correspondencia de atributos](DESPLIEGUE_ETAPA_3_13_CAPTURA_METADATOS.md): establece cómo conservar SQL NULL/string vacío, pero sus consultas y expectativas no son resultados observados.
- **E3:** [cierre, reconciliaciones 3.15–3.17](DESPLIEGUE_ETAPA_3_13_2_CIERRE_SNAPSHOT.md): documenta la falta de salidas íntegras accesibles y prohíbe deducir los atributos a partir de los tipos o fixtures.
- **E4:** [3.18, captura preparada](DESPLIEGUE_ETAPA_3_18_CAPTURA_FINAL.md): contiene consultas e instrucciones, no los resultados literales que resolverían estos campos.

El contrato y los SQL históricos solo se utilizan para identificar qué se exige; **no se usan como evidencia del estado observado**. No se solicita ni se prepara una nueva captura.

## B. Matriz de los 16 atributos

Todos permanecen **desconocidos como valor observado**, con propiedad omitida en v2. La expectativa del contrato se muestra para explicar el bloqueo, no para transcribirla.

| Nº | Atributo | Evidencia local disponible | Expectativa del contrato | Resultado |
| --- | --- | --- | --- | --- |
| 1 | pedidos.id.charset | E1: BIGINT UNSIGNED; E2/E3 no aportan la celda literal | null | Desconocido; no se deduce del tipo |
| 2 | pedidos.id.collation | Misma evidencia; no hay collation literal de columna | null | Desconocido |
| 3 | pedidos.usuario_id.charset | E1: BIGINT UNSIGNED; celda no transcrita | null | Desconocido |
| 4 | pedidos.usuario_id.collation | E1/E3: celda no transcrita | null | Desconocido |
| 5 | pedidos.usuario_id.default | E1: default_is_null=0, sin valor literal | null | Desconocido; indicador no equivale a default |
| 6 | pedidos.usuario_id.extra | E1: extra_is_null=0, sin texto de EXTRA | string vacío | Desconocido; no se asigna vacío |
| 7 | pedidos.estado.extra | E1: extra_is_null=0; enum/default conocidos no determinan EXTRA observado | string vacío | Desconocido |
| 8 | pedidos.moneda.extra | E1: extra_is_null=0; CHAR/default conocidos no determinan EXTRA observado | string vacío | Desconocido |
| 9 | pedidos.costo_envio.charset | E1: DECIMAL(10,2); celda no transcrita | null | Desconocido |
| 10 | pedidos.costo_envio.collation | E1/E3: celda no transcrita | null | Desconocido |
| 11 | pedidos.costo_envio.extra | E1: extra_is_null=0, sin texto de EXTRA | string vacío | Desconocido |
| 12 | pedidos.creado_en.charset | E1: TIMESTAMP(3); celda no transcrita | null | Desconocido |
| 13 | pedidos.creado_en.collation | E1/E3: celda no transcrita | null | Desconocido |
| 14 | pedidos.creado_en.extra | E1: extra_is_null=0; CURRENT_TIMESTAMP(3) no identifica el texto exacto de EXTRA | string vacío | Desconocido |
| 15 | carritos.id.charset | E1: BIGINT UNSIGNED; celda no transcrita | null | Desconocido |
| 16 | carritos.id.collation | E1/E3: celda no transcrita | null | Desconocido |

**Valores resueltos en 3.22: cero.** Se conservan los atributos ya confirmados de tipos, nulabilidad, defaults visibles, auto_increment y generationExpression. No se reabren índices, ledger, reglas FK o cláusulas CHECK ya incorporados.

## C. Default de pedidos.usuario_id

El indicador aportado default_is_null=0 describe un resultado no SQL NULL, pero no revela si su contenido era un literal, una representación especial o una transcripción incompleta. No hay en los archivos revisados un valor literal observado que permita resolverlo.

El null esperado en `baseColumns.usuario_id` y la definición de la migración no completan esa evidencia. Tampoco el null del candidato v1 sirve: los informes lo identifican como placeholder histórico. Se mantiene **omitida** la propiedad default del candidato v2.

Existe una discrepancia pendiente entre indicador y contrato, no una divergencia remota diagnosticada. No se elige entre error de resumen, representación del visor/metadatos o diferencia del esquema sin evidencia adicional; ninguna de esas explicaciones se declara confirmada. No se asigna null, "NULL", vacío, cero o ausencia de default como hecho observado.

## D. EXTRA: nulidad frente a texto vacío

`extra_is_null=0` excluye SQL NULL en la evidencia resumida; no distingue entre `""`, un atributo de generación de default u otro texto. Los defaults conocidos tampoco prueban la representación exacta de EXTRA en esa versión.

Los cinco EXTRA pendientes siguen omitidos. Los EXTRA de ambos id ya contienen auto_increment confirmado y no se modifican. La expresión STORED de usuario_activo_id pertenece a otra columna de carritos, fuera de estos 16; no se utiliza para reconstruir atributos de pedidos ni de carritos.id.

## E. Posibles problemas de diseño del contrato

1. **Aplicabilidad y observabilidad mezcladas.** Los diez campos charset/collation pertenecen a columnas numéricas o temporales, no a columnas de texto a las que asignar una collation de caracteres. El propio contrato representa esa no aplicabilidad mediante null. Sin embargo, `assertColumn()` exige que la propiedad exista con ese valor exacto. Una propiedad omitida y null no son equivalentes para la guardia. La semántica del tipo no prueba que se haya observado SQL NULL en la salida remota.
2. **No hay un estado tipado de procedencia por atributo de columna.** El candidato parcial usa omisión para desconocido y JSON null para un valor confirmado/no aplicable según su ámbito. El contrato no distingue por sí solo entre null observado y un null derivado legítimamente de una regla de tipos revisada. Una eventual adaptación necesitaría separar esas procedencias de manera explícita y versionada; no basta rellenar null por conveniencia.
3. **Comparación textual de EXTRA.** La expectativa extra="" no contiene una normalización por versión de metadatos. Si una captura exhibiera otra representación, habría que revisar su significado y su efecto antes de aceptarla; no retirar atributos automáticamente. Aquí no hay tal valor observado para declarar una incompatibilidad concreta.
4. **Default null no describe toda la historia DDL.** Un valor de metadato y la presencia/ausencia de una cláusula DEFAULT en un DDL no deben confundirse. El modelo compara un valor de default; no reconstruye el origen histórico de esa representación. Esa limitación tampoco permite resolver usuario_id desde el SQL original.

Estas son observaciones de diseño, **no cambios implementados ni nuevas garantías de TiDB**. No se modifica ninguna guardia ni se reclasifica como aprobado un atributo obligatorio desconocido. Tampoco se toma el charset/collation de tabla como valor de columnas numéricas/temporales.

## F. Validaciones, pruebas y lint

Validación estructural Node local: ambos JSON se leen correctamente; se enumeran exactamente 16 propiedades requeridas ausentes en v2 consultando únicamente el contrato exportado. metadataComplete=false y las tres banderas false se verifican. No se invoca el planificador sobre ninguno de los candidatos.

Comando ejecutado:

```text
node --test backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js
```

**107/107 aprobadas:** 55 del intérprete y 52 de recuperación, sin fallidas, omitidas ni canceladas. Ejecución autorizada fuera del sandbox; solo fixtures sintéticos y dobles, con el guardia de sockets de recuperación activo. No se ejecuta SQL contra un servidor. No se añaden pruebas nuevas porque no cambia implementación ni se incorpora nueva evidencia.

`npm run lint`: aprobado. No se instala nada, se ejecuta build ni se modifican código o pruebas. Las comprobaciones finales de huellas y espacios del informe verifican la preservación local.

## G. Estado final y límite de avance

| Elemento | Estado |
| --- | --- |
| Candidato v1 | Histórico intacto, metadataComplete=false |
| Candidato v2 | Intacto, metadataComplete=false; conserva los 16 atributos omitidos |
| Enforcement v2 | Procedencia/contexto y observaciones obligatorias siguen incompletos; no se convierten unknown en true |
| Recuperación | No ejecutada ni autorizada por este informe |

Se compararon las huellas SHA-256 de ambos snapshots antes y después: coinciden. Único archivo creado: este informe. No se modifican ledger, hashes históricos, migraciones 001–007, .env, certificados, credenciales, datos o probe.

No se solicitaron nuevas capturas ni se prepararon consultas adicionales. Bajo el límite de evidencia disponible no es posible reducir fielmente estos 16 pendientes; repetir la misma revisión no aportaría nuevos valores. Cualquier decisión futura de representación requiere un alcance explícito y no puede fingir una observación ausente.

Se mantienen `readyForRemoteExecution=false`, `ledgerTransitionAllowed=false` y `allow007=false`. No hubo conexiones TiDB/MySQL, SQL real, migraciones, recuperación, habilitación de 007, despliegues o commits. Se detiene la etapa al entregar este informe.
