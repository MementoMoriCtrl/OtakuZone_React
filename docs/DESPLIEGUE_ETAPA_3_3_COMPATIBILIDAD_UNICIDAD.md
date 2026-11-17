# OtakuZone — Etapa 3.3: compatibilidad y unicidad del correo

Fecha de consulta y elaboración: **16 de noviembre de 2026**. Investigación documental, inspección del repositorio y comprobaciones offline. Único archivo creado en esta etapa: este informe.

## 1. Resumen ejecutivo

**ALTERNATIVA A: NO DEMOSTRADA como garantía completa entre MySQL y TiDB.** Existe una candidata técnicamente razonable: `VARCHAR(254)` con `utf8mb4_0900_bin`, NOT NULL y UNIQUE completo, almacenando exclusivamente el correo ASCII canónico. La comparación binaria permite fundamentar la igualdad de claves ya canonicalizadas; no canonicaliza entradas, no valida correos y no evita por sí sola escrituras externas incorrectas. Tampoco demuestra equivalencia universal con la collation histórica de MySQL.

Se recomienda investigar A antes de añadir una columna. **B queda como alternativa condicionada**, si A no ofrece garantía suficiente o se necesita separar presentación e identidad. Una clave binaria adicional también necesita controles de consistencia y no soluciona automáticamente el problema de los escritores externos.

Se conservaron MySQL, su índice/collation, el preflight y el catálogo TiDB bloqueado. No se abrió ninguna conexión SQL, local o remota; no se ejecutaron escrituras, migraciones, cambios de permisos, builds, despliegues ni commits. La evidencia real de MySQL citada procede de Etapa 3.2, no de una repetición en esta etapa.

Se leyeron los informes completos de [3.1](DESPLIEGUE_ETAPA_3_1_ADAPTACION_TIDB.md), [3.2](DESPLIEGUE_ETAPA_3_2_CORREO_ASCII.md), la [propuesta independiente](PROPUESTA_UNICIDAD_CORREO_MYSQL_TIDB.md), README/manifest TiDB, preflight, lector de catálogos y detector de motores. También se inspeccionaron validadores, dependencia instalada, servicio/repositorio de autenticación, transacciones, auditor y provisioning. El workspace ya tenía cambios de etapas anteriores; se preservaron. La comparación final de SHA-256 de 214 archivos existentes revisados, incluidos los entornos privados, no encontró cambios; el único archivo nuevo en ese inventario es este informe. No se publican huellas privadas. `git diff --check` terminó sin errores de whitespace; emitió advertencias de conversión LF/CRLF sobre cambios previos.

## 2. Fuentes oficiales consultadas

Todas las fuentes siguientes se consultaron el **2026-11-16**. La etiqueta `stable` mostraba documentación **v8.5**, que incluye cambios de parches posteriores a 8.5.0; no identifica la versión de una instancia Starter. No hay versión remota observada.

