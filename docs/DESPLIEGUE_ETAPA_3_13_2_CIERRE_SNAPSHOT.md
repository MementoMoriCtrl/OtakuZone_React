# OtakuZone — Etapa 3.13.2: integración del ledger y cierre pendiente del snapshot

Fecha: **17 de noviembre de 2026**. Integración local de evidencia manual aportada; sin conexiones ni SQL ejecutado.

## Evidencias incorporadas

Se inspeccionaron el candidato, el contrato real de `tidb006RecoveryPlan.js` y los informes 3.12/3.13/3.13.1. Se actualiza únicamente [el candidato](snapshots/tidb-006-snapshot-candidate.json):

- FK existentes de pedidos/carritos: onDelete y onUpdate pasan de pendientes a RESTRICT, según confirmación recibida.
- pedidos.checks contiene ahora los nombres confirmados ck_pedidos_moneda y ck_pedidos_envio. clause y enforced permanecen pendientes: no se copiaron las expresiones esperadas del código como si fueran una captura real.
- Se ratifican los seis estados del ledger ya presentes, checksum original 006 y ausencia de 007. El null de applied_at de 006 ahora representa SQL NULL expresamente confirmado; los null de 001–005 siguen siendo placeholders, no fechas observadas.
- Se conservan pedidos=0, historial ausente y conteos derivados historyRows=0/ordersMissingHistory=0. La confirmación general de equivalencia de índices/FK no aporta su representación completa para transcribir atributos exactos.

La evidencia nueva **resuelve la afirmación anterior de que no se veían CHECK en pedidos en cuanto a su existencia**, pero falta su definición/enforcement. Los informes anteriores son históricos y no se reescriben. No se inventan CHECK para carritos u otras tablas: carritos.checks=[] conserva el resultado previo aportado; si una captura más completa muestra otros, deben transcribirse íntegramente, sin filtrarlos para pasar el contrato.

## Datos todavía pendientes y lecturas mínimas

El snapshot permanece con **metadataComplete=false**. Faltan exclusivamente estos datos exactos para completarlo:

| Pendiente | Lectura |
| --- | --- |
| Checksums 001–005 y fechas applied_at 001–005 | 1 |
| tableType, engine, charset y collation de pedidos/carritos; inventario que descarte historial MySQL o avance de 007 | 2 |
| Atributos de columnas de pedidos/carritos y los tres nombres de carritos aún no transcritos | 3 |
| Unicidad, tipo, visibilidad y partes ordenadas con prefijos/expresiones de los seis índices existentes | 4–5 |
| Esquema referenciado y enforcement de FK; cláusulas/enforcement de CHECK actuales | 6 |

No faltan nuevas consultas de datos para pedidos vacíos/historial ausente ni las reglas RESTRICT/RESTRICT ya confirmadas, salvo que haya ocurrido actividad posterior. Los contadores de conflictos de las columnas de 006 ausentes siguen null/no aplicables; no pedir consultas sobre columnas que no existen. Los dos resultados de duplicados no se asignan a campos específicos sin su SQL original.

**Consultas preparadas para el usuario, no ejecutadas aquí:**

### 1. Ledger íntegro

```sql
SELECT version, checksum, status, CAST(applied_at AS CHAR) AS applied_at
FROM otakuzone_db.schema_migrations_tidb
ORDER BY version;
```

No sustituir los checksums remotos faltantes por los del manifest local ni estimar fechas. No filtrar filas inesperadas.

### 2. Tablas y atributos

```sql
SELECT t.TABLE_NAME, t.TABLE_TYPE, t.ENGINE, t.TABLE_COLLATION,
       c.CHARACTER_SET_NAME
FROM information_schema.TABLES AS t
LEFT JOIN information_schema.COLLATIONS AS c
  ON c.COLLATION_NAME = t.TABLE_COLLATION
WHERE t.TABLE_SCHEMA = 'otakuzone_db'
ORDER BY t.TABLE_NAME;
```

Si aparecen schema_migrations o movimientos_inventario, conservar esa evidencia y detener la consolidación; no ocultarlos del mapa.

