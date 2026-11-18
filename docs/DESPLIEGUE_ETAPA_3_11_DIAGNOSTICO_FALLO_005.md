# OtakuZone — Etapa 3.11: diagnóstico del error posterior a APPLY 005

Fecha: **16 de noviembre de 2026**. Auditoría local y documental. **Sin conexión remota, SQL ejecutado, pruebas nuevas o recuperación aplicada.** La única escritura local es este informe solicitado; código, SQL, hashes y ledger permanecen intactos.

## 1. Dictamen principal

**El log aportado no identifica un fallo dentro de 005. Con el migrador TiDB actual, APPLY 005 se imprime después de ejecutar 005 y actualizar su entrada a applied. La causa probable está en el primer ALTER TABLE de 006.**

Esto corrige una interpretación anterior del alcance del fallo, sin afirmar un estado remoto observado. Si el usuario ejecutó otra revisión del código o una entrada distinta, debe contrastarse esa revisión antes de aplicar este razonamiento. La entrada MySQL imprime APPLY antes del SQL; la entrada TiDB inspeccionada lo imprime después. No son intercambiables.

El código mysql2 instalado asocia `ER_KEY_COLUMN_DOES_NOT_EXITS` al número **1072**. El nombre contiene esa ortografía en el propio driver. Su significado apunta a una columna de clave no existente; el código solo no identifica la columna ni la sentencia exactas.

El script `backend/scripts/migrate.js` registra `error.code ?? error.message`: al existir code se pierde en consola el texto que normalmente identificaría la columna. **No es posible identificar categóricamente cuál columna produjo el error con el log reducido disponible.** No se inventa ese dato.

## 2. Evidencia inspeccionada

Se leyeron íntegramente los SQL TiDB 001–005 y además 006, `tidbMigrate.js`, la entrada de migración, catálogo/validación de historial, ledger y pruebas relacionadas.

| Fuente | Hallazgo |
| --- | --- |
| 001 | CREATE DATABASE IF NOT EXISTS otakuzone_db; no crea columnas de claves |
| 002 | Crea usuarios, carritos y pedidos. pedidos ya contiene usuario_id, pero todavía no carrito_origen_id ni clave_solicitud |
| 003 | Seeds de roles y planes; no cambia columnas/índices |
| 004 | Seeds de catálogo/inventario/promociones; no cambia columnas/índices |
| 005 | Un único CREATE TABLE IF NOT EXISTS auth_sesiones; todas sus columnas locales de índice/FK/CHECK están declaradas antes de las restricciones |
| 006 | Primer ALTER añade dos columnas y en la misma sentencia añade índices y FK dependientes de esas columnas nuevas |
| tidbMigrate.js | Marcador applying antes de cada versión; SQL, actualización applied y después log APPLY |
| ledger.sql | applied_at nullable; status applying/applied; una fila por versión |

### SQL íntegro de 005, sin modificaciones