| Fuente y URL exacta | Versión/alcance | Evidencia y límite |
| --- | --- | --- |
| [Character Set and Collation](https://docs.pingcap.com/tidb/stable/character-set-and-collation/) | TiDB v8.5, Self-Managed | Catálogo, padding y framework; no certifica una instancia Starter |
| [TiDB Configuration File](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/) | TiDB v8.5 | Bootstrap de collations y máximo de índice; no supone acceso a configuración administrada |
| [String Types](https://docs.pingcap.com/tidb/stable/data-type-string/) | TiDB v8.5 | VARCHAR y VARBINARY; soporte de tipos, sin ensayo de datos |
| [Constraints](https://docs.pingcap.com/tidb/stable/constraints/) | TiDB v8.5 | UNIQUE, CHECK y momento de validación; requiere observar enforcement real |
| [System Variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_constraint_check_in_place_pessimistic-new-in-v630) | TiDB v8.5; variable desde 6.3.0 | Validación diferida pesimista; default dependiente de configuración |
| [CREATE INDEX](https://docs.pingcap.com/tidb/stable/sql-statement-create-index/) | TiDB v8.5 | UNIQUE normal y variantes; no extrapolar funciones de otros tiers |
| [MySQL: binary frente a _bin](https://dev.mysql.com/doc/refman/8.0/en/charset-binary-collations.html) | MySQL 8.0 | Unidad de comparación y padding; evidencia documental MySQL |
| [MySQL: BINARY y VARBINARY](https://dev.mysql.com/doc/refman/8.0/en/binary-varbinary.html) | MySQL 8.0 | Bytes, capacidad, padding y modo estricto |

Se priorizó documentación primaria. No se utiliza código fuente remoto que no pudo recuperarse como fundamento de una supuesta prueba de implementación.

## 3. Versiones y características documentadas

El catálogo publicado no incluye `utf8mb4_0900_as_ci`; esto significa **soporte no documentado**, no resultado de SHOW COLLATION remoto. Antes de 7.4, una conexión con `0900_ai_ci` podía caer en `utf8mb4_bin`; desde 7.4 se respeta aquella collation. El mínimo TiDB 7.4 del detector local no certifica todas las capacidades. [Collations TiDB](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

`new_collations_enabled_on_first_bootstrap` es true por defecto y solo actúa al inicializar el clúster. No sirve para cambiar retroactivamente su semántica. El límite de índice predeterminado documentado es 3072 bytes: 254 × 4 = 1016 bytes de capacidad de caracteres para la columna propuesta, o 254 bytes para la clave ASCII. Verificar el DDL real; no pedir ampliar límites. [Configuración TiDB](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/).

Debe observarse el framework efectivo: la documentación consulta `mysql.tidb.new_collation_enabled` mediante la fila VARIABLE_NAME correspondiente; el modo antiguo no interpreta las collations igual. Si el usuario futuro no puede leer ese metadato, se necesita evidencia equivalente verificable del proveedor, sin conceder privilegios administrativos amplios. [Framework de collations](https://docs.pingcap.com/tidb/stable/character-set-and-collation/#new-framework-for-collations).

VARCHAR mide capacidad en caracteres; VARBINARY almacena bytes de longitud variable. No confundir VARCHAR con CHAR, que tiene comportamiento de espacios distinto. [Tipos TiDB](https://docs.pingcap.com/tidb/stable/data-type-string/).

UNIQUE protege valores no NULL; mantener NOT NULL. CHECK tiene una bandera de habilitación y exige enforcement real. La documentación advierte que algunas formas de añadir CHECK junto con una columna pueden ignorarlo; inspeccionar metadatos y hacer pruebas negativas, no confiar solo en un DDL sin error. [Restricciones TiDB](https://docs.pingcap.com/tidb/stable/constraints/).

No se necesitan índices parciales, de expresión, globales o multivaluados: un UNIQUE normal sobre toda la columna evita depender de extensiones y tiers distintos. No usar un prefijo, que arbitraría una clave diferente. [CREATE INDEX](https://docs.pingcap.com/tidb/stable/sql-statement-create-index/).

## 4. Contrato real de correo ASCII

El código vigente en `backend/src/domain/emailPolicy.js` comprueba string y ASCII **antes** de trim/toLowerCase. `backend/src/validators/email.js` aplica después máximo 254 y `.email()` de Zod. La versión instalada es **Zod 4.6.7**; se leyó su `v4/core/regexes.js`. El patrón efectivo es:

```javascript
/^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
```

Parte local: letras/dígitos, `_`, apóstrofo, `+`, `-` y puntos separadores; no empieza/termina con punto ni admite puntos consecutivos. El apóstrofo final no pasa. Dominio: etiquetas que comienzan con alfanumérico, admiten guiones y terminan antes de un punto; TLD de letras, mínimo dos. El patrón permite guion al final de una etiqueta y no impone por separado los límites 64 de parte local o 63 de etiqueta. **No se endurece el contrato en este informe.** Aceptación de Zod no garantiza entregabilidad ni conformidad exhaustiva con RFC/DNS.

Se ejecutó offline el validador real para 26 entradas y un barrido de los 95 caracteres ASCII imprimibles en la posición `a<carácter>b@example.com`. Los caracteres aceptados en esa posición fueron letras/dígitos y `' + - . _` sin el espacio separador. Esto complementa la lectura del patrón; no generaliza esa posición a cualquier posición del correo.

Se confirmaron offline: espacios ASCII externos y TAB/CR/LF externos se eliminan; espacios internos fallan; NBSP original, acentos y ancho completo fallan antes de normalizar. Punycode ya escrito en ASCII se admite según formato, sin comprobar su decodificación IDNA. No se convierte Unicode a punycode.

Para entradas válidas, `c(x)=trim(x).toLowerCase()` y la identidad deseada es igualdad exacta de sus bytes ASCII. Cadena original, cadena canónica, comparación lingüística e igualdad binaria son conceptos separados. Por ejemplo, `USER@example.com` y `user@example.com` son originales diferentes y claves iguales; `a.b@example.com` y `ab@example.com` son claves distintas. No se eliminan puntos ni etiquetas `+` según proveedor de correo.

Servicio y repositorio usan `normalizeEmail` en registro/búsqueda/login. `withTransaction` espera COMMIT antes de devolver éxito; el servicio traduce `ER_DUP_ENTRY` a 409 incluso si procede del commit. Una discrepancia de códigos del driver deberá probarse en TiDB; no se certifica toda clasificación de conflictos remotos.

## 5. Matriz comparativa de collations

| Collation | Soporte TiDB publicado | Case/acentos | Espacio final | Evaluación |
| --- | --- | --- | --- | --- |
| `utf8mb4_0900_as_ci` | No listada | Histórica MySQL: case insensible, acentos sensibles | NO PAD en auditoría MySQL | Conservar en MySQL |
| `utf8mb4_0900_ai_ci` | Sí | Insensible a ambos | NO PAD | No adoptada |
| `utf8mb4_0900_bin` | Sí | Binaria | NO PAD | Candidata A |
| `utf8mb4_bin` | Sí | Binaria | PAD SPACE | Otra semántica de espacios |
| `utf8mb4_general_ci` | Sí | Insensible a ambos | PAD SPACE | No demuestra contrato exacto |
| `utf8mb4_unicode_ci` | Sí | Insensible a ambos | PAD SPACE | No demuestra contrato exacto |

Datos TiDB: [catálogo oficial](https://docs.pingcap.com/tidb/stable/character-set-and-collation/). La fila histórica procede del informe local 3.2.

Una collation `_bin` sobre texto compara valores de caracteres; no convierte el tipo en VARBINARY. Para ASCII en UTF-8 cada carácter tiene un único byte: comparación numérica sin padding permite deducir igualdad exacta de claves canónicas. NO PAD hace significativo el espacio final; PAD SPACE lo ignora en comparaciones de texto. [Distinción documentada por MySQL](https://dev.mysql.com/doc/refman/8.0/en/charset-binary-collations.html).

**Deducción condicionada:** si la instancia aplica la semántica binaria NO PAD documentada, dos claves ASCII canónicas distintas no deben colisionar por punto, guion, `_`, apóstrofo o `+`. No es una prueba ejecutada de su índice TiDB. La candidata distingue mayúsculas crudas: el case-insensitivity se consigue almacenando minúsculas, no mediante esa collation. Para valores canónicos válidos no hay espacios finales que deban ignorarse.

No se deduce equivalencia total de MySQL as_ci y TiDB binaria a partir de esta observación. Tampoco se descartan collations lingüísticas por su nombre solamente: no se obtuvo una prueba exhaustiva de sus equivalencias sobre todo el dominio aceptado, por lo que no son la candidata preferida.

## 6. Evaluación de alternativa A

Diseño a evaluar, **no autorizado ni implementado**: mantener una sola columna canónica y UNIQUE completo; MySQL histórico permanece igual, mientras un futuro esquema TiDB podría declarar explícitamente `utf8mb4_0900_bin` si se aprueba el contrato y sus controles.

| Pregunta | Respuesta técnica |
| --- | --- |
| ¿Basta cambiar la collation? | No. El esquema actual no exige email canónico y el preflight exige la collation histórica |
| ¿Puntuación crea colisiones binarias? | La semántica candidata no debe introducirlas entre claves ASCII distintas; verificar índice real |
| ¿Qué ocurre con espacios? | La API los recorta externamente. La candidata distingue cadenas crudas con espacios finales, que no deberían almacenarse |
| ¿Qué ocurre con SQL externo? | Podría insertar mayúsculas, espacios o Unicode si no existe una barrera adicional. El UNIQUE binario no los rechaza por contrato |
| ¿Qué protege la concurrencia? | El UNIQUE del motor, con éxito confirmado tras commit; nunca un SELECT previo como única defensa |
| ¿Está probada equivalencia con MySQL? | No para todo el dominio. La matriz finita y el snapshot de una cuenta son evidencia limitada |

TiDB documenta comprobación estricta de UNIQUE al commit en modo optimista y comprobación habitual por sentencia en pesimista. Esto permite arbitrar duplicados confirmados, pero no garantiza idéntico momento de error. [UNIQUE y transacciones](https://docs.pingcap.com/tidb/stable/constraints/#unique-key).

La variable de sesión `tidb_constraint_check_in_place_pessimistic`, desde 6.3.0, tiene default ON condicionado a la configuración del servidor. OFF puede diferir el fallo y producir conflicto o error 8147 además de duplicado. El preflight actual exige pesimista, pero no observa esa variable: registrar esta brecha para una revisión posterior, sin cambiarla ahora. [Variables TiDB](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_constraint_check_in_place_pessimistic-new-in-v630).

A solo se aceptaría después de: versión/framework/collation reales; controles efectivos de almacenamiento canónico; auditoría del dataset a trasladar; igualdad y UNIQUE completos; dos conexiones concurrentes y commit; lookup/login sobre claves canonicalizadas; tratamiento de errores reales. Una cuenta local sin anomalías no sustituye estas pruebas.

## 7. Evaluación de alternativa B

**Opción condicionada: clave `VARBINARY(254)` NOT NULL con UNIQUE completo**, separada de email. Capacidad propuesta: máximo 254 caracteres ASCII canónicos = 254 bytes; no hace falta un hash ni una longitud fija. TiDB documenta VARBINARY y su relación con VARCHAR como secuencia de bytes. [Tipos TiDB](https://docs.pingcap.com/tidb/stable/data-type-string/).

MySQL documenta igualdad por bytes, sin padding al insertar VARBINARY y sin retirar bytes al recuperar. Espacios y NUL son significativos. BINARY fijo rellena con NUL; no se propone. El modo estricto debe impedir truncamiento silencioso por exceso de capacidad. [BINARY/VARBINARY MySQL](https://dev.mysql.com/doc/refman/8.0/en/binary-varbinary.html).

El tipo ofrece una representación explícita, pero el proyecto tendría que garantizar que la clave es exactamente c(email). Escribir ambos campos en una transacción evita cambios parciales de esa operación; **no demuestra que sus valores concuerden**, ni impide que otro escritor los desincronice. Habría que diseñar generación o restricciones de consistencia compatibles y probarlas; no se declara portable una expresión SQL todavía no estudiada.

Registro escribiría email y clave coherentes; búsqueda/login usarían la clave obtenida por el mismo validador, con bytes UTF-8/ASCII explícitos al enlazar parámetros mysql2. No convertiría datos con `.toString()` de encoding ambiguo. Revisar DTO, errores de duplicado, transacciones y cualquier escritor operativo. Nunca persistir hashes truncados en lugar de igualdad exacta.

Revisar grants por columna para INSERT/lectura de la clave, sin ampliar UPDATE de email, rol o password_hash. La credencial runtime seguiría sin DDL ni administración. La disponibilidad real de los grants requeridos en Starter permanece pendiente; un archivo local de GRANT no prueba sus permisos efectivos remotos.

Un backfill futuro necesitaría auditoría agregada, detección de conflictos, copia/restauración y transición controlada. No sobrescribir ni fusionar usuarios. Registrar lotes/progreso verificables; una clave temporal NULL no ofrece la garantía final. Si falla a mitad, detener el cambio de lectores, inspeccionar filas sin clave y divergentes, reanudar solo con plan aprobado y controles de concurrencia. No declarar completado el ledger para ocultar un DDL/DML parcial. El plan dependerá del dataset y del catálogo nuevo, no se ejecuta aquí.

B es más explícita para separar presentación e identidad; cuesta otra columna, índice y sincronización. **No está demostrada como necesaria ni aprobada para MySQL o TiDB.**

## 8. Matriz de pruebas reproducibles

### Convenciones y resultados esperados

Todos los correos son fixtures. `e=example.com`; `L(n)` son n letras `a` consecutivas; las notaciones se expanden antes de probar. `\t`, `\r`, `\n` representan controles reales, `\uXXXX` el carácter indicado. Una clave «—» no existe porque falla validación. «Duplicado» significa que la segunda inserción canónica no puede confirmarse; «dos» significa que dos claves válidas distintas pueden coexistir. Son expectativas del contrato, **no resultados de INSERT ejecutados**.

Motor **M/T** en todas las filas: MySQL 8.0.46 y futura versión TiDB identificada. La fase de aplicación se ejecuta offline; comparación SELECT y UNIQUE de motor son fases diferentes.

| ID | Original x / original y | c(x) / c(y) | Acepta x/y | Claves iguales | UNIQUE esperado | Motor |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | `USER@EXAMPLE.COM` / `user@example.com` | `user@e` / `user@e` | Sí/Sí | Sí | Duplicado | M/T |
| 02 | `user@example.com` / mismo literal | `user@e` / `user@e` | Sí/Sí | Sí | Duplicado | M/T |
| 03 | `a.b@example.com` / `ab@example.com` | `a.b@e` / `ab@e` | Sí/Sí | No | Dos | M/T |
| 04 | `a-b@example.com` / `ab@example.com` | `a-b@e` / `ab@e` | Sí/Sí | No | Dos | M/T |
| 05 | `a+b@example.com` / `ab@example.com` | `a+b@e` / `ab@e` | Sí/Sí | No | Dos | M/T |
| 06 | `a_b@example.com` / `ab@example.com` | `a_b@e` / `ab@e` | Sí/Sí | No | Dos | M/T |
| 07 | `a'b@example.com` / `ab@example.com` | `a'b@e` / `ab@e` | Sí/Sí | No | Dos | M/T |
| 08 | `ab'@example.com` / `ab@example.com` | — / `ab@e` | No/Sí | N/A | x no llega a SQL | M/T |
| 09 | `a!b@example.com` / `ab@example.com` | — / `ab@e` | No/Sí | N/A | x no llega a SQL | M/T |
| 10 | `user@example.com ` / `user@example.com` | `user@e` / `user@e` | Sí/Sí | Sí | Duplicado | M/T |
| 11 | ` USER@EXAMPLE.COM ` / `user@example.com` | `user@e` / `user@e` | Sí/Sí | Sí | Duplicado | M/T |
| 12 | `\tUSER@example.com\r\n` / `user@example.com` | `user@e` / `user@e` | Sí/Sí | Sí | Duplicado | M/T |
| 13 | `user name@example.com` / `user@example.com` | — / `user@e` | No/Sí | N/A | x no llega a SQL | M/T |
| 14 | `USER@XN--BCHER-KVA.DE` / `user@xn--bcher-kva.de` | `user@xn--bcher-kva.de` / igual | Sí/Sí | Sí | Duplicado | M/T |
| 15 | `user@xn--bcher-kva.de` / `user@xn--bcher-2pa.de` | Originales | Sí/Sí | No | Dos | M/T |
| 16 | `user@a-b.example` / `user@ab.example` | Originales | Sí/Sí | No | Dos | M/T |
| 17 | `user@a_b.example` / `user@ab.example` | — / `user@ab.example` | No/Sí | N/A | x no llega a SQL | M/T |
| 18 | `user@a-.example` / mismo literal | Originales | Sí/Sí | Sí | Duplicado; formato hoy admitido | M/T |
| 19 | `L(242)@example.com` / mismo literal | Originales, 254 bytes | Sí/Sí | Sí | Duplicado | M/T |
| 20 | `L(242)@example.com` / `L(241)b@example.com` | Originales, ambos 254 | Sí/Sí | No | Dos; detecta índice por prefijo | M/T |
| 21 | `L(243)@example.com` / `L(242)@example.com` | — / y | No/Sí | N/A | x no llega a SQL, 255 > 254 | M/T |
| 22 | `L(65)@example.com` / mismo literal | Originales | Sí/Sí | Sí | Duplicado; sin límite local 64 | M/T |
| 23 | `user@L(64).com` / mismo literal expandido | Originales | Sí/Sí | Sí | Duplicado; sin límite etiqueta 63 | M/T |
| 24 | `jos\u00e9@example.com` / `jose@example.com` | — / `jose@e` | No/Sí | N/A | x no llega a SQL | M/T |
| 25 | `\u00a0user@example.com` / `user@example.com` | — / `user@e` | No/Sí | N/A | x se rechaza antes de trim | M/T |
| 26 | `\uff55ser@example.com` / `user@example.com` | — / `user@e` | No/Sí | N/A | x no llega a SQL | M/T |

### Reproducción y alcance de ejecución

Para reproducir la fase offline desde raíz, importar `normalizeEmail` de `./backend/src/validators/email.js`, expandir los fixtures y aplicar este evaluador; no adquiere conexiones:

```javascript
const validate = value => {
  try { return { accepted: true, canonical: normalizeEmail(value) } }
  catch { return { accepted: false, canonical: null } }
}
const compare = (x, y) => {
  const a = validate(x), b = validate(y)
  return { a, b, equal: a.accepted && b.accepted
    ? Buffer.from(a.canonical, 'utf8').equals(Buffer.from(b.canonical, 'utf8'))
    : null }
}
// Longitudes: 'a'.repeat(242) + '@example.com';
// Unicode: '\u00a0user@example.com', evitando pérdidas de encoding del shell.
```

Se comprobaron ahora 26 entradas individuales y el barrido de caracteres descrito en §4. La matriz completa por pares y sus pruebas de motor son un **diseño**, no una suite añadida ni ejecutada íntegramente. En particular, el par 20 y las inserciones concurrentes siguen pendientes.

Para una fase SELECT autorizada posterior, ejecutar la misma consulta parametrizada por cada par, tanto original como canónico, con collations explícitas disponibles. Ejemplo de lectura, **no ejecutado aquí**:

```sql
SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_bin
     = CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_bin AS iguales;
```

Registrar motor/versión/framework, collation de columna, conexión y resultado. Comparar también bytes explícitos. No reemplazar la collation de la columna de aplicación ni interpretar igualdad de literales como prueba de UNIQUE. Probar cadenas crudas rechazadas solo como fixtures de comparación, nunca insertarlas en la base real.

Con autorización futura de escritura **en esquemas nuevos aislados**, preparar el UNIQUE completo de cada alternativa y comprobar todos los pares válidos: insertar primero x canónico y luego y; esperar commit; verificar recuento final; registrar códigos de error. Dos sesiones simultáneas deben intentar la misma clave y luego claves diferentes: una sola confirmación para la misma, dos para distintas. Probar rollback, error diferido de commit, usuario+sesión atómicos y login con variantes. Aprobar antes creación, datos, limpieza y recuperación; no usar MySQL local como laboratorio de escrituras.

### Separación de evidencias

| Evidencia | Qué existe | Qué NO demuestra |
| --- | --- | --- |
| MySQL real, Etapa 3.2 | 8.0.46; una cuenta sin anomalías; VARCHAR(254), as_ci NO PAD, UNIQUE completo; siete checksums coincidentes | Todos los correos posibles, datos futuros o concurrencia real |
| SELECT MySQL previo | Case y punycode equivalente; punto/plus distintos; espacios crudos distintos; ancho completo igual bajo as_ci pero rechazado por API; acento distinto | Efectividad de un nuevo UNIQUE ni semántica TiDB |
| Offline, Etapa 3.3 | Validador instalado: 26 entradas y 95 caracteres de posición interior; inspección del patrón y de rutas de datos | Comparación/índices de ningún servidor |
| Documentación TiDB | Candidata binaria, tipos, UNIQUE, variables y condiciones versionadas | Configuración ni permisos de Starter real |
| TiDB remoto | Ninguna conexión ni instancia observada | Todo resultado remoto permanece pendiente |
| Escritura aislada/concurrencia | Procedimiento diseñado, sin ejecución en ambos motores | No existe certificado de atomicidad funcional del proyecto |

Lint, 23 pruebas frontend, 66 backend, build local y smoke constan aprobados **en Etapa 3.2**. No se volvieron a ejecutar ni se presentan como validaciones de 3.3; aquí solo se añade documentación y se ejercita el validador sin SQL.

## 9. Estrategia para controlar escrituras externas

El schema histórico no contiene una restricción que haga cumplir todo el contrato de email. Los grants revisados limitan UPDATE, pero permiten INSERT de email porque registro lo necesita. Quien tenga esa credencial puede enviar un INSERT directo sin pasar por JavaScript. No se comprobó SHOW GRANTS real en esta etapa.

| Mecanismo a evaluar | Garantía y límite |
| --- | --- |
| Backend como único escritor habitual | Centraliza el validador real. Requiere custodia de credenciales y que importadores/operadores no usen runtime para bypass |
| Permisos mínimos y separación de identidades | Restringir DDL, cambios de email/rol y administración; operadores de lectura sin INSERT. No impide datos incorrectos si una identidad sí tiene INSERT |
| Restricciones de esquema | Rechazar valores no ASCII, no canónicos, fuera de longitud/formato; exige expresiones portables, comparación binaria y pruebas negativas de enforcement |
| Validación transaccional | Mantiene unidad de usuario/sesión o email/clave; no convierte una preconsulta en UNIQUE ni valida escritores que no usen ese procedimiento |
| Clave binaria B | Define igualdad de clave; requiere sincronización y no valida por sí sola email |
| Acceso de mantenimiento excepcional | Procedimiento revisado con el mismo contrato, auditoría posterior y privilegios temporales. Un administrador con DDL puede retirar garantías; no prometer resistencia absoluta frente a él |

Diseño recomendado para evaluar: rechazar almacenamiento no canónico en la base, manteniendo canonicalización en la aplicación. No hacer LOWER/TRIM silencioso de SQL externo. El TRIM SQL predeterminado no reproduce todos los controles externos que recorta JavaScript; una comparación con collation case-insensitive puede dejar pasar mayúsculas. Tampoco basta igualdad de longitud de caracteres/bytes para probar ASCII: existen caracteres multibyte en otros encodings y deben definirse encoding y predicado exactos. Se necesita una especificación explícita y probada, no un CHECK aproximado declarado equivalente a Zod.

Antes de aprobar cualquier expresión futura: enumerar clases admitidas, posiciones, límites y controles; probar rechazos directos SQL; comprobar que las restricciones no se ignoran y que las sesiones runtime no las desactivan. No implementar triggers ni cambiar grants en esta etapa. Mantener separado al migrador, sin sus credenciales en el servidor público.

## 10. Riesgos y limitaciones

- No existe versión, framework, collation, padding, CHECK, grants o comportamiento UNIQUE observado en TiDB Starter. La documentación Self-Managed no concede control administrativo sobre Starter.
- La candidata binaria exige revisar expresamente el contrato de comparación del destino. El preflight actual seguirá rechazándola; no se elimina esa protección para ensayar runtime.
- Se conserva la collation MySQL histórica. No se ha probado que dos claves canónicas diferentes nunca colisionen bajo ella para todo el dominio permitido; la muestra previa no es una demostración exhaustiva.
- Un dato introducido fuera de la API puede vulnerar canonicalización sin violar el UNIQUE actual o futuro. El estado de una cuenta en 3.2 no garantiza un snapshot posterior.
- Zod admite formatos observados con límites de etiqueta/parte local poco estrictos. Cambiar esa política o actualizar la dependencia exigiría revisar la matriz y la identidad de cuentas.
- Deben probarse errores en sentencia/commit, desconexión con resultado incierto, rollback y ausencia de sesiones huérfanas. No añadir reintentos ciegos a registro o transacciones.
- B puede dejar email y clave divergentes; un índice adicional no elimina esa obligación. Un backfill requiere una etapa distinta y recuperación aprobada.
- Los catálogos y hashes existentes no autorizan copiar SQL MySQL cambiando una collation. Un catálogo TiDB futuro necesita identidad, SQL/hashes reales y procedencia; 001–007 permanecen intactos.

## 11. Dictamen técnico

**ALTERNATIVA A: NO DEMOSTRADO.** La candidata `utf8mb4_0900_bin` tiene fundamento documental para igualdad exacta sobre ASCII canónico y evita justificar una columna extra preventivamente. Falta la garantía completa: control de escritores, equivalencia necesaria frente al MySQL conservado, observación de Starter y pruebas reales de UNIQUE/concurrencia.

**ALTERNATIVA B: RECOMENDADA SI A NO OFRECE GARANTÍA SUFICIENTE**, especialmente si se necesita conservar un email presentado separado de la identidad. No se implementa ni se declara necesaria hoy; también requiere consistencia, permisos y pruebas de motor.

**TiDB NO APROBADO.** El manifest conserva `status=blocked`, cero migraciones y ledger propio reservado; `tidbPreflight.js` exige `utf8mb4_0900_as_ci` y mantiene el bloqueo final de runtime. No se alteraron detector, SQL, historial, esquema, datos ni secretos.

## 12. Recomendación para la siguiente etapa

1. Revisar este dictamen y autorizar el alcance siguiente. Mantener MySQL actual y priorizar la investigación de A; no crear B por precaución.
2. Diseñar, todavía sin ejecutarlas, restricciones de almacenamiento canónico y pruebas de equivalencia para ambos motores. Definir el límite de confianza de operadores y el tratamiento de datos históricos. Si A falla ese diseño, presentar B con sincronización y recuperación concretas para aprobación.
3. Solo con autorización separada, disponer de una instancia Starter gratuita y observarla por conexión TLS de solo lectura: identidad/versión, SHOW COLLATION/padding, framework, modos, variables de restricciones, configuración transaccional y permisos. Si el preflight vigente falla por la collation, registrar el fallo; no saltarlo ni usar migrador para descubrir capacidades.
4. Con evidencia real y aprobación del contrato, proponer SQL/catálogo TiDB propios y revisión explícita de preflight. No editar hashes históricos ni aprobar únicamente un nombre de collation.
5. Solicitar después autorización de escritura en bases de ensayo aisladas, con plan de limpieza/recuperación, para ejecutar la matriz y concurrencia. Solo sus resultados permitirían reconsiderar el dictamen operativo.

La etapa termina con este informe. No se crean servicios, no se conecta a TiDB y no se avanza a migraciones, Render o Vercel.
