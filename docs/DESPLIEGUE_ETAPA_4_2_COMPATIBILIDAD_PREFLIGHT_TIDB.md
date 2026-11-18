# OtakuZone — Etapa 4.2: compatibilidad local del preflight TiDB

Fecha: **17 de noviembre de 2026**. Implementación y pruebas locales. **Sin conexión a TiDB/MySQL, SQL contra servidores, migraciones ni recuperación.** No se certifica la instancia ni se declara lista la recuperación de 006.

## 1. Auditoría anterior y causa exacta

`tidbPreflight.js`, fase runtime, ejecutaba esta lectura después de comprobar email/UNIQUE y antes de comprobar su CHECK canónico y el ledger:

```text
SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type, ENFORCED AS enforced
FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?
```

Pretendía verificar existencia y enforcement de cada CHECK/FK del catálogo mediante `enforced === 'YES'`. La instancia, según evidencia histórica del usuario, respondió Unknown column para ENFORCED; esa columna no existe en la definición pública de TABLE_CONSTRAINTS v8.5.3. [Metadatos v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/infoschema/tables.go).

El error del driver caía en el catch genérico del preflight y bloqueaba con «no se pudieron consultar variables/metadatos de solo lectura». **No aprobaba la conexión por error.** Bootstrap no ejecutaba esa rama, por lo que no explica el fallo original de 006.

Se encontró otra consulta equivalente en `schemaCheck.js`, compartida anteriormente por MySQL y TiDB. Cambiar solo el primer preflight habría dejado ese segundo bloqueo. Ambas rutas TiDB se adaptan; la lectura ENFORCED legítima de la rama MySQL se conserva.

El sistema ya fijaba una conexión en checkDatabaseConnection y validaba las sesiones TiDB del pool al adquirirlas. Sin embargo, schemaCheck realizaba sus siguientes consultas sobre el pool tras liberar la conexión inspeccionada. Ahora mantiene una única adquisición durante su comprobación completa.

## 2. Fuentes compatibles y política de declaración

El nuevo módulo `tidbRuntimeIntegrity.js` obtiene **39 definiciones esperadas: 21 CHECK y 18 FK**, leyendo SQL del catálogo local cuyos hashes/procedencia valida el lector existente. Extrae definición y tabla de cada restricción y contrasta su inventario con expectedIntegrityConstraints. No ejecuta esas fuentes SQL.

| Fuente de lectura futura | Finalidad y alcance |
| --- | --- |
| CONNECTION_ID(), VERSION(), DATABASE() | Identidad de sesión y destino al principio y al final |
| TIDB_VERSION() y tidb_txn_mode de sesión | Corroboración de versión/motor mediante el detector existente |
| SHOW GLOBAL VARIABLES | tidb_enable_check_constraint y tidb_enable_foreign_key, con sus valores observados y ámbito global |
| SHOW SESSION VARIABLES | foreign_key_checks, UTC, modos estrictos, modo pesimista, comprobación UNIQUE inmediata y autocommit, sobre la misma conexión |
| TABLE_CONSTRAINTS sin ENFORCED | Nombre, tipo y tabla; contraste de identidad y existencia FK; detección de duplicados, restricciones inesperadas y contradicciones |
| KEY_COLUMN_USAGE + REFERENTIAL_CONSTRAINTS | Columnas ordenadas, esquema/tabla/columna referenciados y reglas de cada FK |
| SHOW CREATE TABLE de cada tabla afectada | Definición completa, nombres y marcadores declarativos CHECK/FK; comparación con el catálogo |
| SHOW COLLATION, COLUMNS y SHOW INDEX | Se mantienen collation/NO PAD, VARCHAR(254) NOT NULL y UNIQUE completo de email |
| schema_migrations_tidb | Se conservan validación de hashes, estados y catálogo completo |

No se consulta mysql.tidb ni se requieren permisos administrativos adicionales por diseño. Si la cuenta no puede consultar una fuente obligatoria, la compatibilidad no se aprueba. La etapa no presupone que la identidad elegida tenga esos permisos.

### CHECK

Una definición CHECK completa se compara con la del catálogo, conservando literales y agrupación. NOT ENFORCED bloquea. La ausencia de ese marcador solo se interpreta para la representación y versión reconocidas, con definición íntegra y coincidente; no se deduce de una fila que solo tenga el nombre.

