# OtakuZone — Etapa 3.18: captura mínima final para el snapshot TiDB 006

Fecha: **17 de noviembre de 2026**. Único entregable: este documento. **No se ejecutó SQL, abrió conexión TiDB ni modificó snapshot, contrato o ledger.**

## 1. Pendientes del contrato real

Se inspeccionaron `tidb006RecoveryPlan.js`, el candidato y el cierre de 3.17. No hace falta volver a capturar ledger, conteos, inventario general, nombres/unicidad de índices o cláusulas CHECK de forma aislada.

| Guardia del planificador que sigue bloqueada | Captura necesaria |
| --- | --- |
| Todas las columnas originales de pedidos y carritos.id | type, nullable, charset, collation, default, extra y generationExpression exactos |
| Índices originales de pedidos y PK de carritos | type/visible y prefix/order/expression de cada parte |
| FK original de pedidos y CHECK de pedidos | enforced individual, todavía desconocido |

La captura completa de carritos se conserva por coherencia documental, pero el plan **no valida todos los atributos de sus demás columnas, índices secundarios o FK**. En concreto, enforced de fk_carritos_usuario está pendiente en el candidato, aunque no es una guardia comprobada por el cuerpo actual del plan. Tampoco debe rellenarse sin evidencia. La expresión STORED de usuario_activo_id puede ayudar a contrastar sus índices, sin inventar texto truncado.

## 2. Compatibilidad comprobada y límites

Se verificaron en la fuente pública **tag v8.5.3** las definiciones de COLUMNS, KEY_COLUMN_USAGE, REFERENTIAL_CONSTRAINTS y CHECK_CONSTRAINTS utilizadas abajo. TABLE_CONSTRAINTS no define ENFORCED. No se selecciona ese campo. [Definiciones de metadatos v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/infoschema/tables.go).