### 3. Columnas y atributos completos

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, EXTRA,
       CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

Conservar null SQL, string vacío, defaults textuales y expresión generada; no inferir tipos o reglas a partir del código fuente.

### 4–5. Índices completos

```sql
SHOW INDEX FROM otakuzone_db.pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.carritos;
```

Transcribir Non_unique, Seq_in_index, Column_name, Sub_part, Collation del índice, Index_type y Visible/Expression si están expuestos. Si estos últimos no están disponibles, **solo entonces** aplicar la captura condicional Q5/Q6 y el contraste SHOW CREATE de [3.13](DESPLIEGUE_ETAPA_3_13_CAPTURA_METADATOS.md). No usar visible=true o expression=null por defecto. Una representación distinta de metadatos requiere revisión, no cambios de esquema.

### 6. FK y CHECK en una lectura de metadatos

```sql
SELECT t.TABLE_NAME, t.CONSTRAINT_NAME, t.CONSTRAINT_TYPE,
       t.ENFORCED, c.CHECK_CLAUSE,
       k.ORDINAL_POSITION, k.COLUMN_NAME,
       k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME,
       k.REFERENCED_COLUMN_NAME
FROM information_schema.TABLE_CONSTRAINTS AS t
LEFT JOIN information_schema.CHECK_CONSTRAINTS AS c
  ON c.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA
 AND c.CONSTRAINT_NAME = t.CONSTRAINT_NAME
 AND t.CONSTRAINT_TYPE = 'CHECK'
LEFT JOIN information_schema.KEY_COLUMN_USAGE AS k
  ON k.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA
 AND k.TABLE_NAME = t.TABLE_NAME
 AND k.CONSTRAINT_NAME = t.CONSTRAINT_NAME
 AND t.CONSTRAINT_TYPE = 'FOREIGN KEY'
WHERE t.TABLE_SCHEMA = 'otakuzone_db'
  AND t.TABLE_NAME IN ('pedidos', 'carritos')
  AND t.CONSTRAINT_TYPE IN ('CHECK', 'FOREIGN KEY')
ORDER BY t.TABLE_NAME, t.CONSTRAINT_NAME, k.ORDINAL_POSITION;
```

No forzar ENFORCED a YES si falta o es desconocido. Si no está expuesto o los CHECK no son legibles, conservar el límite; el contrato actual no puede aprobarse con esa evidencia. Para diferencias de representación textual de CHECK, contrastar SHOW CREATE de la tabla afectada solo si hace falta, sin sustituir una cláusula no observada por la esperada.

## Resultado del planificador y seguridad

**Planificador no ejecutado:** faltan los valores anteriores y metadataComplete sigue false. No se habilitó temporalmente para forzar una aprobación. Se validó localmente el JSON y que solo se incorporaran las reglas y nombres confirmados; no se repitieron suites de implementación ni se ejecutó SQL.

Siguiente paso mínimo: aportar los resultados completos de las seis lecturas anteriores —o las capturas exactas ya disponibles con esos campos— para transcribirlos sin inventar valores. Solo después se podrá evaluar completitud y, si procede, ejecutar el planificador offline. No es necesario repetir el estudio de regex ni ejecutar DDL para cerrar metadatos.

Solo cambian el candidato y este informe nuevo. No se modifica código, ledger remoto, hashes, migraciones MySQL/TiDB, datos/configuración local, .env ni el probe. No hay recuperación, migrador normal, 007, conexiones, despliegues o commits. Se detiene el trabajo.

## Actualización de cierre — Etapa 3.14, 17 de noviembre de 2026

Esta sección actualiza el estado del candidato; las secciones anteriores registran lo conocido en 3.13.2 y no deben interpretarse como pendientes todavía vigentes cuando aquí se indica que quedaron completados.

### Evidencia incorporada literalmente