Algunas vistas de la instancia omiten CHECK, según la evidencia previa. Por ello una ausencia de fila CHECK en TABLE_CONSTRAINTS **no se convierte ni en ausencia de la restricción ni en enforcement positivo**. La fuente obligatoria individual es SHOW CREATE completo y verificado. Si esa fuente falta, está truncada, contiene una definición diferente o no es interpretable, se bloquea.

La consulta separada a CHECK_CONSTRAINTS para email deja de ser necesaria: su predicado aprobado ahora se compara dentro de la definición completa, junto con todos los demás CHECK. No se elimina la exigencia del CHECK canónico ni se sustituye por la variable global.

### FOREIGN KEY

Se exige definición SHOW CREATE válida y coincidente, presencia en TABLE_CONSTRAINTS y correspondencia completa en las vistas de FK. FOREIGN KEY INVALID bloquea. Las referencias y reglas por sí solas no prueban comportamiento funcional.

El formateador público v8.5.3 puede omitir el esquema cuando es el de la tabla y omitir acciones por defecto. En el modo runtime se resuelve esa referencia solo dentro del destino verificado y se conserva la equivalencia RESTRICT/NO ACTION/default. Se contrasta además el destino cualificado observado en las vistas FK: no se acepta una referencia distinta por normalización. [SHOW v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/executor/show.go).

El mismo código público emite el comentario de PK clustered. Se admite únicamente ese comentario reconocido, en su posición y modo runtime, sin ignorar comentarios arbitrarios que puedan ocultar restricciones. Los demás marcadores y comentarios no soportados siguen causando bloqueo.

No se propone una columna ENFORCED ficticia ni una constante YES. Las restricciones adicionales no contempladas por el catálogo tampoco se adoptan silenciosamente, aunque la vista omita sus filas CHECK.

## 3. Global, sesión y procedencia

El preflight verifica los controles globales y de sesión por lecturas separadas. foreign_key_checks global nunca sustituye al valor de sesión. Los registros de configuración conservan nombre/valor, source, scope, engineVersion, connectionId, capturedAt e integrity=`live-query-unattested`.

capturedAt se genera durante la ejecución de la lectura como instante del lote; no se añade a los snapshots históricos ni se presenta como fecha exacta de una captura antigua. La identidad contiene el banner observado y el resultado TIDB_VERSION. Cada restricción incluye fuente, tabla/tipo/nombre, hash del SHOW completo, referencia/checksum de la migración y regla `tidb-8.5.3-runtime-markers-v1`.

La implementación reutiliza el análisis puro de markers-v2, separándolo de la validación de procedencia manual del planificador. **No fabrica captureId/sessionId ni una declaración reviewed-serverless para pasar un contrato offline.** La versión se corrobora con lecturas de la conexión real cuando se use el código en un alcance autorizado. Eso no certifica que todo el binario administrado coincida con el tag público.

El resultado diferencia:

- declarative=true únicamente tras verificar definición y marcadores;
- configuration=true para las restricciones solo dentro de un preflight que ya comprobó sus controles globales y de sesión;
- functional=`unknown`, sin emitir pruebas funcionales ni aprovechar el ensayo previo de otra tabla.

`runtimeApproved` conserva su significado de aprobación de **los controles del preflight en esa observación**, no certificado funcional ni autorización de migración. Las tres banderas de recuperación no se modifican. Bootstrap sigue devolviendo runtimeApproved=false y no adopta un esquema vacío como listo.

## 4. Misma conexión, contradicciones y errores

preflightTidb acepta una conexión dedicada o adquiere exactamente una del pool, liberándola también ante rechazo. checkDatabaseConnection ya fijaba la conexión; devuelve ahora el informe como `result.preflight`. No hay caché de aprobación ni reutilización automática entre conexiones.

schemaCheck mantiene su propia adquisición durante todo el proceso y usa el informe de la verificación realizada **en esa misma conexión** para la ruta TiDB. Conserva sus controles de tablas InnoDB, importes DECIMAL, conteos de restricciones y versiones. MySQL mantiene su política de ENFORCED y su configuración anterior.

Antes de devolver aprobación se repiten identidad y controles. Un cambio de conexión/destino/versión, variación de variables, duplicado o contradicción bloquea. La comparación de variables no depende del orden de filas. No se elige la lectura más favorable.