```sql
-- Solo sesiones revocables. Reutiliza usuarios/roles de Fase 5 sin duplicarlos.
CREATE TABLE IF NOT EXISTS auth_sesiones (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  creada_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_en DATETIME(3) NOT NULL,
  revocada_en DATETIME(3) DEFAULT NULL,
  KEY ix_auth_sesiones_usuario (usuario_id),
  KEY ix_auth_sesiones_expiracion (expira_en),
  CONSTRAINT fk_auth_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_auth_sesiones_expiracion CHECK (expira_en > creada_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

PK(id), ix_auth_sesiones_usuario(usuario_id) e ix_auth_sesiones_expiracion(expira_en) usan columnas existentes en este CREATE. La FK apunta a usuarios(id), definido en 002 con BIGINT UNSIGNED, igual a usuario_id. No se encuentra aquí una referencia local a columna omitida ni un error de orden que explique directamente 1072.

CREATE IF NOT EXISTS no certifica que una tabla preexistente sea correcta. El log de éxito tampoco reemplaza la inspección de estructura.

## 3. Sentencia exacta sospechosa y causa probable

Primer bloque de `backend/database/tidb/migrations/006_commerce.sql`, reproducido **para diagnóstico; NO EJECUTAR**:

```sql
ALTER TABLE pedidos
  ADD COLUMN carrito_origen_id BIGINT UNSIGNED NULL,
  ADD COLUMN clave_solicitud CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_pedidos_carrito (carrito_origen_id),
  ADD UNIQUE KEY uq_pedidos_solicitud (usuario_id, clave_solicitud),
  ADD CONSTRAINT fk_pedidos_carrito FOREIGN KEY (carrito_origen_id) REFERENCES carritos(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

| Referencia dependiente | Columna | Estado tras 002, antes de 006 |
| --- | --- | --- |
| uq_pedidos_carrito | carrito_origen_id | No existe todavía |
| uq_pedidos_solicitud | usuario_id | Ya existe |
| uq_pedidos_solicitud | clave_solicitud | No existe todavía |
| fk_pedidos_carrito | carrito_origen_id | No existe todavía |
| FK referenciada | carritos.id | Existe en 002 |

PingCAP documenta que un ALTER compuesto puede validar referencias contra el esquema previo a su ejecución. Una columna añadida en el mismo ALTER puede no estar disponible para otra especificación. **Inferencia:** uq_pedidos_carrito sobre carrito_origen_id es el primer candidato por orden textual; uq_pedidos_solicitud/clave_solicitud y la FK también dependen de columnas nuevas. El orden de validación interno no queda demostrado por el orden textual. [TiDB Cloud ALTER TABLE, compatibilidad MySQL](https://docs.pingcap.com/tidbcloud/sql-statement-alter-table/), consultado el 2026-11-16.

La combinación de esa limitación publicada, la definición de pedidos y el log posterior a 005 sustenta **una incompatibilidad probable del ALTER compuesto de 006**, no un error demostrado del CREATE 005. La documentación actual no reproduce por sí sola el parche/build 8.5.3-serverless ni sustituye al error completo remoto.

No hay evidencia de un problema de email, CA, cuenta root o contraseña que explique específicamente este error de clave. Tampoco se debe descartar una divergencia del esquema o del código ejecutado sin obtener metadatos. El SQL de las sentencias UPDATE/INSERT del ledger no referencia las columnas nuevas de pedidos; por eso son candidatos menos consistentes con este 1072.

## 4. Secuencia y estado esperado del ledger

Para una ejecución del código TiDB inspeccionado:

1. Inserta marcador applying de 005 en autocommit.
2. Ejecuta CREATE auth_sesiones.
3. Actualiza 005 a applied y fija applied_at.
4. Imprime APPLY 005.
5. Inserta marcador applying de 006.
6. Ejecuta el archivo 006; su primera sentencia es el ALTER sospechoso.
7. Si falla ahí, no actualiza 006 a applied y no empieza 007.

| Versión | Estado esperado bajo esta hipótesis |
| --- | --- |
| 001–005 | applied, con applied_at informado y hashes del catálogo |
| 006 | applying, applied_at NULL, si su marcador se confirmó antes del ALTER |
| 007 | Sin entrada |

**006 probablemente se intentó, aunque no apareció APPLY 006.** La frase «no se ejecutó 006» no puede deducirse de la ausencia de su mensaje final. Si no existe marcador de 006, investigar fallo anterior al SQL de 006, código distinto u otras operaciones; no forzar esta hipótesis.

005/006 no son versiones transaccionales del manifest. No se aplica rollback global a su DDL. El marcador applying está diseñado para detener la siguiente ejecución. Reintentar ahora el mismo comando no constituye recuperación: debería ser rechazado por historial parcial.

## 5. Objetos posibles y límites

**005:** solo define auth_sesiones, su PK, dos índices secundarios, FK a usuarios y CHECK de expiración. No inserta sesiones ni usuarios. Bajo la secuencia del log debe haber finalizado su sentencia, pero podría haber encontrado una tabla previa por IF NOT EXISTS. Si realmente hubiese fallado su CREATE, no se puede deducir persistencia parcial de componentes del CREATE sin inspección; con este código tampoco debería haberse impreso APPLY 005.

**006:** la validación previa hace razonable esperar pedidos sin las dos columnas nuevas y ausencia de historial_pedidos. No se garantiza ese estado. Revisar columnas, índices y FK para detectar cualquier aplicación parcial. El archivo contiene después CREATE historial_pedidos y un backfill INSERT SELECT: si falló su primera sentencia, no se espera que se alcanzaran; el log disponible no demuestra por sí solo cuál sentencia falló. Si existen historial/datos, conservarlos e investigar, sin eliminarlos.

**007:** no se espera movimientos_inventario creado por esta ejecución. Su presencia indicaría otra ejecución/acción o una hipótesis incompleta. La ausencia de objetos no puede afirmarse sin metadatos visibles.

## 6. Consultas de solo lectura para el usuario

**Preparadas, no ejecutadas aquí.** Ejecutar manualmente en SQL Editor, una por una. No usan USE, SET, DDL, DML, locks ni lecturas de correos, hashes de contraseñas o tokens. Los checksums del ledger son hashes de archivos SQL, no secretos.

### A. Identidad de motor, historial e inventario

```sql
SELECT VERSION() AS version, DATABASE() AS selected_database;
```

```sql
SELECT version, checksum, status, applied_at
FROM otakuzone_db.schema_migrations_tidb
ORDER BY version;
```

```sql
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'otakuzone_db'
ORDER BY TABLE_NAME;
```

Comparar hashes con el manifest local, especialmente 005 y el intento 006. Cero filas en metadatos no prueba ausencia si la cuenta no tiene visibilidad suficiente. Si el ledger no existe o la consulta falla, conservar ese resultado y detener la interpretación automática.

### B. Columnas e índices relevantes

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
       COLUMN_DEFAULT, CHARACTER_SET_NAME, COLLATION_NAME, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('usuarios', 'carritos', 'pedidos',
                     'auth_sesiones', 'historial_pedidos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

```sql
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
       COLUMN_NAME, SUB_PART
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('usuarios', 'carritos', 'pedidos',
                     'auth_sesiones', 'historial_pedidos')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'auth_sesiones', 'historial_pedidos')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
```

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME IN ('pedidos', 'auth_sesiones', 'historial_pedidos')
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
```

### C. DDL real, solo de tablas cuya existencia se confirmó en A

```sql
SHOW CREATE TABLE otakuzone_db.auth_sesiones;
```

```sql
SHOW CREATE TABLE otakuzone_db.pedidos;
```

```sql
SHOW CREATE TABLE otakuzone_db.carritos;
```

Solo si historial_pedidos existe:

```sql
SHOW CREATE TABLE otakuzone_db.historial_pedidos;
```

### D. Recuentos agregados para preservar datos

Solo si se confirmó la existencia de cada tabla:

```sql
SELECT COUNT(*) AS total_pedidos FROM otakuzone_db.pedidos;
```

```sql
SELECT COUNT(*) AS total_sesiones FROM otakuzone_db.auth_sesiones;
```

```sql
SELECT COUNT(*) AS total_historial FROM otakuzone_db.historial_pedidos;
```

Estas lecturas son snapshots separados; no prometen ausencia de cambios concurrentes. No usar SHOW WARNINGS/SHOW ERRORS de una sesión nueva como si recuperasen el error de la conexión Node anterior. Si se conserva el mensaje completo del fallo en logs existentes, aportar solo el texto redactado y el nombre de columna, sin secretos; no repetir migraciones para obtenerlo.

## 7. Recuperación propuesta, pendiente de evidencia y aprobación

1. Congelar reintentos, despliegues y escrituras de aplicación. Mantener SQL, hashes y ledger actuales. Conservar el log original y la revisión exacta ejecutada.
2. Recoger únicamente las lecturas anteriores. Si 005 aparece applied y su estructura coincide, **no repararla ni recrearla**. Identificar 006 applying y diferencias reales frente al plan. Cualquier discrepancia con la hipótesis requiere diagnóstico adicional, no una corrección automática.
3. Preparar copia/exportación y recuperación de datos con alcance aprobado antes de tocar objetos. No asumir que pedidos/sesiones estén vacíos porque la base fue recién creada.
4. Para una revisión posterior, diseñar 006 TiDB con fases separadas: columnas primero; índices/FK después de confirmar columnas; finalmente historial y backfill. No basta invertir cláusulas del mismo ALTER si el problema es validación contra el esquema previo. No presentar ese diseño como ya probado en la build real.
5. **Resolver explícitamente el versionado del intento fallido:** el marcador 006 contiene el checksum del SQL original intentado. No modificarlo, borrarlo o marcarlo applied para aceptar SQL distinto. Un plan futuro deberá conservar evidencia del intento y registrar la reparación y su SQL/hash reales mediante un mecanismo auditado. Esto puede requerir una entrada de recuperación específica y adaptación del migrador/ledger; no existe todavía una ruta automática autorizada para ello.
6. Preservar 001–005 y sus checksums aplicados, y todas las migraciones MySQL. Añadir simplemente 008 no arregla que el migrador se detenga antes por 006 applying. No ejecutar manualmente fragmentos de 006 para luego fingir que el archivo original terminó.
7. Tras aprobar implementación de recuperación, ensayarla de forma focalizada con datos sintéticos y probar interrupciones/reanudación, columnas/índices/FK, backfill e historial. Solo después solicitar autorización para reparar el destino real y continuar hasta 007. No se autoriza ninguna de esas acciones por este informe.

Si la evidencia muestra otro estado —005 applying sin su mensaje de cierre coherente, 006 ausente, índices parciales, o historial ya poblado— el plan debe ajustarse a ese estado. **No hay todavía un comando de recuperación seguro listo para ejecutar.**

## 8. Cobertura y fallo de expectativa anterior

Las pruebas revisadas verifican procedencia/checksums, continuidad, marcador previo al DDL, bloqueo ante estado parcial y siete versiones con dobles. El fallo DDL simulado se provoca en 002; el doble de éxito acepta el texto de 005/006 sin parsearlo ni emular TiDB. No existe en esos tests una demostración de compatibilidad real del ALTER compuesto de 006 ni una reproducción específica de 1072. Los resultados locales anteriores no garantizaban esa capacidad del servidor.

La evaluación anterior «sin cambio de sintaxis obligatorio identificado» de 006 era una conclusión estática condicionada. Este fallo aporta evidencia nueva consistente con una adaptación necesaria. Corresponde corregir la expectativa técnica y diseñar recuperación, no debilitar las guardias existentes. No se ejecutaron tests, fixtures SQL o experimentos nuevos en esta auditoría.

## 9. Cierre

**Causa probable: referencia a columnas recién añadidas en el ALTER compuesto de 006; 005 probablemente terminó. Causa/columna exacta y estado remoto: pendientes de verificación.** No se afirma que se hayan observado las tablas ni el ledger en TiDB.

Único archivo creado: este informe. No se alteraron archivos existentes, MySQL local, TiDB, el probe, ledger, SQL, hashes, usuarios, permisos, credenciales o .env. No hubo conexiones, DDL/DML, migraciones, limpieza, despliegues o commits. Se detiene el trabajo a la espera de la evidencia de solo lectura y de autorización para cualquier etapa posterior.
