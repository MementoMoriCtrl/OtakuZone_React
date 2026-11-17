# OtakuZone — Etapa 3.7.1: SQL del ensayo aislado de email

Fecha: **16 de noviembre de 2026**. Estado: **preparado para revisión, NO EJECUTADO**. Ningún bloque de este documento autoriza su ejecución.

## 1. Alcance y orden

Se revisaron los informes 3.4, 3.5, 3.6 y 3.6.1 y el normalizador vigente. Se recupera **sin cambios** el CREATE TABLE de 3.6.1, incluido su CHECK. La aprobación documental no equivale a demostrar enforcement real.

El usuario informa confirmación en TiDB Starter 8.5.3 de la collation NO PAD, reconocimiento de REGEXP_LIKE/OCTET_LENGTH, resultados de patrones y modo pesimista/CHECK habilitado. Se toma como evidencia aportada, no como consultas ejecutadas aquí. No se reproduce el correo personal aportado: todos los fixtures siguientes son sintéticos.

Orden futuro, solo tras autorización expresa del alcance correspondiente:

1. SELECT/SHOW previos: comprobar instancia, modos y ausencia del esquema.
2. CREATE DATABASE y después CREATE TABLE, individualmente.
3. SELECT/SHOW de estructura: confirmar CHECK/índice antes de insertar.
4. INSERT válidos y verificar doce filas.
5. INSERT inválidos y duplicado, **uno por uno**, revisando cada error.
6. SELECT final: siguen exactamente doce filas y cero anomalías.
7. DROP solo si se autorizó explícitamente la limpieza y no existen objetos ajenos.

**No usar «ejecutar todo».** Hay errores deliberados de INSERT y bloques destructivos de limpieza. No usar un cliente que ignore indiscriminadamente errores. Cualquier error inesperado detiene el ensayo; un error esperado se registra y se continúa manualmente con el siguiente caso. No repetir bloques ya aplicados ni añadir IF NOT EXISTS, IGNORE, REPLACE o upsert.

## 2. SELECT/SHOW previos — solo lectura, no ejecutados

```sql
SELECT VERSION() AS version, @@version_comment AS version_comment;
```

```sql
SHOW SESSION VARIABLES
WHERE Variable_name IN (
  'sql_mode', 'autocommit', 'character_set_client',
  'character_set_connection', 'collation_connection',
  'tidb_txn_mode', 'tidb_constraint_check_in_place_pessimistic'
);
```

```sql
SHOW GLOBAL VARIABLES
WHERE Variable_name = 'tidb_enable_check_constraint';
```

```sql
SHOW COLLATION WHERE Collation = 'utf8mb4_0900_bin';
```

```sql
SELECT SCHEMA_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'otakuzone_email_probe';
```

Exigir destino TiDB esperado, encoding UTF-8 compatible, modo estricto, CHECK habilitado y modo pesimista; registrar el resto sin cambiar variables. Para las inserciones individuales de este procedimiento se requiere **autocommit ON y ninguna transacción pendiente**. Si el editor no permite garantizarlo, detenerse y revisar el procedimiento, sin introducir SET/COMMIT automáticos sobre una sesión desconocida.

La última consulta debe devolver **cero filas**, con visibilidad suficiente para comprobarlo. Si el esquema ya existe, no reutilizarlo ni eliminarlo: detenerse. CREATE sin IF NOT EXISTS ofrece otra barrera ante un nombre existente. No ampliar permisos para leer `mysql.tidb`; ese acceso no forma parte del ensayo.

## 3. CREATE DATABASE — DDL propuesto

**Crea una base lógica dentro de la instancia existente, no otra instancia.** Nombre exacto: `otakuzone_email_probe`. No ejecutar antes de autorizar DDL.

```sql
CREATE DATABASE otakuzone_email_probe
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_bin;
```

