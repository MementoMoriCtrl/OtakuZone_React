# OtakuZone — Etapa 3.13: captura manual de metadatos TiDB para 006

Fecha: **17 de noviembre de 2026**. Preparación local; **ninguna consulta SQL ejecutada ni conexión TiDB abierta**. Único archivo creado: este documento. No se modifica el planificador, SQL, hashes, ledger ni archivos existentes.

## 1. Orden de captura y condiciones

Ejecutar manualmente los bloques numerados en SQL Editor. Son exclusivamente SELECT/SHOW: no contienen USE, SET, DDL, DML, locks ni recuperación. Seleccionar únicamente otakuzone_db como destino de análisis; no usar el probe. Mantener detenidos los escritores/migradores y registrar privadamente cuándo se obtuvieron los resultados. Estas consultas no forman un snapshot transaccional único: si cambia el esquema o hay escrituras durante la captura, reconciliar o repetir las lecturas afectadas antes de declarar completitud.

El estado anterior aportado —001–005 applied, 006 applying, columnas/índices/FK nuevos e historial ausentes— sirve para elegir consultas condicionales, **no para rellenar valores actuales sin observarlos**. Ante permiso denegado, resultado truncado o metadato no disponible, no establecer metadataComplete=true. No solicitar acceso amplio a mysql.tidb para resolver esta captura.

## 2. Consultas ordenadas

### Q1. Identidad y zona horaria de la lectura

```sql
SELECT VERSION() AS version, DATABASE() AS selected_database,
       @@session.time_zone AS session_time_zone;
```

El nombre seleccionado puede ser NULL; las consultas siguientes están cualificadas. La versión debe corroborar TiDB. Esta lectura sola no sustituye el detector/preflight del backend ni demuestra toda la configuración de integridad. No captura usuarios, tokens ni credenciales.

### Q2. Ledger íntegro, sin ocultar 007 o versiones inesperadas

```sql
SELECT version, checksum, status, CAST(applied_at AS CHAR) AS applied_at
FROM otakuzone_db.schema_migrations_tidb
ORDER BY version;
```

Copiar **todas** las filas a ledger; no sintetizar una fila para 007 si no existe. Para el plan actual deben resultar exactamente seis: 001–005 applied con fecha textual y 006 applying con applied_at SQL NULL. Su checksum debe ser el original del catálogo. Cualquier otro estado/hueco/versión impide utilizar el plan actual; no eliminar filas del snapshot para hacerlo pasar. Son hashes de SQL, no hashes de contraseñas.

### Q3. Inventario completo y atributos de tablas

```sql
SELECT t.TABLE_NAME, t.TABLE_TYPE, t.ENGINE, t.TABLE_COLLATION,
       c.CHARACTER_SET_NAME
FROM information_schema.TABLES AS t
LEFT JOIN information_schema.COLLATIONS AS c
  ON c.COLLATION_NAME = t.TABLE_COLLATION
WHERE t.TABLE_SCHEMA = 'otakuzone_db'
ORDER BY t.TABLE_NAME;
```

Determinar presencia/ausencia de historial_pedidos y de las tablas prohibidas por el plan: schema_migrations y movimientos_inventario. Si existe alguna de estas dos, incluir su nombre en tables y detener la preparación para revisión; nunca omitirla. El plan requiere pedidos y carritos. Conservar la lista completa como evidencia separada, sin confundir recuento de tablas con comprobación de sus nombres.

La collation de **tabla** requerida actualmente para pedidos/carritos/historial es utf8mb4_0900_ai_ci; la collation de la **base** o de email no la sustituye. Si no coincide, informar, no cambiarla ni copiar el valor del contrato.

### Q4. Columnas completas del ámbito

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE,
       COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA,
       CHARACTER_SET_NAME, COLLATION_NAME,
       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
       DATETIME_PRECISION, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

Esta consulta funciona aunque historial no exista. Capturar todas las columnas, incluidas las generadas de carritos, no solo las columnas nuevas. Verificar explícitamente si pedidos.carrito_origen_id y pedidos.clave_solicitud aparecen; de ello dependen Q10/Q11. Una fila ausente solo prueba ausencia si la visibilidad del esquema es suficiente.

### Q5. Campos de índices realmente disponibles

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'information_schema'
  AND TABLE_NAME IN ('STATISTICS', 'TABLE_CONSTRAINTS',
                     'CHECK_CONSTRAINTS', 'TRIGGERS')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