Se comprobó además la implementación v8.5.3 de SHOW CREATE TABLE y SHOW INDEX: esta última emite atributos de tipo, visibilidad, prefijo y expresión. [Implementación SHOW v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/executor/show.go). La [referencia oficial de SHOW INDEX](https://docs.pingcap.com/tidb/stable/sql-statement-show-indexes/) respalda la sintaxis.

Esto verifica compatibilidad estática con la versión pública, **no ejecución en 8.5.3-serverless**. La build administrada o sus permisos pueden limitar resultados. No se afirma que una consulta haya pasado en la instancia. Ante error de permiso/columna o salida truncada, conservar el diagnóstico y detener esa captura, sin cambiar variables ni ampliar permisos.

## 3. Bloque mínimo: siete consultas, en este orden

Ejecutar manualmente **una sentencia cada vez**, copiando el resultado antes de pasar a la siguiente. Los SHOW CREATE muestran DDL como texto, pero **no ejecutan CREATE**. No copiar ese DDL de salida para ejecutarlo. No hay USE, SET, escrituras o lecturas de datos personales.

```sql
-- 1. Copiar la celda Create Table COMPLETA, incluidos comentarios y sufijos.
SHOW CREATE TABLE otakuzone_db.pedidos;

-- 2. Igual para carritos; no truncar la expresión generada.
SHOW CREATE TABLE otakuzone_db.carritos;

-- 3. Atributos pendientes y distinción explícita SQL NULL/string vacío.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME,
       COLUMN_TYPE, IS_NULLABLE, CHARACTER_SET_NAME, COLLATION_NAME,
       COLUMN_DEFAULT, COLUMN_DEFAULT IS NULL AS default_is_null,
       EXTRA, EXTRA IS NULL AS extra_is_null,
       GENERATION_EXPRESSION,
       GENERATION_EXPRESSION IS NULL AS generation_is_null
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 4. Copiar todas las columnas y las cinco filas/partes de índices esperadas.
SHOW INDEX FROM otakuzone_db.pedidos;

-- 5. Igual: cuatro filas/partes esperadas, no cuatro índices distintos.
SHOW INDEX FROM otakuzone_db.carritos;

-- 6. Contraste FK: necesario para interpretar la declaración del SHOW CREATE.
SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION,
       k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA,
       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
       r.UPDATE_RULE, r.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE AS k
JOIN information_schema.REFERENTIAL_CONSTRAINTS AS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.TABLE_NAME = k.TABLE_NAME
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA = 'otakuzone_db'
  AND k.TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;

-- 7. Cláusulas registradas, sin ENFORCED ni un join que oculte CHECK.
SELECT CONSTRAINT_NAME, CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'otakuzone_db'
  AND CONSTRAINT_NAME IN ('ck_pedidos_moneda', 'ck_pedidos_envio')
ORDER BY CONSTRAINT_NAME;
```

La repetición de reglas/destinos FK y cláusulas CHECK en 6–7 no los reabre como pendientes: acompaña la lectura de definición individual pedida, contrasta su representación actual y permite identificar diferencias entre SHOW CREATE y las vistas. No captura otras restricciones ni toda la base. Si 7 devuelve cero filas, conservar ese resultado **junto al SHOW CREATE**; no borrar CHECK del candidato ni inferir ausencia/enforcement falso.

No añadir SELECT del ledger, versión, variables globales, COUNT de tablas vacías, triggers o duplicados: ya están confirmados y no resuelven estos atributos pendientes. No consultar historial_pedidos o columnas nuevas de 006 mientras estén ausentes.

## 4. Qué copiar para evitar otra captura incompleta

| Consulta | Resultado que se debe conservar |
| --- | --- |
| 1–2 | Texto íntegro de Create Table. Abrir/expandir la celda o exportar si la cuadrícula corta líneas. Mantener comentarios versionados, NOT ENFORCED, FOREIGN KEY INVALID, charset/collation, defaults y expresión STORED completos. |
| 3 | Todas las filas con sus encabezados. Copiar el valor y el indicador is_null: 1 significa SQL NULL; 0 con valor vacío significa string vacío, no desconocido. |
| 4–5 | Non_unique, Key_name, Seq_in_index, Column_name, Collation del índice, Sub_part, Index_type, Visible/Index_visible y Expression, si aparecen, sin perder ninguna parte de índice. No confundir la columna Null del índice con Sub_part o Expression. |
| 6 | Tabla, nombre, posición, columna y destino FK, más reglas. Un nombre/referencia no certifica enforcement; no hay booleano individual en esta vista. |
| 7 | Nombres y cláusulas completos o el resultado vacío exacto. Esta vista no expone ENFORCED. |

Los recuentos de filas indicados son expectativas según evidencia anterior, no resultados nuevos de esta etapa. Si difieren, no filtrar las filas adicionales para cumplir expectativas. No copiar correos, contraseñas, tokens o certificados; estas consultas no los seleccionan.

### Solo si el visor oculta la diferencia entre vacío y SQL NULL en índices

No ejecutar por rutina. Si SHOW INDEX/exportación conserva inequívocamente el tipo null, no hace falta. Los campos siguientes están comprobados en statisticsCols del tag v8.5.3; esta es una aclaración de representación, no una prueba funcional:

```sql
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX,
       SUB_PART, SUB_PART IS NULL AS prefix_is_null,
       EXPRESSION, EXPRESSION IS NULL AS expression_is_null,
       COLLATION AS index_column_order, INDEX_TYPE, IS_VISIBLE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'carritos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

No seleccionar campos distintos de los comprobados ni sustituir un error de la build administrada por constantes favorables. Si esta aclaración no es accesible, conservar desconocido; no inventar prefix=null/expression=null.

## 5. Evidencia individual que sí puede aportar SHOW CREATE

En el tag público v8.5.3, SHOW CREATE serializa cada CHECK público y añade `/*!80016 NOT ENFORCED */` cuando su propiedad interna Enforced es falsa. Por tanto, el DDL **íntegro** puede aportar evidencia del estado declarativo individual: un marcador explícito rechaza la suposición de enforcement; su ausencia solo puede interpretarse tras revisar la salida completa y la correspondencia de esa semántica con la build administrada. No se deduce nada de una captura cortada.

La misma implementación añade `/* FOREIGN KEY INVALID */` a ciertas FK de versión antigua. Ese marcador es una señal de incompatibilidad; la presencia de una FK sin él no se presenta como prueba funcional de que toda sesión aplique las referencias. Ni SHOW CREATE ni la vista de reglas proporcionan aquí un booleano de enforcement FK equivalente al exigido por el modelo.

Estos hallazgos permiten mejorar la evidencia disponible respecto a etapas anteriores, **sin declarar todavía enforced=true**. Son interpretación del código público, no observación de la instancia ni prueba negativa sobre sus tablas. Las variables globales y el ensayo CHECK temporal previo no se vuelven a pedir y no sustituyen evidencia individual. No se propone ninguna inserción/actualización de ensayo.

Aunque las siete lecturas se completen, puede permanecer el bloqueo de cómo corroborar/representar enforcement individual de FK en el contrato actual. Si no hay evidencia suficiente, mantener metadataComplete=false y someter esa representación a revisión explícita posterior; no modificar guardias ni afirmar que más consultas repetidas producirán un campo inexistente.

## 6. Normalización posterior y cierre

No transcribir aún una salida supuesta al JSON. El contrato utiliza comparación estricta de tipos/defaults, cláusulas y partes de índices: conservar datos originales y revisar normalizaciones de mayúsculas, widths enteros y comentarios antes de aceptarlas. No completar expresiones truncadas con el SQL de la migración ni eliminar diferencias semánticas para forzar aprobación.

Las fuentes /v8.5/ de documentación no fueron accesibles en dos intentos; se usó el tag de código exacto v8.5.3 para comprobar los campos y la implementación SHOW. La documentación stable es apoyo, no una especificación congelada de serverless. No se realizó otra ronda de experimentos de regex, DDL o autenticación.

Se crea únicamente este informe con el orden de captura. No se modifica candidato, contrato, ledger, SQL histórico, .env, credenciales, probe o datos. No se ejecuta planificador, migrador, recuperación, 007, pruebas funcionales o despliegues. Las lecturas quedan preparadas para ejecución manual del usuario; esta etapa termina aquí.