Los errores de lectura de fuentes obligatorias se identifican con dimension/reason/source y mensaje redactado; por ejemplo `declarative/metadata-query-unavailable`. Una consulta fallida no se transforma en evidencia positiva. Definiciones faltantes, inválidas o desconocidas y metadatos contradictorios tienen motivos distintos. Se conservan rechazos explícitos de los controles no habilitados. No se imprimen mensajes privados, SQL con parámetros, contraseñas o datos de usuario del driver.

La opción previa expectedConstraints no sustituye al catálogo: pasar una lista vacía ya no permite omitir su inventario. No hay variable de entorno ni excepción que desactive estas guardias.

## 5. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `backend/src/db/tidbPreflight.js` | Identidad, controles separados, verificación compatible y resultado de evidencia |
| `backend/src/db/tidbRuntimeIntegrity.js` | Nuevo lector del contrato y verificador de metadatos, con errores clasificados |
| `backend/src/db/tidbEnforcementEvidence.js` | Extrae funciones puras compartidas; lector de restricciones del catálogo y modo declarativo runtime |
| `backend/src/db/pool.js` | Expone motor configurado y devuelve informe de preflight de su conexión inspeccionada |
| `backend/src/db/schemaCheck.js` | Misma adquisición durante el chequeo; rama TiDB usa evidencia compatible; MySQL conserva ENFORCED |
| `backend/tests/helpers/tidbPreflightFixture.js` | Nuevo doble sin columna ENFORCED y con DDL/reglas/controles simulados |
| `backend/tests/tidb-preflight.test.js` | Conserva cinco escenarios existentes usando el nuevo doble |
| `backend/tests/tidb-preflight-compatibility.test.js` | 23 pruebas nuevas, con guardia de red y cero intentos de conexión |
| Este informe | Auditoría, decisiones, resultados y límites |

No se modifican contrato tipado, adaptador v3, planificador de recuperación, snapshots, migrador, SQL, manifests, auth/JWT/cookies/CSRF, .env, certificados o credenciales. Los cambios preexistentes del workspace no se atribuyen a esta etapa.

## 6. Matriz de escenarios probados

| Escenario | Resultado esperado y obtenido con fixtures |
| --- | --- |
| Servidor sin ENFORCED, CHECK/FK completos y controles ON | Aprueba controles runtime; verifica 21 CHECK/18 FK; functional unknown |
| Vista sin filas CHECK pero SHOW íntegro y coincidente | Verificación individual mediante SHOW; no se asume enforcement por ausencia de columna |
| CHECK global OFF o desconocido | Bloquea |
| FK global OFF | Bloquea |
| FK global ON y sesión OFF/desconocida | Bloquea; no sustituye ámbitos |
| CHECK ausente en DDL | Bloquea |
| CHECK NOT ENFORCED | Bloquea |
| FK FOREIGN KEY INVALID | Bloquea |
| FK con referencias/reglas contradictorias | Bloquea |
| DDL truncado, formato o versión no interpretados | Bloquea |
| Filas duplicadas, controles contradictorios o cambio durante la revisión | Bloquea |
| SHOW/vistas obligatorias no accesibles | Bloquea con dimensión/motivo y sin filtrar detalle privado |
| Dos conexiones con controles distintos | La primera no acredita la segunda; la conexión con FK OFF falla |
| Identidad de conexión distinta al final | Bloquea aunque sus controles coincidan |
| Lista esperada vacía inyectada | No evita la comprobación del catálogo |
| Restricción extra en SHOW no recogida por la vista | Bloquea; no se adopta |
| FK con omisión del esquema propio/acciones por defecto | Acepta representación equivalente, manteniendo contraste de destino y reglas de metadatos |
| schemaCheck TiDB | Usa una adquisición, conserva controles y no consulta ENFORCED |

Se conservan además las regresiones de collation/email/UNIQUE y ledger, configuración, pool, identidad de motor, atributos v3 y recuperación offline. Un historial 006 applying sigue impidiendo aprobar runtime; no se ejecutó 007 para modificar esa situación.

## 7. Pruebas y lint ejecutados

```text
node --test backend/tests/tidb-preflight-compatibility.test.js backend/tests/tidb-column-attributes.test.js backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js backend/tests/tidb-engine.test.js backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js
```