No asumir que la build expone IS_VISIBLE o EXPRESSION en STATISTICS. Si la consulta devuelve cero filas por limitación de visibilidad, las lecturas básicas y SHOW INDEX pueden seguir aportar datos, pero no inventar campos opcionales.

### Q6. Índices, orden y prefijos

```sql
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
       COLUMN_NAME, SUB_PART, COLLATION AS INDEX_COLUMN_ORDER,
       INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

Solo si **ambos campos** se confirmaron disponibles en Q5:

```sql
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, IS_VISIBLE, EXPRESSION
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

Si solo uno está disponible, seleccionar únicamente ese campo junto a las tres claves de agrupación; no reemplazar el ausente por una constante. Complementar con Q9 SHOW INDEX/SHOW CREATE. No convertir COLUMN_NAME NULL o COLLATION NULL en una columna ascendente normal: puede indicar una expresión o representación no admitida y exige revisión.

### Q7. Restricciones y FK con reglas

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
```

Si ENFORCED no está disponible, registrar el límite; no sustituirlo por YES.

```sql
SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION,
       k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA,
       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
       r.UPDATE_RULE, r.DELETE_RULE, r.MATCH_OPTION
FROM information_schema.KEY_COLUMN_USAGE AS k
JOIN information_schema.REFERENTIAL_CONSTRAINTS AS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.TABLE_NAME = k.TABLE_NAME
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA = 'otakuzone_db'
  AND k.TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;
```

Conservar MATCH_OPTION en evidencia, aunque el modelo actual no tiene una propiedad para él. Una diferencia semántica no representable exige revisión, no descartarla. No inferir enforcement de la existencia del nombre de la FK.

### Q8. CHECK y triggers

```sql
SELECT t.TABLE_NAME, t.CONSTRAINT_NAME, t.ENFORCED,
       c.CHECK_CLAUSE
FROM information_schema.TABLE_CONSTRAINTS AS t
LEFT JOIN information_schema.CHECK_CONSTRAINTS AS c
  ON c.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA
 AND c.CONSTRAINT_NAME = t.CONSTRAINT_NAME
WHERE t.TABLE_SCHEMA = 'otakuzone_db'
  AND t.TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
  AND t.CONSTRAINT_TYPE = 'CHECK'
ORDER BY t.TABLE_NAME, t.CONSTRAINT_NAME;
```

```sql
SELECT EVENT_OBJECT_TABLE AS TABLE_NAME, TRIGGER_NAME,
       EVENT_MANIPULATION, ACTION_TIMING, ACTION_ORIENTATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'otakuzone_db'
  AND EVENT_OBJECT_TABLE IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME;