Resultado esperado: éxito y esquema nuevo. Si falla, no pasar a CREATE TABLE. La sintaxis está documentada por [PingCAP CREATE DATABASE](https://docs.pingcap.com/tidb/stable/sql-statement-create-database/), consultado el 2026-11-16, selector v8.5; no es evidencia de ejecución en la instancia.

## 4. CREATE TABLE — CHECK exacto de 3.6.1

Objeto único: `otakuzone_email_probe.usuarios_probe`. PK sobre id de fixture, email VARCHAR(254) NOT NULL, collation explícita, UNIQUE completo `uq_probe_email` y CHECK `ck_probe_email_canonical`. No contiene passwords, cuentas reales, sesiones, roles ni ledger.

```sql
CREATE TABLE otakuzone_email_probe.usuarios_probe (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  email VARCHAR(254)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  UNIQUE KEY uq_probe_email (email),
  CONSTRAINT ck_probe_email_canonical CHECK (
    email IS NOT NULL
    AND OCTET_LENGTH(email) BETWEEN 1 AND 254
    AND NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
    AND REGEXP_LIKE(
      email,
      '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
      'c'
    )
  ) ENFORCED
);
```

Resultado esperado: tabla creada con el CHECK admitido y efectivo. Reconocer las funciones en SELECT no garantiza admitirlas en CHECK: si CREATE falla, **detenerse**, conservar el error redactado y no retirar ni simplificar la expresión. La base creada puede permanecer aunque CREATE TABLE falle; DDL no se revierte mediante un rollback de aplicación.

El CHECK comprueba valor **ya canónico**, no transforma entradas: la API puede normalizar mayúsculas/espacios antes del INSERT; SQL directo debe rechazarlos. Se conservan puntuación, reglas de posición y particularidades de Zod, sin introducir políticas RFC adicionales.

### Revisión final: coincidencia con los patrones aportados

En la versión del archivo inspeccionada durante esta corrección **no aparecen barras inversas delante de `_`, `@` o `*`, ni en ningún otro lugar de los bloques SQL**. No hubo escapes que eliminar ni cuantificadores que reparar. Se conservan literalmente los patrones probados que aportó el usuario:

```text
[^a-z0-9_''+@.-]
^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$
```

Esta representación corresponde al contenido escrito dentro del literal SQL: cada `''` representa un apóstrofo para el motor regex. Los `*` son cuantificadores sin escape, `_` y `@` son literales, `[.]` es punto literal y los guiones de puntuación están al final de sus clases. No se añade ni elimina ningún carácter admitido.

Se verificó mediante análisis de texto que ambos patrones y el flag `'c'` coinciden entre CREATE TABLE, los patrones aportados por el usuario y la consulta de anomalías de §9. Esta última expresa el **complemento** del CHECK mediante OR/NOT; no debe copiar sus operadores como si fueran el predicado de aceptación.

SELECT de referencia preparado con los mismos patrones y el predicado de aceptación completo, **no ejecutado aquí**:

```sql
SELECT
  email IS NOT NULL
  AND OCTET_LENGTH(email) BETWEEN 1 AND 254
  AND NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
  AND REGEXP_LIKE(
    email,
    '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
    'c'
  ) AS canonical_ok
FROM (
  SELECT _utf8mb4'probe@example.test' COLLATE utf8mb4_0900_bin AS email
) AS fixture;
```

Esperado: canonical_ok=1. Este bloque permite reproducir la expresión con un fixture sintético; no se afirma que sea el texto íntegro de la consulta histórica del usuario, que no se aportó. La coincidencia literal de sus patrones sí se verificó. Una prueba satisfactoria de SELECT **no certifica admisión ni funcionamiento del CHECK dentro de tablas**.

## 5. SELECT/SHOW de estructura — antes de INSERT

```sql
SHOW CREATE TABLE otakuzone_email_probe.usuarios_probe;
```

```sql
SHOW INDEX FROM otakuzone_email_probe.usuarios_probe;
```

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, CHARACTER_SET_NAME,
       COLLATION_NAME, CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_email_probe'
  AND TABLE_NAME = 'usuarios_probe'
ORDER BY ORDINAL_POSITION;
```

```sql
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'otakuzone_email_probe'
  AND TABLE_NAME = 'usuarios_probe';
```

Esperado: email varchar(254), utf8mb4/utf8mb4_0900_bin, nullable NO. Para `uq_probe_email`: **Non_unique=0, Column_name=email, Seq_in_index=1, Sub_part=NULL y una sola fila**; no basta comprobar su nombre. CHECK presente/ENFORCED=YES y cláusula conservada en SHOW CREATE TABLE. Si un campo de metadatos no está disponible, registrar el límite sin afirmar que se verificó; resolverlo antes de aceptar el ensayo.

TiDB documenta UNKNOWN para CHECK y exige diferenciar NOT NULL/enforcement; esta es la razón para revisar estructura y después hacer pruebas negativas. [PingCAP Constraints](https://docs.pingcap.com/tidb/stable/constraints/), consultado el 2026-11-16, rama v8.5.

## 6. INSERT de valores válidos — DML propuesto

Ejecutar únicamente después de aprobar por separado las escrituras de prueba. Se esperan **12 filas insertadas**, todas distintas y canónicas. Los dos valores largos tienen 254 bytes y difieren al final de la parte local: prueban que el UNIQUE no esté recortado a un prefijo insuficiente.

```sql
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email) VALUES
  (1, 'probe@example.test'),
  (2, 'a.b@example.test'),
  (3, 'ab@example.test'),
  (4, 'a-b@example.test'),
  (5, 'a_b@example.test'),
  (6, 'a+b@example.test'),
  (7, 'a''b@example.test'),
  (8, 'user@xn--bcher-kva.de'),
  (9, 'a@b.co'),
  (10, CONCAT(REPEAT('a', 242), '@example.com')),
  (11, CONCAT(REPEAT('a', 241), 'b@example.com')),
  (12, 'user@a-.example');