- Ledger: se transcribieron los seis registros aportados, incluidos hashes, estados y fechas 001–005, sin convertir su zona horaria ni reconstruir fechas. 006 conserva su checksum original, applying y applied_at=null confirmado; no se añadió 007. La comprobación local verificó coincidencia con el catálogo TiDB sin modificarlo.
- pedidos y carritos: tableType=BASE TABLE, engine=InnoDB, charset=utf8mb4, collation=utf8mb4_0900_ai_ci.
- carritos: ya figuran sus seis nombres de columna confirmados. Los tres nombres recién incorporados tienen objetos vacíos pendientes; no se copian atributos del SQL histórico. El carácter STORED GENERATED de usuario_activo_id está confirmado como hecho, pero no se inventa su expresión ni la representación textual completa de EXTRA.
- Los seis índices tienen su unicidad confirmada y partes con nombres de columnas en el orden aportado. No se inventan orden ASC/DESC, prefijos, expresiones, tipo BTREE o visibilidad. Cada parte contiene por ahora solo name; la omisión de los otros campos indica desconocido, no null/no aplicable.
- pedidos: se transcriben las cláusulas confirmadas `moneda = 'PEN'` y `costo_envio >= 0`. Sus enforced siguen pendientes. carritos.checks=[] está ahora respaldado expresamente por SHOW CREATE TABLE sin CHECK, no solo por una consulta anterior sin filas.
- Se conservan ausencia de historial y columnas/índices/FK nuevos, datos vacíos, triggers ausentes y reglas FK RESTRICT/RESTRICT de la evidencia previa ratificada. El inventario anterior sin schema_migrations/movimientos_inventario se acepta como evidencia aportada, sin fingir una conexión actual ni comprobar cambios posteriores.

### Confirmado, desconocido y no aplicable

| Categoría | Tratamiento |
| --- | --- |
| Confirmado | Valores anteriores incorporados; historial_pedidos=null significa ausencia real aportada y 006.applied_at=null significa SQL NULL confirmado |
| Desconocido | Se mantienen placeholders null heredados, marcados como pendientes por metadataComplete=false; los nuevos objetos incompletos omiten propiedades desconocidas. No se convierten en false/true/[] ni se les asigna un valor semántico de SQL NULL |
| No aplicable | Conflictos de carrito_origen_id/clave_solicitud mientras esas columnas estén ausentes, y huérfanos de historial mientras la tabla no exista; sus contadores heredados null no representan un cero medido |
| Deducido de hechos confirmados | historyRows=0 y ordersMissingHistory=0 por historial ausente y pedidos=0; no se consultó una tabla inexistente |

El formato v1 no dispone de una representación tipada UNKNOWN. El candidato parcial usa convenciones documentadas y no debe entregarse al planificador como completo. No se añade una extensión al contrato ni se alteran sus guardias para facilitar aprobación.

### Pendientes exactos del candidato

1. **Columnas:** type, nullable, charset, collation, default, extra y generationExpression de todas las columnas de pedidos/carritos aún no transcritos. No se deducen atributos numéricos/nullabilidad/default de los nombres. Para usuario_activo_id falta especialmente la expresión exacta y sus atributos completos. El plan comprueba todas las columnas originales de pedidos y carritos.id; se conserva la captura completa de carritos como exige el procedimiento de evidencia.
2. **Índices:** type y visible de cada índice, más prefix, order y expression de cada parte. Los nombres, composición ordenada y unicidad ya están confirmados; no hace falta volver a pedirlos aisladamente.
3. **FK:** referencedSchema y enforced de las dos FK. Tabla/columnas referenciadas y reglas ya están confirmadas. No se asigna el esquema por analogía con el SQL local.
4. **CHECK:** enforced de cada CHECK de pedidos. Sus nombres y cláusulas ya están completos.

No quedan pendientes hashes/fechas de ledger, atributos de tabla, nombres de columnas, unicidad/composición de índices ni las cláusulas CHECK. No se solicitan consultas repetidas de datos vacíos, duplicados o historial inexistente para esta consolidación.

### Incompatibilidad de observabilidad de ENFORCED

El usuario confirmó que TiDB devolvió Unknown column 't.enforced'. **No volver a ejecutar las consultas anteriores que seleccionan TABLE_CONSTRAINTS.ENFORCED en esta build.** Su inclusión en etapas previas fue una propuesta condicionada a disponibilidad; esta evidencia demuestra que esa vía no sirve aquí.

