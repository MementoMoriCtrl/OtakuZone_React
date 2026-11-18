# OtakuZone — Etapa 3.13.1: consolidación del snapshot candidato TiDB 006

Fecha: **17 de noviembre de 2026**. Consolidación local de evidencia aportada por el usuario; no se consultó TiDB ni se ejecutó SQL.

## 1. Resultado

Creado [snapshot candidato](snapshots/tidb-006-snapshot-candidate.json) con format otakuzone-tidb006-snapshot-v1 y **metadataComplete=false**. Es JSON válido, pero **no satisface el contrato de planificación**. No se ejecutó ni la función planTidb006Recovery ni su CLI sobre este candidato.

La versión aportada es 8.0.11-TiDB-v8.5.3-serverless. El modelo no tiene campo version; se documenta aquí y no se añade una propiedad ficticia obligatoria al snapshot. engine=tidb y database=otakuzone_db proceden de la evidencia recibida, no de una conexión hecha por el agente.

Se revisó el código real de tidb006RecoveryPlan.js y su entrada plan-tidb-006-recovery.js. El contrato exportado no contiene todos los requisitos: el cuerpo de planTidb006Recovery también exige ledger/fechas, atributos de tabla, CHECK previos, conteos y rechazo de tablas incompatibles.

## 2. Qué se consolidó y qué permanece pendiente

| Evidencia aportada | Representación del candidato / límite |
| --- | --- |
| 001–005 applied, 006 applying y 007 ausente | Seis filas con nombres de las versiones locales correspondientes y estados aportados. Sin fila ficticia 007. Faltan checksums 001–005 y todas las fechas exactas; no se copiaron hashes del manifest como si fueran observados remotamente. |
| Checksum original de 006 confirmado | Se conserva el valor aportado 2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e. |
| pedidos: seis columnas originales | Se incluyen id, usuario_id, estado, moneda, costo_envio y creado_en; sus atributos permanecen null pendientes. No se añaden las columnas de 006 ausentes. |
| carritos: seis columnas; id, usuario_id y usuario_activo_id identificadas | Se incluyen solo esos tres nombres demostrados. El mapa está incompleto: faltan los otros tres nombres y atributos de las seis columnas. No se rellenan copiando SQL histórico. |
| usuario_activo_id STORED GENERATED | Hecho conservado en este informe. EXTRA y GENERATION_EXPRESSION exactos siguen pendientes; no se reconstruye su expresión desde la migración. |
| Índices pedidos/carritos identificados por nombre | Objetos con name confirmado; unique/type/visible/columns permanecen null. El nombre no se utiliza como prueba de orden, prefijo, visibilidad o unicidad observados. |
| FK a usuarios.id en ambas tablas | Nombre, columna local, tabla y columna remotas aportados; referencedSchema, reglas y enforcement permanecen null. No se presupone esquema referenciado o RESTRICT solo por el diseño original. |
| historial_pedidos ausente | tables.historial_pedidos=null, según ausencia remota confirmada por el usuario. |
| Sin CHECK devueltos para las tablas consultadas | checks=[] registra el resultado de la consulta aportada, no demuestra ausencia real de restricciones con visibilidad completa. Es un bloqueo que debe resolverse, descrito debajo. |
| Triggers: ninguno | triggers=[] recoge la evidencia aportada. Conservar el resultado íntegro y su ámbito/visibilidad al cerrar completitud. |
| pedidos=0, carritos=0, detalles_pedido=0 y detalles_carrito=0 | ordersCount=0. Los otros conteos se documentan aquí porque no tienen campos en el contrato; no se añaden propiedades arbitrarias. |
| Historial ausente y pedidos vacíos | historyRows=0 y ordersMissingHistory=0 son deducciones justificadas de esos dos hechos, no consultas ejecutadas sobre una tabla inexistente. |
| Dos consultas de duplicados devolvieron 0 | No se asignan a duplicateCartGroups/duplicateRequestGroups: esas columnas no existen y no se aportaron las consultas exactas. Los contadores condicionales permanecen null/no aplicables. No repetir consultas sobre columnas ausentes. |