```

El fixture 12 conserva una particularidad del validador instalado; no implica que ese dominio sea entregable. No enviar correo ni usar direcciones personales.

### Comprobación offline de los doce fixtures

Se extrajeron del INSERT de este archivo y se expandieron las dos expresiones CONCAT/REPEAT en JavaScript, sin ejecutar SQL. Se decodificó el apóstrofo SQL duplicado del fixture 7; **no es una barra inversa ni dos caracteres de correo**. Todos los INSERT del documento están libres de barras inversas delante de `@` y de cualquier otra barra inversa.

| ID | Fixture o construcción | Caracteres / bytes UTF-8 |
| --- | --- | ---: |
| 1 | `probe@example.test` | 18 / 18 |
| 2 | `a.b@example.test` | 16 / 16 |
| 3 | `ab@example.test` | 15 / 15 |
| 4 | `a-b@example.test` | 16 / 16 |
| 5 | `a_b@example.test` | 16 / 16 |
| 6 | `a+b@example.test` | 16 / 16 |
| 7 | `a'b@example.test` | 16 / 16 |
| 8 | `user@xn--bcher-kva.de` | 21 / 21 |
| 9 | `a@b.co` | 6 / 6 |
| 10 | 242 letras a + `@example.com` | 254 / 254 |
| 11 | 241 letras a + `b@example.com` | 254 / 254 |
| 12 | `user@a-.example` | 15 / 15 |

Resultado offline: doce valores distintos, ASCII minúsculos, sin espacios y aceptados por un modelo JavaScript de los patrones y longitud del documento. Es comprobación de fixtures, **no ejecución de RE2, Zod ni CHECK TiDB en esta revisión**. El fixture negativo 111 tiene 243 + 12 = 255 caracteres/bytes, por encima del máximo. No se modificó ningún fixture ni la política del backend.

### SELECT de control inmediatamente después

```sql
SELECT COUNT(*) AS total FROM otakuzone_email_probe.usuarios_probe;
```

```sql
SELECT id, OCTET_LENGTH(email) AS bytes, HEX(email) AS email_hex
FROM otakuzone_email_probe.usuarios_probe
ORDER BY id;
```

Esperado: total 12, IDs 1–12; filas 10 y 11 con 254 bytes cada una. HEX se limita a **fixtures de esta tabla aislada**, no a cuentas del producto. Si el lote falla, no asumir qué quedó creado/insertado ni repetirlo sin revisar.

## 7. INSERT de duplicado exacto — ejecutar solo este caso

```sql
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (201, 'probe@example.test');
```

Esperado: error de duplicado del índice **uq_probe_email**, normalmente 1062. ID 201 es nuevo para no provocar un falso positivo de PK. Registrar código/momento real, sin inventar `code` de mysql2 a partir de la consola. En autocommit, el resultado de sentencia incluye su confirmación; este bloque no distingue un INSERT interno de un COMMIT separado.

## 8. INSERT inválidos — uno por uno, nunca como lote

