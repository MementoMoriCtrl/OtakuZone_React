# OtakuZone — Etapa 4.3: reconciliación final de evidencia v3

Fecha: **17 de noviembre de 2026**. Revisión documental y validaciones locales. Único archivo creado: este informe. Código, preflight y snapshots permanecen intactos.

## 1. Resumen ejecutivo

**Decisión de completitud: INCOMPLETO.** No se encontró evidencia literal adicional que permita resolver los seis atributos obligatorios unknown ni completar el contexto/enforcement. No se detectó un conflicto tipado nuevo que justifique clasificar el candidato como BLOQUEADO por incompatibilidad confirmada. **La ejecución de recuperación permanece bloqueada** por evidencia insuficiente y por su autorización pendiente; ambas afirmaciones son compatibles.

El v3 es estructuralmente válido y trazable, pero no completo. Sus diez derivaciones not-applicable son verificables localmente; eso no resuelve defaults, EXTRA, estado individual de restricciones o configuración de una sesión remota. El preflight 4.2 implementado y sus fixtures no añaden observaciones reales al candidato.

No se modifica metadataComplete ni se ejecuta el planificador. Esta reconciliación se cierra sin proponer otra auditoría equivalente.

## 2. Estado de los seis atributos

Fuente existente: hechos parciales transcritos en [3.21](DESPLIEGUE_ETAPA_3_21_SNAPSHOT_V2.md), revisados en [3.22](DESPLIEGUE_ETAPA_3_22_RECONCILIACION_COLUMNAS.md) y conservados en partialFacts de v3 mediante el adaptador [4.1](DESPLIEGUE_ETAPA_4_1_CONTRATO_TIPADO_V3.md).

| Atributo | Evidencia existente suficiente para un hecho parcial | Estado | Evidencia concreta que falta |
| --- | --- | --- | --- |
| pedidos.usuario_id.default | default_is_null=0, referencia a 3.21:81 | unknown; parcial | Valor literal observado y representación inequívoca del resultado |
| pedidos.usuario_id.extra | extra_is_null=0, referencia a 3.21:36 | unknown; parcial | Texto íntegro de EXTRA o confirmación literal de string vacío |
| pedidos.estado.extra | extra_is_null=0, misma fuente | unknown; parcial | Texto íntegro de EXTRA o string vacío confirmado |
| pedidos.moneda.extra | extra_is_null=0, misma fuente | unknown; parcial | Texto íntegro de EXTRA o string vacío confirmado |
| pedidos.costo_envio.extra | extra_is_null=0, misma fuente | unknown; parcial | Texto íntegro de EXTRA o string vacío confirmado |
| pedidos.creado_en.extra | extra_is_null=0, misma fuente | unknown; parcial | Texto íntegro de EXTRA o string vacío confirmado |

No hay valores nuevos resueltos. El indicador 0 acredita no nulidad del resultado resumido, no su texto. No se asignan null, vacío, cero, ausencia de default ni DEFAULT_GENERATED. Los tipos SQL, defaults esperados, fuentes SQL y fixtures no sustituyen el literal observado.

La discrepancia entre default_is_null=0 de usuario_id y la expectativa canónica null sigue siendo una **discrepancia pendiente de explicación**, no una divergencia remota diagnosticada ni un conflict demostrado por dos valores literales. Se mantiene unknown, conservando el hecho parcial.

## 3. Reconciliación del contexto y procedencia

| Campo | Evidencia real disponible en los archivos | Conclusión |
| --- | --- | --- |
| engineVersion | Banner manual documentado y transcrito: 8.0.11-TiDB-v8.5.3-serverless | Confirmado como evidencia manual histórica; no como lectura realizada por el agente ni corroboración actual de TIDB_VERSION |
| captureId | No consta un identificador de lote revisado para estas observaciones | Falta; no se inventa ni se toma del nombre de una etapa |
| sessionId | No consta identificador de la sesión que produjo las observaciones obligatorias | Falta; no se usa el de un fixture o de otra conexión |
| versionMapping | No hay una correspondencia revisada incorporada al contexto | Falta decisión de revisión; el banner no certifica equivalencia con el código público |
| capturedAt | No constan fechas de captura de las observaciones de enforcement | Faltan donde el contrato de enforcement las exige; fechas de ledger o informes no las sustituyen |
| Procedencia de atributos de columnas | Rutas reales a v2, JSON pointers e informes para los seis hechos parciales | Trazabilidad manual disponible, no autenticidad del servidor |
| Procedencia de enforcement | Las cuatro estructuras tienen arrays vacíos | No existe una observación compatible transcrita; no puede crearse desde el código de comprobación |