```

No consultar definers, cuerpos de triggers o datos personales para esta captura. Cualquier trigger encontrado ya bloquea el plan actual; basta conservar su identidad estructural. Cero filas solo permite triggers=[] si la cuenta puede ver todos los triggers relevantes, o existe evidencia verificable de su ausencia en esa build. Falta de soporte/permiso no es una lista vacía observada.

### Q9. Contraste con definiciones reales

```sql
SHOW CREATE TABLE otakuzone_db.pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.pedidos;
```

```sql
SHOW CREATE TABLE otakuzone_db.carritos;
```

```sql
SHOW INDEX FROM otakuzone_db.carritos;
```

Solo si Q3 confirmó historial_pedidos:

```sql
SHOW CREATE TABLE otakuzone_db.historial_pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.historial_pedidos;
```

Usar estos resultados para contrastar defaults, auto_increment, columnas generadas, índices de expresión/invisibilidad y restricciones. Si siguen sin poder determinarse visible o expression, dejarlos desconocidos. El planificador no admite certificación a partir de una suposición favorable.

### Q10. Recuentos agregados y cobertura de historial

Siempre que pedidos exista, como confirmó Q3:

```sql
SELECT COUNT(*) AS ordersCount FROM otakuzone_db.pedidos;
```

**Si historial existe**, ejecutar:

```sql
SELECT COUNT(*) AS historyRows
FROM otakuzone_db.historial_pedidos;
```

```sql
SELECT COUNT(*) AS ordersMissingHistory
FROM otakuzone_db.pedidos AS p
WHERE NOT EXISTS (
  SELECT 1 FROM otakuzone_db.historial_pedidos AS h
  WHERE h.pedido_id = p.id
);
```

```sql
SELECT COUNT(*) AS orphanHistoryReferences
FROM otakuzone_db.historial_pedidos AS h
LEFT JOIN otakuzone_db.pedidos AS p ON p.id = h.pedido_id
WHERE p.id IS NULL;
```

**Si historial no existe y la ausencia está verificada**, no ejecutar las tres consultas anteriores. Registrar tables.historial_pedidos=null, historyRows=0 y ordersMissingHistory=ordersCount recién observado. Es una deducción de ausencia confirmada, no un recuento de una tabla inexistente. orphanHistoryReferences puede permanecer null porque el plan no lo exige en ese caso.

### Q11. Conflictos únicamente cuando existan sus columnas

**Solo si pedidos.carrito_origen_id existe** según Q4:

```sql
SELECT COUNT(*) AS duplicateCartGroups
FROM (
  SELECT carrito_origen_id
  FROM otakuzone_db.pedidos
  WHERE carrito_origen_id IS NOT NULL
  GROUP BY carrito_origen_id
  HAVING COUNT(*) > 1
) AS conflicts;
```

```sql
SELECT COUNT(*) AS orphanCartReferences
FROM otakuzone_db.pedidos AS p
LEFT JOIN otakuzone_db.carritos AS c ON c.id = p.carrito_origen_id
WHERE p.carrito_origen_id IS NOT NULL AND c.id IS NULL;
```

**Solo si pedidos.clave_solicitud existe**:

```sql
SELECT COUNT(*) AS duplicateRequestGroups
FROM (
  SELECT usuario_id, clave_solicitud
  FROM otakuzone_db.pedidos
  WHERE clave_solicitud IS NOT NULL
  GROUP BY usuario_id, clave_solicitud
  HAVING COUNT(*) > 1
) AS conflicts;
```

No requieren ambas columnas nuevas a la vez. Si falta la columna correspondiente, no ejecutar su consulta y mantener su contador null/no aplicable; **no convertirlo en 0 observado**. El planificador solo exige esos contadores cuando la columna existe. Nunca listar claves de pedidos para esta comprobación: basta el número de grupos conflictivos.

## 3. Correspondencia exacta con el snapshot

Se inspeccionaron `planTidb006Recovery()` y `tidb006Contract()`. No se reconstruyó el contrato a partir de documentación histórica.

| Campo del snapshot | Fuente y transformación |
| --- | --- |
| format | Literal otakuzone-tidb006-snapshot-v1 |
| engine | tidb únicamente tras Q1 corroborado; no deducirlo del nombre de base |
| database | otakuzone_db, ámbito cualificado de todas las consultas |
| metadataComplete | false hasta cerrar todos los datos, visibilidad y contradicciones |
| ledger[] | Q2 íntegro: version/checksum/status/copiar applied_at como string o JSON null |
| tables.<nombre>.tableType / engine / collation / charset | Q3: TABLE_TYPE / ENGINE / TABLE_COLLATION / CHARACTER_SET_NAME |
| columns.<COLUMN_NAME>.type | Q4 COLUMN_TYPE, contrastado con DATA_TYPE/precisiones y Q9 |
| columns.<nombre>.nullable | IS_NULLABLE YES→true, NO→false; otro valor es desconocido |
| columns.<nombre>.charset / collation | CHARACTER_SET_NAME / COLLATION_NAME; SQL NULL→JSON null, no cadena "NULL" |
| columns.<nombre>.default | COLUMN_DEFAULT como texto o null. Mantener "0.00" como string; no convertirlo a número |
| columns.<nombre>.extra / generationExpression | EXTRA / GENERATION_EXPRESSION, respaldados por Q9; vacío solo si fue observado/confirmado |
| indexes[].name / unique / type | Q6 INDEX_NAME / NON_UNIQUE (0→true, 1→false) / INDEX_TYPE |
| indexes[].visible | IS_VISIBLE/Visible observado; YES→true, NO→false. Ausente/desconocido no es true |
| indexes[].columns[] | Una entrada por SEQ_IN_INDEX, en ese orden: name, prefix, order, expression |
| Parte de índice name / prefix | COLUMN_NAME / SUB_PART, conservando null; prefijo debe ser número o null |
| Parte de índice order | INDEX_COLUMN_ORDER A→ASC, D→DESC; no convertir NULL a ASC |
| Parte de índice expression | EXPRESSION observada o ausencia de expresión corroborada por definición completa; no ocultar una expresión |
| foreignKeys[] | Agrupar Q7 por tabla/nombre y ordenar por ORDINAL_POSITION; usar columnas locales y referenciadas paralelas |
| FK referencedSchema / referencedTable | REFERENCED_TABLE_SCHEMA / REFERENCED_TABLE_NAME |
| FK onDelete / onUpdate / enforced | DELETE_RULE / UPDATE_RULE / ENFORCED de Q7 como booleano conocido |
| checks[] | Q8: name, clause, enforced; no inventar cláusula para un nombre |
| triggers[] | Q8: lista de objetos estructurales de triggers encontrados; el plan solo acepta vacía verificada |
| data.* | Q10/Q11; números enteros seguros, sin filas ni identificadores personales |

Los objetos FK se escriben con estas claves: name, columns, referencedSchema, referencedTable, referencedColumns, onDelete, onUpdate, enforced. columns/referencedColumns son arrays de nombres, no arrays de filas SQL. Los índices usan name, unique, type, visible, columns. Cada parte usa **name, prefix, order, expression en ese orden de claves**: la implementación compara algunas estructuras mediante JSON.stringify, por lo que conviene mantener exactamente ese orden además del orden semántico de columnas. No declarar incompatibilidad real del servidor únicamente por orden de propiedades JSON.

### Normalización: no sustituir observaciones por expectativas

El contrato espera bigint unsigned, enum exacto, decimal(10,2), timestamp(3), auto_increment y CURRENT_TIMESTAMP(3). Las salidas reales pueden incluir casing, display width entero, DEFAULT_GENERATED, paréntesis/backticks en CHECK o introductores de charset. Conservar siempre el resultado original junto a la conversión revisada. No copiar el valor esperado si la equivalencia no está justificada.

El planificador **no normaliza automáticamente** estas diferencias. En particular espera los CHECK de pedidos como `moneda = 'PEN'` y `costo_envio >= 0`, sensibles a la representación textual. Una diferencia de formato exige justificar manualmente una expresión equivalente o revisar un adaptador en otro alcance; no borrar operadores, casts, collations o literales para que pase. No quitar DEFAULT_GENERATED/width/otros atributos sin revisión del tipo y SHOW CREATE completo.

El charset/collation de columnas numéricas debe ser null observado; no heredar el de tabla. Las columnas generadas de carritos deben conservar su expresión en el snapshot aunque actualmente el plan solo compruebe su id/PK. Incluir todos los índices/FK/CHECK del ámbito, incluidos objetos adicionales; no filtrar por los nombres esperados.

## 4. Plantilla JSON incompleta y segura

Es JSON sintácticamente válido, **todavía no un snapshot aceptable para planificar**. Los null y arrays vacíos siguientes son marcadores pendientes, no resultados observados. No ejecutar el planificador sobre ella esperando aprobación.

```json
{
  "format": "otakuzone-tidb006-snapshot-v1",
  "engine": null,
  "database": "otakuzone_db",
  "metadataComplete": false,
  "ledger": [],
  "tables": {
    "pedidos": {
      "tableType": null,
      "engine": null,
      "charset": null,
      "collation": null,
      "columns": {},
      "indexes": null,
      "foreignKeys": null,
      "checks": null,
      "triggers": null
    },
    "carritos": {
      "tableType": null,
      "engine": null,
      "charset": null,
      "collation": null,
      "columns": {},
      "indexes": null,
      "foreignKeys": null,
      "checks": null,
      "triggers": null
    },
    "historial_pedidos": {
      "tableType": null,
      "engine": null,
      "charset": null,
      "collation": null,
      "columns": {},
      "indexes": null,
      "foreignKeys": null,
      "checks": null,
      "triggers": null
    }
  },
  "data": {
    "ordersCount": null,
    "historyRows": null,
    "ordersMissingHistory": null,
    "duplicateCartGroups": null,
    "duplicateRequestGroups": null,
    "orphanCartReferences": null,
    "orphanHistoryReferences": null
  }
}
```

Al completar columns, cada valor tiene exactamente esta estructura, con los datos de su fila Q4:

```json
{
  "type": null,
  "nullable": null,
  "charset": null,
  "collation": null,
  "default": null,
  "extra": null,
  "generationExpression": null
}
```

Los placeholders no significan que una columna real acepte NULL. Sustituirlos campo a campo. Una fila de ledger utiliza version/checksum/status/applied_at; no se proporciona una fila de ejemplo con valores históricos para evitar confundirla con captura.

Si Q3 confirma historial ausente y hay visibilidad suficiente, reemplazar únicamente su objeto por JSON null y aplicar la regla de contadores de Q10. Si existe, completar todos sus metadatos. Para otras listas, usar [] solo tras una consulta completa que confirme ausencia. Si aparecen schema_migrations o movimientos_inventario, incorporarlas al mapa y detenerse: el plan actual las rechaza incluso si su valor es null.

## 5. Procedimiento manual para preparar el archivo

1. Ejecutar Q1–Q4 y conservar resultados completos, sin truncamiento; confirmar tablas/columnas presentes. Q2 no debe filtrarse para ocultar estados inesperados.
2. Ejecutar Q5–Q9 y resolver cada atributo requerido de índices, FK, CHECK y triggers. No incluir credenciales, definers, contenido de filas o tokens.
3. Ejecutar Q10 y solo las ramas aplicables de Q11. Copiar conteos como números, no strings; si exceden Number.MAX_SAFE_INTEGER, el modelo actual no es suficiente y debe revisarse.
4. Completar la plantilla manualmente en un archivo local privado con resultados actuales. Respetar SQL NULL frente a string vacío o texto "NULL"; mantener las fechas como strings. Escapar comillas y barras conforme a JSON, sin cambiar cláusulas SQL.
5. Comparar con el contrato exportado y explicar cualquier normalización conservando evidencia cruda separada. Un metadato inaccesible bloquea completitud; no arreglarlo editando el contrato o esquema en esta etapa.
6. Solo cuando toda la evidencia esté verificada, sin contradicciones ni cambios concurrentes, puede declararse metadataComplete=true. Es una declaración manual, no una certificación emitida por estas consultas.
7. En el paso posterior de planificación local, sobre ese archivo ya revisado: `node backend/scripts/plan-tidb-006-recovery.js --snapshot <archivo-local-revisado.json>`. No se ejecutó con datos remotos aquí. La salida sigue teniendo readyForRemoteExecution=false, ledgerTransitionAllowed=false y allow007=false.

## 6. Límites de visibilidad y cuestiones que no resuelven las consultas

- Una cuenta puede ver tablas pero no triggers o todos los metadatos. Sin evidencia suficiente de visibilidad, cero filas no certifica ausencia. No se presuponen permisos por tener un rol de nombre administrativo.
- IS_VISIBLE, EXPRESSION o ENFORCED pueden no estar expuestos de la misma forma en esta build. Q5/SHOW permiten reconocer la diferencia; no garantizan que todos los atributos puedan recuperarse. Si no se observan o corroboran, el snapshot queda incompleto.
- Las reglas FK y su presencia no sustituyen una prueba negativa de enforcement ni el preflight de las sesiones runtime. No ejecutar inserciones de prueba en esta etapa.
- Estas lecturas no certifican exclusión de escritores, ausencia de DDL en curso, lock efectivo, estado posterior a la captura, backup restaurable ni permisos para una recuperación futura.
- El modelo actual comprueba todos los atributos enumerados para pedidos/historial, pero solo algunos de carritos. Capturar el ámbito completo no convierte al planificador en auditor de toda la aplicación.
- Un snapshot rellenado a mano no está firmado por TiDB; metadataComplete y el hash local sirven para trazabilidad, no autentican la fuente. El paso remoto futuro debe revalidar metadatos en vivo.

## 7. Validación local y cierre

Se inspeccionó el contrato real y se ejecutó únicamente una comprobación Node local para enumerar claves de columnas/índices/FK/historial y confirmar que un snapshot incompleto es rechazado. Esa función solo lee el catálogo local; no abre conexiones ni ejecuta SQL. No se repitieron suites, matrices, lint o build de implementación porque no se modificó código.

La captura remota y la confección del snapshot real **siguen pendientes del usuario**. No se fabricó un archivo de producción con resultados previos, ni se estableció metadataComplete=true. No se ejecutó recuperación, migración, modificación de ledger, despliegue o commit. Se entrega únicamente este documento y se detiene el trabajo.