**199/199 aprobadas**, sin fallidas, omitidas o canceladas: 171 del lote relacionado previo, cinco pruebas existentes de motor añadidas a esta ejecución y 23 nuevas de compatibilidad.

`npm run lint`: **aprobado sin advertencias en la ejecución final**. Se corrigieron advertencias iniciales de imports/variable no usados y escapes innecesarios del fixture. No se instalaron dependencias ni se ejecutó build frontend.

Las pruebas se ejecutaron con autorización fuera del sandbox para el runner. Solo dobles/fixtures y los HTTP locales de regresión. La suite nueva bloquea Socket.connect antes de red y verifica cero intentos; incluso su pool mysql2 de prueba sustituye la adquisición por el doble antes de usarlo. Ningún SQL llegó a un servidor. Los planes de recuperación calculados pertenecen únicamente a fixtures sintéticos.

## 8. Limitaciones y estado remoto no certificado

1. La política declarativa runtime se limita a **TiDB 8.5.3** corroborado. Otras versiones quedan sin interpretación aprobada, aunque el detector general las reconozca. Bootstrap puede observar capacidades de otras versiones sin aprobar runtime. No hay fallback permisivo.
2. La comparación de CHECK sigue siendo conservadora: normaliza tokens/citas y envoltorios redundantes, pero no es un demostrador general de equivalencia SQL. Introducciones de charset, agrupaciones internas o comentarios/formas no soportados pueden bloquear y requieren revisión. No se alteran predicados para pasar las pruebas.
3. El lector local del catálogo cubre la gramática de los archivos versionados actuales, no SQL arbitrario. Su inventario se contrasta con los 39 nombres/tipos esperados y los hashes se validan antes de usarlo.
4. SHOW CREATE refleja el estado declarativo según la semántica pública revisada. Su combinación con controles observados no equivale a ejecutar una prueba funcional sobre cada restricción ni a certificar el código privado de Serverless.
5. CONNECTION_ID y las lecturas inicial/final vinculan el lote y detectan cambios visibles; no constituyen una transacción de metadatos ni prueban que nada cambiara y se restaurara entre lecturas. No garantizan la configuración de una conexión futura. La guardia por préstamo del pool se conserva; cambios globales posteriores o administradores concurrentes necesitan controles operativos.
6. El informe es diagnóstico ligado a su conexión y momento; no se persiste ni se reutiliza como aprobación de otra sesión. No autentica capturas manuales ni completa snapshots antiguos.
7. Permanecen todos los bloqueos de recuperación: columnas obligatorias unknown, contexto/enforcement del snapshot incompletos, 006 applying y ausencia de mecanismo autorizado de ejecución/cierre recuperado.

## 9. Preservación de snapshots y límites de la etapa

| Snapshot | SHA-256 sin cambios |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |
| v3 | 2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7 |

Se comparan las huellas al cierre con el inventario inicial. metadataComplete sigue false en los tres. No se ejecuta el planificador contra sus datos reales. Los SQL MySQL/TiDB 001–007, hashes históricos, ledgers/manifests, contratos de atributos y los informes históricos permanecen intactos.

Se mantienen **readyForRemoteExecution=false, ledgerTransitionAllowed=false y allow007=false**. El código no ejecuta migraciones ni cambia el ledger; solo añade/verifica lecturas cuando un preflight futuro se invoque con autorización. Esta etapa no invocó esas lecturas contra una base real.

No hubo conexiones TiDB/MySQL, SQL contra servidores, DDL/DML, migraciones, recuperación, creación/cambio de usuarios o permisos, modificaciones de datos/probe/.env/certificados/credenciales, despliegues ni commits.

## 10. Recomendación para 4.3

Revisar localmente la representación y procedencia de los seis atributos obligatorios unknown y el contexto/enforcement faltantes del candidato v3, conservando trazabilidad. Si se propone recolección de metadatos o ensayo de compatibilidad real, definir primero destino, consultas mínimas y autorización separada; este informe no concede ese alcance.

No reintentar el migrador ni diseñar el cierre del ledger como atajo para aprobar runtime. La compatibilidad local del preflight está implementada y probada con dobles; **TiDB Cloud Serverless no queda certificado y la recuperación 006 no está lista ni autorizada**. La etapa termina aquí.