La variable global tidb_enable_check_constraint=1 y el rechazo de un valor inválido por un CHECK temporal son evidencia real de habilitación y funcionamiento de CHECK en el contexto probado. No prueban por sí solos que cada CHECK de pedidos esté aplicado, ni prueban enforcement de FK. Tampoco autorizan establecer enforced=true solo porque el contrato lo exige.

El modelo actual requiere esos booleanos, pero no acepta un objeto de evidencia alternativo. El bloqueo puede requerir **una revisión explícita posterior de cómo representar y corroborar enforcement en TiDB 8.5.3**, sin inventar columnas de information_schema, fabricar valores ni debilitar silenciosamente la integridad. No se modificó ese modelo en 3.14.

### Lecturas mínimas aún útiles — preparadas, no ejecutadas

Para los atributos de columnas que faltan:

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, EXTRA,
       CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

Para los atributos de índice no transcritos, aportar los resultados completos existentes o, si no se guardaron:

```sql
SHOW INDEX FROM otakuzone_db.pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.carritos;
```

Si Visible/Expression no se exponen, contrastar con SHOW CREATE TABLE; no inventarlos. Para el esquema referenciado de las FK, sin ENFORCED:

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION,
       COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
```

SHOW CREATE TABLE de ambas tablas puede aportar declaraciones de restricciones y atributos de índices; si no muestra de forma inequívoca el estado de enforcement, ese dato sigue sin poder certificarse por esa vía. No se prepara una inserción de prueba ni se repite el ensayo temporal para resolverlo automáticamente.

### Validación y resultado de planificación

- Sintaxis JSON: aprobada mediante parseo local; metadataComplete permanece false.
- Ledger: cinco entradas applied validadas con el catálogo local; checksum original 006, estado applying, applied_at null y seis registros verificados. Esto valida la transcripción contra archivos locales, no realiza una lectura remota.
- `node --test backend/tests/tidb-006-recovery.test.js`: **40/40 aprobadas**. Son las pruebas existentes con fixtures/dobles y bloqueo de red; no una planificación del candidato real.
- El primer runner fue bloqueado por spawn EPERM del sandbox; su reejecución autorizada fuera del sandbox pasó. No quedaron fallos en la ejecución final.
- **Planificador sobre el candidato: no ejecutado**, porque los campos anteriores no están respaldados íntegramente y metadataComplete=false. No hay plan nuevo ni transición de ledger aprobada. readyForRemoteExecution, ledgerTransitionAllowed y allow007 no se habilitan.

Solo se modifican el snapshot candidato y este informe de cierre. Se preservan código, pruebas, migraciones SQL MySQL/TiDB, hashes históricos, ledger remoto, .env, certificados, autenticación, configuración de hosting y datos. No se abrió conexión, ejecutó SQL/migrador/recuperación, habilitó 007, alteró el probe o realizó despliegue/commit. Siguiente paso mínimo: transcribir los atributos pendientes y resolver mediante revisión la evidencia de enforcement admisible; no reintentar migraciones. Se detiene el trabajo.

## Reconciliación de evidencias — Etapa 3.15, 17 de noviembre de 2026

### Alcance de la revisión antes de pedir nuevas lecturas

Se contrastaron el candidato, el contrato, el historial de mensajes accesible y los archivos existentes de 3.12, 3.13, 3.13.1 y el cierre actualizado en 3.14. Se distinguieron tres fuentes: resultados textuales aportados por el usuario, consultas propuestas sin resultados y definiciones esperadas del código/fixtures. Las dos últimas no son capturas remotas.

**En las evidencias accesibles no están las salidas íntegras de SHOW CREATE TABLE pedidos/carritos, SHOW INDEX o la consulta completa de columnas.** Sí están los resúmenes manualmente confirmados, el ledger literal de 3.14 y las cláusulas CHECK. Si existen capturas conservadas fuera de estos archivos o no disponibles en el contexto actual, su contenido no puede darse por inspeccionado. No se afirma que el usuario nunca haya ejecutado o conservado esas consultas.

No se vuelve a pedir el ledger, atributos de tabla, nombres/unicidad/composición ordenada de índices, reglas RESTRICT/RESTRICT, cláusulas CHECK, inventario o recuentos vacíos ya confirmados. **El paso mínimo es reutilizar/transcribir las salidas existentes que contengan los atributos pendientes, no repetir por rutina toda la captura.**

### Resultado campo por campo

| Campo | Evidencia accesible | Decisión |
| --- | --- | --- |
| Ledger 001–006: hashes, fechas y estados; 007 ausente | Registros literales de 3.14 | Ya completo en candidato; no volver a solicitar |
| tableType/engine/charset/collation | Confirmación explícita de 3.14 | Ya completo |
| Columnas por nombre; usuario_activo_id STORED GENERATED | Confirmación explícita | Nombres completos; no se deducen tipos, nullabilidad, defaults o expresión exacta a partir del SQL esperado |
| Índices: nombres, unicidad y secuencia de nombres de columnas | Confirmación explícita de 3.14 | Ya incorporados; la secuencia no demuestra ASC/DESC |
| Index_type=BTREE | Solo aparece como requisito del contrato y en consultas propuestas; sin fila de resultado accesible | Pendiente, no se asigna por defecto |
| Visible=YES | Sin fila de resultado accesible | Pendiente; no se deriva del funcionamiento de la PK/índice |
| Sub_part vacío | No hay salida íntegra que distinga celda vacía, SQL NULL o string vacío | Pendiente; no se asigna prefix=null |
| Expression vacío | Igual falta de representación original | Pendiente; no se asigna expression=null |
| FK: usuarios.id y RESTRICT/RESTRICT | Confirmados explícitamente | Ya incorporados |
| FK: esquema otakuzone_db | Los mensajes previos indican usuarios.id sin cualificación; el esquema aparece como expectativa en código y consultas | referencedSchema sigue pendiente. La lista de campos que se pide comprobar en 3.15 no se interpreta por sí sola como una nueva fila remota confirmada |
| CHECK moneda y envío: nombres/cláusulas | Confirmación explícita de 3.14 | Ya incorporados; no repetir |
| carritos sin CHECK, historial ausente, sin triggers | Confirmaciones previas | Se conservan los valores ya respaldados |
| Enforcement individual CHECK/FK | ENFORCED no existe en la consulta probada; habilitación global y ensayo CHECK temporal | No demuestra cada restricción del destino; no se asigna true ni false |

**No se dispone de nuevos valores exactos para cambiar el JSON en esta reconciliación.** Se conserva el candidato byte a byte y metadataComplete=false. Evitar una modificación cosmética o agregar propiedades ficticias también preserva su trazabilidad. Este informe sí se actualiza para reducir las solicitudes a los atributos realmente no transcritos.

### Atributos de columnas realmente pendientes

Para que el plan actual pueda comprobar pedidos faltan type, nullable, charset, collation, default, extra y generationExpression de sus seis columnas. Para carritos.id faltan esos mismos atributos. El resto de las columnas de carritos aún no tiene su definición completa transcrita; es evidencia pendiente de la captura completa, aunque no todas sean guardias implementadas por el planificador.

STORED GENERATED respalda el carácter generado/almacenado de usuario_activo_id, pero no su expresión CASE exacta, tipo o nulabilidad. Las migraciones y tidb006Contract contienen valores esperados, no una lectura de esa columna en el servidor. No transformar esa expectativa en supuesto dato observado.

### Representación de vacíos: condición de normalización

Un visor que muestra una celda vacía puede ocultar SQL NULL, string vacío o un campo no suministrado. En prefix el modelo admite un entero o null; en expression distingue una expresión de null; no se puede elegir el valor por el aspecto de la celda. Si una captura completa identifica explícitamente NULL, se puede transcribir JSON null; si muestra string vacío, conservar ese hecho y revisar su equivalencia antes de adaptar el modelo. No sustituirlo silenciosamente. El mismo criterio aplica a COLUMN_DEFAULT, EXTRA y GENERATION_EXPRESSION: un string vacío confirmado sí es distinto de un atributo desconocido.

No cambiar las guardias ni crear una columna ficticia ENFORCED para superar la falta de observabilidad. Una adaptación de representación/enforcement requiere otro alcance explícito; no hay consulta de lectura garantizada aquí que produzca el booleano individual si el servicio no lo expone.

### Consultas residuales, solo si no pueden recuperarse sus resultados existentes

Preferir las capturas/exportaciones completas ya obtenidas. **No repetir estas lecturas si esas salidas están disponibles y permiten transcripción segura.** Los bloques siguientes son únicamente la alternativa mínima preparada para el usuario; no se ejecutaron y no incluyen ENFORCED.

**Grupo A — columnas y representación explícita de vacíos:**

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, CHARACTER_SET_NAME, COLLATION_NAME,
       COLUMN_DEFAULT,
       COLUMN_DEFAULT IS NULL AS default_is_null,
       EXTRA, EXTRA IS NULL AS extra_is_null,
       GENERATION_EXPRESSION,
       GENERATION_EXPRESSION IS NULL AS generation_is_null
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

**Grupo B — solo atributos de índices pendientes:**

```sql
SHOW INDEX FROM otakuzone_db.pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.carritos;
```

Conservar las columnas y valores completos de la salida, no solo los nombres de los índices. Para aclarar específicamente si SUB_PART es SQL NULL, si la captura no permite distinguirlo:

```sql
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, SUB_PART,
       SUB_PART IS NULL AS sub_part_is_null,
       COLLATION AS index_column_order, INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