**Convención importante:** null en un atributo de un objeto presente o en una fecha incompleta significa aquí pendiente; no debe interpretarse como valor SQL NULL observado. El formato actual no dispone de un tipo UNKNOWN, por eso metadataComplete=false es obligatorio. Solo historial_pedidos=null y los conteos derivados tienen aquí semántica de ausencia confirmada. El candidato no puede consumirse como snapshot final sin completar y revisar esos placeholders.

## 3. Bloqueo específico de CHECK

El planificador exige exactamente en pedidos:

- ck_pedidos_moneda, clause `moneda = 'PEN'`, enforced=true.
- ck_pedidos_envio, clause `costo_envio >= 0`, enforced=true.

El resultado aportado de TABLE_CONSTRAINTS no contiene CHECK. Por tanto **no basta completar columnas/índices para aprobar el candidato**. No se agregaron los dos CHECK esperados al JSON ni se retiraron del validador.

Posibilidades todavía abiertas: ausencia real, diferencia de metadatos/visibilidad, filtro/resultado incompleto de la consulta o divergencia del esquema. Solo el resultado íntegro y SHOW CREATE permiten acotarlas. Que 002 figure applied no prueba que las restricciones estén presentes y efectivas actualmente. Si se confirma su ausencia real, el esquema es incompatible con el contrato y será necesaria otra decisión de reparación autorizada; este alcance no incluye crear CHECK ni debilitar la validación.

## 4. Lecturas pendientes exactas, para ejecución manual del usuario

No ejecutadas aquí. Mantener sin escrituras/migraciones durante captura y no usar el probe. Obtener resultados completos sin truncamiento. Las consultas y condiciones ampliadas están en [3.13](DESPLIEGUE_ETAPA_3_13_CAPTURA_METADATOS.md).

### A. Completar hashes y fechas reales de todo el ledger

```sql
SELECT version, checksum, status, CAST(applied_at AS CHAR) AS applied_at
FROM otakuzone_db.schema_migrations_tidb
ORDER BY version;
```

Copiar todas las filas. Fechas 001–005 deben ser strings observados no vacíos; 006.applied_at debe comprobarse SQL NULL para el contrato. No dejar null por falta de dato ni rellenar fechas estimadas. Si hay 007 u otras versiones, no omitirlas para aprobar el plan.

### B. Inventario y atributos de tablas

```sql
SELECT t.TABLE_NAME, t.TABLE_TYPE, t.ENGINE, t.TABLE_COLLATION,
       c.CHARACTER_SET_NAME
FROM information_schema.TABLES AS t
LEFT JOIN information_schema.COLLATIONS AS c
  ON c.COLLATION_NAME = t.TABLE_COLLATION
WHERE t.TABLE_SCHEMA = 'otakuzone_db'
ORDER BY t.TABLE_NAME;
```

Faltan tableType/engine/charset/collation actuales de pedidos y carritos. El plan espera BASE TABLE/InnoDB/utf8mb4/utf8mb4_0900_ai_ci, pero no se copiaron esos valores esperados. También falta inventario completo que descarte schema_migrations o movimientos_inventario; si aparecen, incorporarlos al mapa y detenerse.

### C. Nombres y atributos exactos de las columnas

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA,
       CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION,
       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
       NUMERIC_SCALE, DATETIME_PRECISION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

Mapear type/nullable/charset/collation/default/extra/generationExpression, conservando SQL NULL frente a string vacío. Mantener decimal default como string. No inferir atributos por tratarse de PK o por el tipo de otra columna. Normalización textual de widths/casing/defaults requiere revisión, no sustitución ciega por el contrato.

### D. Índices y atributos completos

```sql
SHOW INDEX FROM otakuzone_db.pedidos;
```

```sql
SHOW INDEX FROM otakuzone_db.carritos;
```

```sql
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
       COLUMN_NAME, SUB_PART, COLLATION AS INDEX_COLUMN_ORDER,
       INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

Faltan unique, type, visible y partes ordenadas name/prefix/order/expression para cada índice. Usar NON_UNIQUE=0→true, COLLATION A→ASC o D→DESC; NULL no implica ASC. Revisar Visible/Expression de SHOW INDEX. Si no los expone, consultar Q5 y la rama opcional de Q6 en 3.13 antes de pedir campos que podrían no existir; no establecer visible=true/expression=null por defecto. El contrato compara ciertas partes vía JSON.stringify: conservar orden de claves name,prefix,order,expression al construir cada parte del índice.

### E. CHECK/enforcement y estructura: prioridad del diagnóstico

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
```