capturedAt es opcional para los atributos tipados de columnas, pero obligatorio en las observaciones del contrato de enforcement utilizado por el planificador. No se amplía el requisito de fecha a todos los atributos ni se inventan fechas para satisfacer el segundo contrato.

El archivo, su SHA-256 y los JSON pointers identifican artefactos locales; **no son sessionId ni captureId emitidos por TiDB**. El registro temporal que generaría un preflight futuro corresponde a su ejecución futura, no a las capturas históricas.

## 4. Matriz individual de restricciones

La columna «conocido» registra definiciones documentadas; no se confunde con una dimensión declarative habilitada y verificada según el contrato completo.

| Restricción | Existencia/definición documentada | Declarative | Configuration | Functional |
| --- | --- | --- | --- | --- |
| pedidos.ck_pedidos_moneda | Nombre y cláusula `moneda = 'PEN'`, según evidencia previa de SHOW CREATE | unknown | unknown | unknown |
| pedidos.ck_pedidos_envio | Nombre y cláusula `costo_envio >= 0` | unknown | unknown | unknown |
| pedidos.fk_pedidos_usuario | usuario_id → otakuzone_db.usuarios(id), RESTRICT/RESTRICT | unknown | unknown | unknown |
| carritos.fk_carritos_usuario | usuario_id → otakuzone_db.usuarios(id), RESTRICT/RESTRICT | unknown | unknown | unknown |

Motivos comunes y diferencias:

- **Declarative:** se conocen nombres/cláusulas/referencias, pero no hay en el candidato una definición íntegra conservada y vinculada a una procedencia completa que permita interpretar individualmente los marcadores. No se reemplaza esa evidencia por el DDL esperado del catálogo ni por ausencia de filas CHECK en las vistas.
- **Configuration de CHECK:** está documentada la habilitación global histórica y el ensayo de un CHECK temporal. No acreditan el estado declarativo de esos dos CHECK ni proporcionan el contexto exigido para sus observaciones.
- **Configuration de FK:** el antecedente general de CHECK/FK habilitados de 3.8 se conserva como antecedente manual; no identifica los valores/ámbitos y la sesión requeridos para una observación actual. RESTRICT/RESTRICT describe reglas, no sustituye foreign_key_checks de la sesión examinada.
- **Functional:** no hay una prueba individual auténtica transcrita para ninguna de estas cuatro restricciones. El ensayo temporal/probe pertenece a otro objeto; los tests con fixtures no prueban funcionamiento del servidor. Unknown no significa false ni true.

El planificador exige evidencia de la FK y CHECK originales de pedidos; su alcance previo de carritos comprueba id/PK y no añade una guardia individual de su FK. La cuarta fila se informa por el objetivo documental de esta etapa, sin cambiar ese alcance. Functional unknown no es un bloqueo adicional para la propuesta offline bajo la política vigente; no acredita funcionalidad ni permite recuperación.

## 5. Evidencia previa reutilizada y búsqueda local

Se revisaron los informes 3.18–3.22, 4.0–4.2, los tres candidatos, el adaptador, comparador tipado, intérprete de enforcement y guardias del planificador. Las búsquedas documentales localizaron los mismos hechos parciales y sus referencias, no los literales faltantes. No se localizó una exportación/captura SQL adicional identificable que pudiera transcribirse con seguridad.

Se reutiliza sin reabrir como pendiente:

- Ledger literal, hashes y fechas 001–005; 006 applying/checksum original/applied_at=null; sin 007.
- Atributos y nombres de tablas/columnas ya confirmados, índices completos, reglas y destinos FK, cláusulas CHECK y conteos históricos.
- Diez estados not-applicable con regla, base y hash de tipo; no equivalen a diez celdas SQL NULL observadas.
- Los seis hechos parciales, sin pérdida del indicador no nulo ni invención del contenido.
- Solución de compatibilidad de preflight 4.2 como **código probado localmente**, no como resultado remoto.

El texto anterior «observadas ON» en requisitos de preflight describe lo que el código exige, no demuestra una captura SQL nueva. Se conserva también la confirmación histórica general de habilitación sin extrapolar su ámbito o vigencia.

**Evidencia nueva recuperada para completar campos: ninguna.** Las validaciones siguientes confirman integridad y coherencia local, no crean evidencia del servidor.

## 6. Auditoría local del v3

Validaciones ejecutadas sin SQL ni planificador:

| Comprobación | Resultado |
| --- | --- |
| JSON y contrato tipado | Formato y estados válidos; 84 atributos actuales |
| Balance de estados | 31 observed-value, dos observed-sql-null, diez not-applicable, 41 unknown, cero conflict actuales |
| Unknown obligatorios | Exactamente los seis de la sección 2 |
| Otros unknown | 35 atributos de las cinco columnas de carritos distintas de id; fuera del subconjunto estructural exigido por las guardias actuales, no se añaden como una nueva exigencia rutinaria |
| Procedencia | integrity manual-unverified y referencias conservadas; sin fechas de captura inventadas |
| Regla semántica | Se validaron las diez derivaciones contra tipo, campo, regla aprobada, referencia y SHA de su base |
| Adaptación | originalSnapshot idéntico a v2; sourceSha256 y originalCanonicalSha256 coinciden con la fuente correspondiente |
| Reproducibilidad | Adaptar v2 en memoria con la política, reglas y seis hechos parciales ya registrados reproduce exactamente el objeto v3; no se escribe ningún candidato |
| Conversiones | 103 entradas conservadas: 84 envoltorios, diez derivaciones, seis hechos parciales y tres registros de política/formato/confianza |
| Ledger archivado | Idéntico en v1/v2/v3; prefijo 001–005 pasa el validador local, seis nombres/checksums coinciden con el catálogo, 006 applying/applied_at=null y 007 ausente |
| Completitud y banderas | metadataComplete=false en los tres; las tres banderas false donde están declaradas en v2/v3 y en el código de salida del planificador |

La reproducción en memoria del adaptador y las llamadas al comparador puro **no son una ejecución del planificador de recuperación**. No se puso metadataComplete=true temporalmente. Las observaciones funcionales no se generaron ni se ingirieron desde fixtures.

## 7. Hashes y preservación

| Snapshot | SHA-256 al inicio y al cierre |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |
| v3 | 2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7 |

Se inventariaron 169 archivos existentes de código, SQL/manifests, pruebas, candidatos e informes para comprobar que solo se añade este documento. No se cambia código para justificar tests. No se ejecutan suites completas, lint ni build porque no hay implementación modificada. Las 199 pruebas de 4.2 son antecedente histórico, no resultado nuevo de esta reconciliación.

## 8. Clasificación de pendientes y decisión

| Clase | Pendientes reales |
| --- | --- |
| Resolubles con evidencia local existente | Ningún literal adicional. Las derivaciones, índices, ledger y transcripciones que podían completarse ya están incorporados |
| Dependientes de evidencia no disponible | Seis literales de la sección 2; definiciones completas individuales y observaciones de configuración con sesión/lote/fecha y procedencia suficientes |
| Dependientes de decisión arquitectónica | Revisión explícita de versionMapping y asociación de evidencias al contexto offline. Si en el futuro se usa una salida real de 4.2, su formato live-query-unattested no puede copiarse automáticamente como evidencia manual compatible; necesita una correspondencia revisada que preserve origen, ámbito y significado |

No se detecta una incompatibilidad confirmada nueva en el candidato que exija reparación del esquema. Sigue existiendo una discrepancia de default pendiente y una falta de evidencia. Por tanto la decisión es **INCOMPLETO**, no COMPLETO ni BLOQUEADO por un conflicto tipado demostrado. La planificación real y recuperación siguen impedidas.

## 9. Lista mínima para una futura evaluación de completitud

1. Los **seis valores literales** restantes, con origen verificable, sin deducirlos de indicadores o SQL esperado.
2. Un **contexto coherente de procedencia**: identidad del lote/sesión, fechas de las observaciones de enforcement y correspondencia de versión revisada; sin tomar fechas de ledger o IDs de tests.
3. **Declaración individual y configuración suficientes** para las restricciones obligatorias de pedidos, manteniendo global y sesión separados. La FK de carritos sigue siendo un pendiente documental con el alcance indicado. Evidencia funcional ausente puede seguir unknown bajo la política offline actual.

No faltan otras consultas de ledger, índices, conteos, variables globales por rutina ni un nuevo estudio de compatibilidad. Este listado describe evidencia ausente: **no solicita capturas, no prepara consultas y no autoriza obtenerla remotamente**.

## 10. Siguiente acción y cierre

Con el material disponible se alcanzó el límite de reconciliación documental. Mantener el candidato congelado e incompleto. Solo tendría sentido reabrir su evaluación cuando exista evidencia literal adicional o se autorice un alcance diferente y concreto para obtener/vincular lo que falta. No proponer una Etapa 4.4 que repita esta misma búsqueda.

La recuperación requerirá además el procedimiento y autorizaciones independientes descritos en 4.0; completar un snapshot no crea ejecutor ni concede permiso para DDL o ledger.

Se mantienen **readyForRemoteExecution=false, ledgerTransitionAllowed=false y allow007=false**. No hubo conexiones TiDB/MySQL, SQL, consultas repetidas, solicitud de capturas, migraciones, recuperación, cambios de ledger/snapshots/código/preflight/SQL histórico/.env/certificados/credenciales/probe, despliegues o commits. El estado remoto actual no se afirma como observado. La etapa termina al entregar este informe.