No se propone seleccionar EXPRESSION o IS_VISIBLE de STATISTICS sin conocer su disponibilidad en la build. Si SHOW INDEX no los expone o representa Expression ambiguamente, revisar la salida ya existente de SHOW CREATE y la disponibilidad de columnas de Q5 en 3.13; no reemplazar una incompatibilidad por valores inventados. La columna Collation de índices expresa orden, no collation de texto.

**Grupo C — únicamente esquema referenciado de las FK:**

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION,
       REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME,
       REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
```

No se solicitan nuevas consultas de CHECK/cláusulas, reglas FK, hashes/fechas o datos vacíos: ya están respaldados. Tampoco se solicita reejecutar el ensayo temporal de CHECK. Si una captura existente demuestra alguno de BTREE/Visible/esquema, transcribirlo individualmente y retirar solo ese pendiente, sin extrapolar a los otros índices/FK.

### Validación y estado final

Se comprueba localmente que el JSON sigue siendo válido, metadataComplete=false y el contenido no cambia. No se ejecuta el planificador sobre el candidato ni se repiten sus suites, porque no se cambió implementación ni se aportaron valores nuevos para completarlo. Las 40 pruebas aprobadas de 3.14 siguen siendo resultado histórico, no ejecución nueva.

En esta etapa solo se añade esta sección al informe de cierre; no se modifica el candidato ni ningún otro archivo. No hubo conexiones, SQL, migraciones, recuperación, cambio de ledger/hashes, datos, .env, probe o despliegues. 006 sigue applying y 007 no se habilita. Se detiene el trabajo.

## Integración final de evidencia FK — Etapa 3.16, 17 de noviembre de 2026

### Evidencias integradas

Se inspeccionaron el contrato real y el candidato vigente. La nueva confirmación manual permite completar **referencedSchema=otakuzone_db** en fk_carritos_usuario y fk_pedidos_usuario. Ambas mantienen columna local usuario_id y referencia usuarios.id, con RESTRICT/RESTRICT ya confirmados. No se cambia ningún atributo adicional de las FK y enforced continúa desconocido.

Esta evidencia resuelve el pendiente del esquema referenciado de 3.14/3.15. **No volver a solicitar esa consulta.** Se aprovechan y conservan el ledger literal, atributos de tabla, nombres de columnas, composición/unicidad de índices, ausencia de historial, conteos y triggers ya incorporados.

La consulta de information_schema aportada devolvió dos FK y ninguna fila CHECK. Eso describe el resultado de esa consulta, **no ausencia de restricciones**. Se conservan en pedidos los CHECK observados en SHOW CREATE y sus cláusulas previamente confirmadas: ck_pedidos_moneda con `moneda = 'PEN'` y ck_pedidos_envio con `costo_envio >= 0`. No se borran del candidato ni se regeneran desde el código. Su enforcement individual sigue sin verificar.

### Bloqueos concretos restantes

| Ámbito | Datos aún no transcritos/verificados |
| --- | --- |
| Columnas | type, nullable, charset, collation, default, extra y generationExpression exactos de las seis columnas de pedidos y de carritos.id, exigidos por el plan. La captura completa de carritos sigue sin sus atributos íntegros, incluida expresión generada de usuario_activo_id. |
| Índices | type/visible y prefix/order/expression de cada parte. Nombres, unicidad y secuencia de nombres de columnas ya están completos; no extrapolar los atributos faltantes de esa confirmación. |
| Restricciones | enforced de las dos FK y de los dos CHECK de pedidos. TABLE_CONSTRAINTS.ENFORCED no está disponible según el error previo; no inventar el campo ni inferir true de la variable global o del ensayo temporal ajeno. |

Los null heredados y propiedades omitidas de estos atributos siguen siendo pendientes, no valores SQL observados. No se convierten en false, true o arrays vacíos. El esquema referenciado de las FK ya no pertenece a esta lista. No se incorporan restricciones no observadas del resto de la base, que está fuera del ámbito del candidato.

No se solicitan ni repiten consultas completadas. Para completar lo pendiente, reutilizar las salidas íntegras ya conservadas de columnas/SHOW CREATE/SHOW INDEX si contienen esos valores; no asumir contenido de capturas no accesibles. Si la evidencia individual de enforcement no puede representarse con el contrato actual, corresponde una revisión explícita posterior del modelo de evidencia, no debilitarlo en esta integración.

### Validación y decisión de planificación

Validación local: JSON sintácticamente válido; ambas FK tienen el esquema confirmado y conservan reglas, tabla y columna referenciadas. Las cláusulas CHECK y el ledger se verifican sin cambios. metadataComplete sigue **false**. No se ejecutan suites de implementación nuevas porque no se modificó código; solo aserciones locales sobre los datos y comparación del diff.

**Planificador sobre el candidato no ejecutado:** sigue faltando evidencia obligatoria. No se habilita metadataComplete temporalmente, no se genera un plan nuevo y no se modifican readyForRemoteExecution, ledgerTransitionAllowed o allow007. Las pruebas históricas no se presentan como una planificación de este snapshot.

### Estado explícito de seguridad

Solo se modifican dos archivos: el candidato y este informe. No hubo conexión TiDB/MySQL, SQL/DDL/DML, ejecución del migrador o recuperación, cambio del ledger remoto, hashes o migraciones, .env, credenciales, probe, despliegues o commits. El estado aportado de 006 sigue applying y 007 continúa sin habilitar. Se detiene el trabajo.

## Reconciliación de filas existentes — Etapa 3.17, 17 de noviembre de 2026

### Correspondencia comprobada, sin repetir consultas

Se inspeccionaron nuevamente el contrato y el candidato. Se contrastaron las referencias del usuario a doce filas de columnas, cinco registros de índices de pedidos, cuatro de carritos y dos FK con la evidencia textual disponible y los informes. **Las cantidades coinciden con lo ya incorporado:**

| Resultado referido | Representación existente en el candidato |
| --- | --- |
| 12 filas de columnas | Seis nombres en pedidos y seis en carritos |
| 5 registros de índices de pedidos | PRIMARY(id): una parte; ix_pedidos_estado_fecha(estado, creado_en): dos; ix_pedidos_usuario_fecha(usuario_id, creado_en): dos |
| 4 registros de índices de carritos | PRIMARY(id): una parte; ix_carritos_usuario_estado(usuario_id, estado): dos; uq_carritos_usuario_activo(usuario_activo_id): una |
| 2 FK | fk_pedidos_usuario y fk_carritos_usuario: usuario_id → otakuzone_db.usuarios(id), RESTRICT/RESTRICT |

Cinco y cuatro son filas/partes de índice, **no cinco y cuatro índices diferentes**: hay tres índices por tabla. Las secuencias de nombres y la unicidad ya constan en el JSON. Las referencias FK están completas salvo enforcement individual y no se vuelven a solicitar.

El contexto accesible y los informes contienen estos resúmenes confirmados, pero no las doce filas completas de atributos ni las nueve filas completas de SHOW INDEX con sus celdas originales. La revisión de archivos docs no encontró un CSV, TSV o imagen de esas salidas. No se confunden las consultas preparadas ni los fixtures del contrato con capturas reales. Esto no afirma que las capturas no existan en el entorno privado del usuario; significa que aquí no se dispone de valores adicionales legibles para transcribir.

Por tanto **no hay un nuevo atributo verificable que incorporar al snapshot en 3.17**. Se conserva byte a byte, metadataComplete=false. Cambiar valores solo porque los recuentos coinciden inventaría metadatos. No se sustituyen sus placeholders por el SQL esperado.

### Campos que continúan pendientes, exactamente

| Objeto | Campos pendientes |
| --- | --- |
| pedidos.id, usuario_id, estado, moneda, costo_envio, creado_en | type, nullable, charset, collation, default, extra, generationExpression de cada columna |
| carritos.id, usuario_id, estado, usuario_activo_id, creado_en, actualizado_en | Los mismos siete atributos, no transcritos íntegramente. Se mantiene documentado que usuario_activo_id es STORED GENERATED, sin reconstruir su expresión |
| PRIMARY, ix_pedidos_estado_fecha, ix_pedidos_usuario_fecha de pedidos | type y visible; prefix, order y expression de cada una de sus cinco partes |
| PRIMARY, ix_carritos_usuario_estado, uq_carritos_usuario_activo de carritos | type y visible; prefix, order y expression de cada una de sus cuatro partes |
| fk_pedidos_usuario y fk_carritos_usuario | enforced individual |
| ck_pedidos_moneda y ck_pedidos_envio | enforced individual; nombres y cláusulas observadas ya completos |

Para las columnas numéricas, charset/collation podrían ser SQL NULL; todavía no se convierten en un dato observado por ser lo habitual. Los null heredados permanecen placeholders de desconocido. Las propiedades omitidas de partes de índices tampoco significan null. No se interpreta celda vacía como ausencia de prefijo/expresión, ni se infiere ASC, BTREE o visibilidad. Cualquier expresión generada truncada debe seguir pendiente: no se completa mediante CASE copiado de la migración.

El contrato exige todos esos atributos para las columnas originales de pedidos y carritos.id; la definición de las demás columnas de carritos sigue siendo pendiente de la captura completa, aunque el plan no las valide todas. Esto distingue una guardia implementada de un requisito documental de completitud. Los contadores de conflictos sobre columnas/tablas ausentes son no aplicables, no consultas nuevas pendientes.

No se infiere enforcement de los nombres, variables globales o la prueba CHECK temporal. No se inventa ENFORCED en information_schema ni se modifica el modelo/guardias. El ledger, los atributos de tabla, cláusulas CHECK, reglas y destinos FK, nombres/unicidad de índices y los datos vacíos siguen respaldados y no se reabren como pendientes.

### Validación y cierre

Se ejecutaron únicamente aserciones Node locales: JSON válido; 6+6 nombres de columnas; 5+4 partes de índices; dos FK con esquema confirmado; metadataComplete=false. Se consultaron las claves del contrato exportado sin invocar planTidb006Recovery. No se ejecutaron suites nuevas ni se presentó el resultado histórico de pruebas como validación actual de metadatos remotos.

**Planificador no ejecutado. No se solicitan ni preparan consultas adicionales en 3.17.** La consolidación queda limitada a valores legibles de las capturas existentes; ante su indisponibilidad en el contexto actual se mantienen los pendientes, sin inventarlos ni repetir SQL.

Solo se actualiza este informe. El candidato permanece sin cambios; código, contrato, hashes, ledger remoto, migraciones, .env, credenciales, datos, probe y hosting permanecen intactos. Sin conexiones, SQL/DDL/DML, migrador, recuperación 006, habilitación de 007, despliegues o commits. Se detiene el trabajo.