Cada sentencia es una prueba independiente, **se espera error y ninguna fila nueva**. Los IDs distintos evitan confundir CHECK con PK. No usar INSERT IGNORE o cliente con --force. Tras cada resultado inesperado, detenerse; no ejecutar los casos restantes ni limpiar para ocultarlo.

```sql
-- 101: mayúsculas; mismo correo normalizado que el fixture 1.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (101, 'PROBE@example.test');
```

```sql
-- 102: espacio final significativo bajo NO PAD, prohibido por CHECK.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (102, 'probe@example.test ');
```

```sql
-- 103: espacios externos; no se aplica trim dentro de la tabla.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (103, ' probe@example.test ');
```

```sql
-- 104: dominio incompleto, sin punto/TLD.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (104, 'probe@example');
```

```sql
-- 105: puntos consecutivos.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (105, 'a..b@example.test');
```

```sql
-- 106: underscore en dominio no admitido por Zod.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (106, 'probe@exam_ple.test');
```

```sql
-- 107: apóstrofo final de parte local, posición no admitida.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (107, 'ab''@example.test');
```

```sql
-- 108: salto LF al final, expresado sin escape de barra inversa.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (108, CONCAT('probe@example.test', CHAR(10)));
```

```sql
-- 109: NUL interno.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (109, CONCAT('pro', CHAR(0), 'be@example.test'));
```

```sql
-- 110: é en UTF-8 mediante hex; no depende del teclado del editor.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (110, CONCAT('jos', CONVERT(0xC3A9 USING utf8mb4), '@example.test'));
```

```sql
-- 111: 255 caracteres; usar z para evitar colisionar con los largos válidos.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (111, CONCAT(REPEAT('z', 243), '@example.com'));
```

```sql
-- 112: cadena vacía.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (112, '');
```

```sql
-- 113: NULL, debe fallar por NOT NULL aunque CHECK tenga lógica UNKNOWN.
INSERT INTO otakuzone_email_probe.usuarios_probe (id, email)
VALUES (113, NULL);
```

Resultados esperados: 101–110 y 112 rechazados por `ck_probe_email_canonical`; 111 por longitud/tipo en modo estricto (no atribuirlo necesariamente al CHECK); 113 por NOT NULL. **Anotar el error real** y no sustituirlo por un número esperado si difiere. Cualquier fila inválida persistida invalida el ensayo. Si hay truncamiento con warning en 111, es un fallo del criterio de rechazo del input excesivo, aunque el valor truncado pudiera satisfacer CHECK.

## 9. SELECT final — integridad y comparación

### Comparación de cadenas crudas: no es prueba del UNIQUE

```sql
SELECT
  _utf8mb4'PROBE@example.test' COLLATE utf8mb4_0900_bin =
    _utf8mb4'probe@example.test' COLLATE utf8mb4_0900_bin AS case_equal,
  _utf8mb4'probe@example.test ' COLLATE utf8mb4_0900_bin =
    _utf8mb4'probe@example.test' COLLATE utf8mb4_0900_bin AS trailing_space_equal;
```

Esperado: 0 / 0. Esas diferencias las rechaza CHECK al almacenar, mientras la API puede canonicalizarlas antes. No retirar CHECK para intentar insertar ambas variantes.

### Recuento y ausencias

```sql
SELECT COUNT(*) AS total,
       COUNT(DISTINCT email) AS distinct_emails,
       MIN(id) AS first_id, MAX(id) AS last_id
FROM otakuzone_email_probe.usuarios_probe;
```

```sql
SELECT id
FROM otakuzone_email_probe.usuarios_probe
WHERE id NOT BETWEEN 1 AND 12;
```

```sql
SELECT COUNT(*) AS invalid_rows
FROM otakuzone_email_probe.usuarios_probe
WHERE email IS NULL
   OR OCTET_LENGTH(email) NOT BETWEEN 1 AND 254
   OR REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
   OR NOT REGEXP_LIKE(
     email,
     '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
     'c'
   );
```

Esperado: total=12, distinct_emails=12, first_id=1, last_id=12; segunda consulta cero filas; invalid_rows=0. Repetir también SHOW CREATE TABLE/SHOW INDEX para conservar evidencia final. La consulta de anomalías reutiliza el predicado, por lo que no es un oráculo independiente: contrastar los rechazos con el normalizador Node en una etapa posterior.