```sql
SELECT CONSTRAINT_NAME, CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'otakuzone_db'
ORDER BY CONSTRAINT_NAME;
```

```sql
SHOW CREATE TABLE otakuzone_db.pedidos;
```

```sql
SHOW CREATE TABLE otakuzone_db.carritos;
```

La consulta CHECK_CONSTRAINTS es independiente del join y abarca todo el esquema para no perder restricciones por un filtro previo. No adjuntar metadatos de otras tablas al mapa equivocado: identificar sus nombres con TABLE_CONSTRAINTS/SHOW CREATE.

Si ENFORCED no existe o da resultados desconocidos, registrar la limitación; no sustituirlo por YES. SHOW CREATE permite comprobar declaraciones pero no es por sí solo una prueba negativa de enforcement. No ejecutar INSERT para comprobarlo dentro de esta etapa. Conservar evidencia cruda ante diferencias de paréntesis, backticks o introductores de charset: el comparador de CHECK del planificador es textual y no normaliza esas formas automáticamente.

### F. Reglas y destino exacto de FK

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

Completar referencedSchema/onDelete/onUpdate y obtener enforced por la fila correspondiente de TABLE_CONSTRAINTS. No convertir ausencia de información sobre enforcement de FK en true. Si el servicio no la expone de forma verificable, el contrato actual no puede certificarse con los resultados disponibles y debe revisarse explícitamente en otro alcance.

### G. Triggers y coherencia temporal, solo si falta conservar evidencia íntegra

El usuario ya confirmó ausencia de triggers y pedidos=0; no se exige repetirlos por rutina. Si no se dispone de resultados íntegros o hubo actividad posterior, las lecturas son:

```sql
SELECT EVENT_OBJECT_TABLE AS TABLE_NAME, TRIGGER_NAME,
       EVENT_MANIPULATION, ACTION_TIMING, ACTION_ORIENTATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'otakuzone_db'
  AND EVENT_OBJECT_TABLE IN ('pedidos', 'carritos', 'historial_pedidos')
ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME;
```

```sql
SELECT COUNT(*) AS ordersCount FROM otakuzone_db.pedidos;
```

No consultar historial_pedidos mientras siga ausente ni ejecutar duplicados/huérfanos sobre las columnas nuevas ausentes. Si alguno de esos objetos aparece en una captura actualizada, seguir únicamente las ramas condicionales Q10/Q11 de 3.13. Los dos resultados de duplicados aportados necesitan su texto exacto para determinar su ámbito; no se vuelve a ejecutar el migrador para obtener evidencia.

## 5. Decisión de planificación y validación local

**Planificador no ejecutado:** el requisito del usuario lo condiciona a cumplir el contrato y este candidato no lo cumple. No se activó metadataComplete=true temporalmente para probarlo, ni se cargaron metadatos sintéticos como producción.

Las validaciones de esta entrega se limitan a parsear el JSON, revisar formato/campos conocidos y comprobar metadataComplete=false, ausencia de la fila 007 y de las columnas nuevas no existentes. No se ejecutan suites ni SQL. Las pruebas históricas de 3.12 no se presentan como ejecuciones nuevas.

Estado posterior previsto: resolver primero CHECK y los metadatos exactos de A–F, verificar vigencia de evidencia y completar el candidato. Si falta visibilidad o el esquema contradice el contrato, informar y detenerse; no modificar el planificador/SQL para aceptar datos favorables. Un futuro plan aprobado seguiría sin autorizar recuperación o avance hacia 007.

## 6. Preservación y cierre

Se crean únicamente el snapshot candidato y este informe. No se modifican archivos existentes, configuración local, MySQL, TiDB, ledger, migraciones 001–007, hashes, credenciales, certificados, .env o despliegues. No hay conexiones ni operaciones remotas. Se detiene el trabajo a la espera de la evidencia exacta pendiente y autorización posterior.