## 10. DROP — limpieza destructiva separada

Estos comandos eliminan **la tabla y el esquema completos del ensayo**. Solo ejecutarlos si se creó ese esquema en esta ejecución, no hay conexiones/transacciones de prueba abiertas y se autorizó la limpieza. Antes, comprobar contenido:

```sql
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'otakuzone_email_probe';
```

Debe contener únicamente la tabla base `usuarios_probe`, con los datos sintéticos aprobados. Si hay vistas, otras tablas u objetos/uso no previstos, detenerse. El operador debe comprobar además que no se añadieron otros objetos del esquema; no considerar una lista de tablas como inventario exhaustivo de cualquier tipo de objeto.

```sql
-- LIMPIEZA: NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA.
DROP TABLE otakuzone_email_probe.usuarios_probe;
```

```sql
-- Solo después de confirmar que el esquema quedó vacío y pertenece al ensayo.
DROP DATABASE otakuzone_email_probe;
```

Verificación posterior, SELECT independiente:

```sql
SELECT SCHEMA_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'otakuzone_email_probe';
```

Esperado: cero filas. Si falló CREATE TABLE pero se creó la base, no ejecutar DROP TABLE sobre un objeto inexistente ni continuar a ciegas: revisar el estado y autorizar la eliminación únicamente de la base vacía propia. No usar DROP contra una base real del producto, comodines ni desactivar restricciones.

## 11. Riesgos y límites de aceptación

- **Nada ejecutado:** toda cifra anterior es expectativa, no resultado TiDB. Solo se generó documentación.
- El CHECK es exactamente el candidato revisado, no una certificación nueva de equivalencia exhaustiva. Una función reconocida no prueba admisión dentro de CHECK ni enforcement.
- Se requiere evitar cambios de sesión entre verificaciones e inserciones o volver a verificar sus modos. El editor puede usar conexiones distintas; no asumir defaults comunes sin evidencia.
- DDL puede quedar parcialmente aplicado; la base no desaparece si falla la tabla. No hay limpieza automática.
- Este ensayo de una tabla no prueba FK, sesiones revocables, concurrencia de dos conexiones, rollback de usuario/sesión ni autenticación real. Esos ensayos requieren otro alcance y objetos/operaciones aprobados.
- Consumo futuro de RU/almacenamiento, errores de permisos y conversiones son posibles. No ampliar facturación, grants o variables para hacer pasar el ensayo.
- No se altera MySQL local ni SQL 001–007, manifiestos, preflight, `.env`, políticas de correo o autenticación. TiDB sigue bloqueado en el proyecto.

## 12. Autorización pendiente y cierre

Preparación finalizada. La siguiente autorización deberá identificar **CREATE DATABASE otakuzone_email_probe** y **CREATE TABLE otakuzone_email_probe.usuarios_probe** con el CHECK aquí copiado. Autorizar DDL no autoriza automáticamente los INSERT negativos/positivos ni los DROP: indicar expresamente si se incluyen DML de ensayo y limpieza, o mantenerlos pendientes.

**Tras esta revisión siguen pendientes las autorizaciones de DDL y DML.** No se ejecutó ninguna consulta, inserción, creación o limpieza. El SQL de creación se conserva porque ya coincide con los patrones aportados; se actualizó únicamente este informe para documentar la comparación literal, el SELECT de referencia y las longitudes verificadas. El funcionamiento efectivo del CHECK en tablas TiDB 8.5.3 continúa sin certificación por esta revisión.

Verificación de la preparación original: el bloque CREATE TABLE coincidía literalmente con el de 3.6.1, normalizando únicamente CRLF/LF. En aquella entrega la comparación SHA-256 de **300 archivos existentes inventariados**, incluidos entornos privados, no encontró cambios; el único añadido fue este informe. Esa comparación es evidencia histórica de la preparación, no una comprobación repetida en la presente corrección, que revisa exclusivamente este archivo. No se publican huellas privadas.

Se detiene el trabajo sin conectarse ni ejecutar SQL, crear objetos, modificar datos/configuración, desplegar o hacer commits. No se crea un archivo .sql ejecutable ni una migración; el único entregable es este informe.
