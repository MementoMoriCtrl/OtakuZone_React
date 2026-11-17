# OtakuZone — Etapa 3.1: adaptación local y compatibilidad TiDB

Fecha: 16 de noviembre de 2026.

## 1. Resumen ejecutivo

Se implementó una preparación local con selección explícita del motor, identificación corroborada de TiDB, preflight de solo lectura, catálogos separados de migraciones, política de conexiones TiDB y errores de desconexión controlados. **MySQL continúa como predeterminado; TiDB todavía no queda habilitado para ejecutar migraciones ni servir la aplicación.**

No se encontró una sustitución de collation cuya equivalencia completa con el contrato histórico del email pueda demostrarse sin consultar motores/datos. Por ello no se alteraron email, UNIQUE, registro/login ni SQL 001–007. El catálogo TiDB queda bloqueado deliberadamente; el arranque TiDB tampoco puede aprobarse mediante un ledger inventado. Identificar TiDB no equivale a certificarlo.

Se leyeron los informes completos de Etapas 1, 2 y 3 y se inspeccionó el código involucrado. Se preservaron los cambios que ya estaban en el workspace. No hubo conexiones a MySQL/TiDB, DDL real, migraciones, usuarios nuevos, credenciales reales, facturación, cambios de roles/contraseñas, despliegues ni commits.

## 2. Archivos de esta etapa

Los archivos siguientes corresponden a Etapa 3.1; el estado global de Git también contiene cambios anteriores, que no se atribuyen a esta etapa.

### Modificados

| Archivo | Cambio |
| --- | --- |
| `backend/src/config/database.js` | DB_ENGINE explícito, validación TLS/hostname/usuario/pool TiDB y tiempos de retiro |
| `backend/src/db/pool.js` | Opciones por motor, ciclo de vida TiDB y comprobación en una sola conexión física |
| `backend/src/db/migrate.js` | Catálogo y motor verificados antes de DDL; TiDB bloqueado antes de abrir conexión; rechazo de historiales cruzados |
| `backend/scripts/apply-admin-schema.js` | Protege también la entrada alternativa de 007 contra motor/dialecto incorrecto e historiales cruzados |
| `backend/src/db/transaction.js` | Destruye conexiones con fallo de transporte; conserva error y no repite transacciones |
| `backend/src/middlewares/errors.js` | Respuestas 503 redactadas para desconexiones/límites conocidos, también en repositorios que usan execute directamente |
| `backend/.env.example` | Documenta variables nuevas sin cambiar el entorno privado |
| `backend/.env.production.example` | Documenta selección de motor y parámetros del pool; conserva plantilla no operativa |

### Creados

| Archivo | Propósito |
| --- | --- |
| `backend/src/db/engine.js` | Identidad y versión separadas de las capacidades |
| `backend/src/db/tidbPreflight.js` | Observación de variables, collations, UTC y restricciones; rechazo seguro |
| `backend/src/db/migrationCatalog.js` | Lectura normalizada, hashes, procedencia y validación de dialecto/historial |
| `backend/src/db/connectionLifecycle.js` | Retiro por edad solo cuando la conexión está libre |
| `backend/src/db/errors.js` | Clasificación de transporte y traducción HTTP sin secretos |
| `backend/database/tidb/manifest.json` | Identidad TiDB, ledger reservado, fuentes originales y estado blocked, sin SQL ejecutable |
| `backend/database/tidb/README.md` | Versionado propuesto y recuperación de DDL parcial |
| `backend/database/provisioning/TIDB_STARTER.md` | Separación de identidades y mínimos privilegios; sin CREATE USER/GRANT ejecutables |
| `backend/tests/tidb-engine.test.js` | Identidad, mínimos, forks y ausencia de fallback |
| `backend/tests/tidb-preflight.test.js` | Capacidades, collations, restricciones, historial y bloqueo de runtime |
| `backend/tests/tidb-migrations.test.js` | Huellas originales, separación, alteraciones y guardia sin conexión |
| `backend/tests/tidb-pool.test.js` | TLS, inactividad/edad, transacciones, errores e integración HTTP local |
| `backend/tests/tidb-contracts.test.js` | Email, especificación de grants, cookies y CSRF |
| `docs/DESPLIEGUE_ETAPA_3_1_ADAPTACION_TIDB.md` | Este informe |

No se modificaron dependencias, lockfiles, manifest MySQL, migraciones originales, SQL de provisioning local, frontend, resolvedor API, vercel.json, cookies, JWT, bcrypt, CSRF o consultas de negocio. No se sustituyó la persistencia por JSON Server.

## 3. Identificación segura y decisiones técnicas

### Motor y versión

`DB_ENGINE` admite `mysql` y `tidb`, con `mysql` por defecto. La fuente de catálogo conserva su selector `CATALOG_SOURCE=mysql`: este indica la ruta de repositorios SQL/mysql2, mientras DB_ENGINE identifica el motor esperado. No se requiere editar el `.env` privado para seguir trabajando localmente.

La identificación consulta VERSION, version_comment y DATABASE. MySQL exige un formato estable reconocido y comentario MySQL Community/Enterprise o Ubuntu; se rechazan forks o banners desconocidos. Se conserva **MySQL >=8.0.16**, sin reducir su mínimo. `assertMysqlVersion()` sigue disponible para consumidores existentes y no acepta TiDB como MySQL.

TiDB necesita el banner completo de formato admitido y confirmación mediante TIDB_VERSION (Release Version coincidente y Edition) y la variable propia tidb_txn_mode. La palabra TiDB aislada, una release discrepante, un formato nightly no admitido o una variable ausente no bastan. Se comprueba separadamente el mínimo conservador TiDB estable >=7.4.0, antes de capacidades; ese mínimo cubre la generación documentada con CHECK y collations 0900, pero no aprueba el producto por sí mismo. [VERSION y TIDB_VERSION](https://docs.pingcap.com/tidbcloud/information-functions/#version).

La identidad seleccionada debe coincidir con DB_ENGINE. No se permite fallback de TiDB a MySQL ni a datos demo. La comprobación fija una conexión física para que las observaciones correspondan a la misma sesión y la libera al terminar.

Esto es corroboración de protocolo/capacidades, no una prueba criptográfica de fabricante. TLS verificado y endpoint confiable siguen siendo necesarios. Los formatos reales del proveedor y el banner del MySQL local deberán observarse en una etapa con autorización de conexión; el smoke local de esta etapa no abre MySQL.

### Preflight TiDB de solo lectura

El preflight únicamente usa SELECT y SHOW. No contiene SET GLOBAL, DDL ni DML. Exige:

- tidb_enable_check_constraint y tidb_enable_foreign_key observadas ON.
- foreign_key_checks ON en la sesión y tidb_txn_mode=pessimistic, para conservar los bloqueos usados por comercio.
- STRICT_TRANS_TABLES y ONLY_FULL_GROUP_BY presentes; no elimina modos SQL.
- UTC explícito (`+00:00`/`UTC`) o SYSTEM corroborado como UTC. Z del driver no sustituye esta comprobación.
- Disponibilidad de la collation histórica requerida para email, sin aceptar alternativas distintas por conveniencia.
- En runtime, ledger TiDB propio y ausencia del MySQL, collation real de usuarios.email y todas las restricciones esperadas por nombre/tipo con ENFORCED=YES: 20 CHECK y 18 FK.

Las consultas fallidas, valores ausentes, restricciones no observables o collations distintas producen un error técnico redactado y no aprueban compatibilidad. El default documentado de CHECK no se toma como evidencia del estado real. [Restricciones TiDB](https://docs.pingcap.com/tidb/stable/constraints/), [variables](https://docs.pingcap.com/tidbcloud/system-variables/).

Hay dos fases explícitas: bootstrap puede observar capacidades sin exigir tablas existentes y siempre devuelve runtimeApproved=false; runtime requiere metadatos. **Incluso con fixtures ideales, runtime sigue rechazándose al final porque todavía no hay catálogo TiDB aprobado.** Este bloqueo debe retirarse mediante una revisión posterior que verifique el catálogo/ledger adaptado, no mediante una variable para saltarse protecciones.

El preflight está conectado a la comprobación del arranque en server.js a través de checkDatabaseConnection. No se ejecutó contra un servidor. Un futuro soporte operativo deberá comprobar también las sesiones nuevas del pool y la integridad funcional real; observar metadatos no sustituye pruebas negativas de CHECK/FK.

## 4. Email y collation: contrato preservado

### Semántica actual

La columna usa `utf8mb4_0900_as_ci`: comparación Unicode UCA 9.0, sensible a acentos e insensible a mayúsculas. Por ejemplo, la intención de MySQL es considerar equivalentes `User` y `user`, pero distinguir `jose` de `josé`; las equivalencias Unicode y el padding también forman parte de la collation. El índice UNIQUE utiliza esa comparación. [Convenciones de MySQL](https://dev.mysql.com/doc/refman/8.0/en/charset-collation-names.html).

Hay una segunda capa que el informe anterior no había detallado suficientemente: tanto registro como login ejecutan trim, validación Zod email y toLowerCase antes del servicio. Las pruebas con la dependencia instalada confirman aceptación/canonicalización de correo ASCII y rechazo de `josé@example.test` y `user@éxample.test`. Esos casos son fixtures; no se consultaron cuentas reales.

Por lo tanto, el contrato observable de la API actual es más estrecho que todo el dominio de valores posible de la columna. Eso **no demuestra** que la base histórica carezca de valores Unicode insertados por otros medios, ni demuestra equivalencia de collations para todos los correos válidos. No se modificó el validador.

### Alternativas evaluadas

| Alternativa | Diferencia relevante | Decisión |
| --- | --- | --- |
| Mantener `utf8mb4_0900_as_ci` | Contrato histórico; no consta en catálogo TiDB consultado | Exigida por el preflight actual, que fallará si no existe |
| `utf8mb4_0900_ai_ci` | Pierde sensibilidad a acentos en la base | No adoptada |
| `utf8mb4_bin` | Comparación binaria sensible a mayúsculas y padding diferente del conjunto 0900 | No adoptada |
| `utf8mb4_0900_bin` | También distingue mayúsculas y no equivale a as_ci | No adoptada |
| `utf8mb4_unicode_ci` | Otra versión/reglas Unicode y sensibilidad a acentos diferente | No adoptada |

TiDB documenta las alternativas anteriores, pero no la equivalencia exacta requerida. [Collations TiDB](https://docs.pingcap.com/tidb/stable/character-set-and-collation/). Tampoco deben equipararse sin más las collations binarias antiguas y 0900. [Padding y collations binarias MySQL](https://dev.mysql.com/doc/refman/8.0/en/charset-binary-collations.html).

### Diseño pendiente para Etapa 3.2

Primero observar SHOW COLLATION real. Si no existe equivalencia exacta, una propuesta a autorizar es formalizar un contrato de email ASCII canonicalizado (ya usado por API), auditar que todos los datos a trasladar lo cumplan y diseñar una clave única canonicalizada separada del valor presentado. Una clave binaria sobre esa representación solo sería admisible tras comprobar equivalencias, datos y concurrencia; no se declara equivalente para toda la collation Unicode histórica.

Antes de elegir: preparar una matriz de comparación/UNIQUE/login entre MySQL y TiDB para case, acentos, caracteres combinados, padding, puntuación válida y direcciones IDN en representación permitida. Las comprobaciones sobre cuentas, si hicieran falta, requieren autorización y resultados agregados sin publicar correos. No se añadió columna, SQL adaptado ni transformación de usuarios en esta etapa.

## 5. Migraciones, dialectos y checksums

MySQL sigue leyendo exactamente su manifest y archivos 001–007, normalizando BOM/CRLF de la misma forma y usando schema_migrations. El nuevo lector conserva ese cálculo SHA-256. Las pruebas comparan las siete huellas con la procedencia fijada en el catálogo TiDB; los archivos originales y su manifest permanecen intactos.

El catálogo reservado TiDB usa `dialect=tidb`, `ledger=schema_migrations_tidb`, `status=blocked` y una lista **vacía** de migraciones. Las siete fuentes/huellas son trazabilidad, no historial aplicado ni checksums de SQL TiDB inexistente. No hay un comando capaz de convertir ese status en una aprobación sin cambiar también las guardias de código.

`migrateDatabase()` selecciona y valida catálogo/dialecto antes de createConnection. La rama TiDB aborta ahí, sin abrir socket ni ejecutar SQL. La rama MySQL comprueba identidad real, lock e historial; rechaza la presencia del ledger TiDB. Además verifica checksums de un ledger existente antes de ejecutar el bootstrap DDL, y vuelve a verificarlos antes de aplicar pendientes.

La entrada alternativa `apply-admin-schema.js`, que puede aplicar 007 por separado, también tiene guardias de dialecto antes de crear pool y comprobación del motor/historial antes de DDL. Se revisó estáticamente; no se ejecutó. Los QA heredados que pasan por schemaCheck/arranque tampoco obtienen aprobación de runtime TiDB. No se presentan esos scripts como herramientas de validación remota seguras.

En el futuro, cada SQL TiDB aprobado necesitará identidad propia, hash del SQL realmente ejecutado y referencia al archivo/hash fuente, junto con explicación de la adaptación. No escribir las huellas MySQL en el ledger TiDB como si fueran ejecuciones. Una 008 no soluciona una 002 que no pudo crearse.

**DDL parcial:** 006 puede dejar ALTER aplicado sin backfill/ledger terminado; 007 puede dejar la tabla creada sin ledger. Detener reintentos, conservar evidencia redactada, comparar SHOW CREATE TABLE/índices/restricciones/datos con el plan aprobado y preparar recuperación específica. En ensayo vacío puede recrearse/restaurarse solo con autorización. Con datos, definir reparación y restauración antes de actuar. No editar checksums ni fabricar entradas para ocultar el fallo. [Procedimiento técnico](../backend/database/tidb/README.md).

## 6. Pool y ciclo de vida

### Configuración

| Variable | MySQL local | TiDB seleccionado explícitamente |
| --- | --- | --- |
| DB_ENGINE | mysql por defecto | tidb |
| DB_POOL_SIZE | Conserva rango 1–20/default 5 | Exige 2–5 |
| DB_SSL | Conserva desarrollo; producción exige true | Exige true incluso fuera de producción |
| DB_HOST | Conserva default local | Hostname explícito, no IP ni localhost |
| DB_USER | Máximo 32 | Máximo 32 completo, prefijo/sufijo y sin root |
| DB_POOL_IDLE_TIMEOUT_MS | No cambia opciones actuales del pool MySQL | 60000 por defecto; rango 1000–300000 |
| DB_POOL_MAX_LIFETIME_MS | Sin política nueva de edad | 300000 por defecto; rango 1000–300000 |

Los ejemplos documentan valores, no configuran credenciales ni seleccionan TiDB en archivos privados. Para conexión futura, host/usuario/puerto provendrán de Connect. Starter suele usar 4000; no se alteró el puerto 3306 del ejemplo MySQL. Mantener TLS rejectUnauthorized=true, CA verificada y hostname real; DB_SSL_CA sigue siendo PEM opcional.

### Retiro seguro

Se inspeccionó mysql2 3.24.6 instalado: el escaneo de inactivas solo se inicia si maxIdle < connectionLimit. Para TiDB se configura maxIdle=connectionLimit−1 e idleTimeout explícito. MySQL conserva sus opciones previas. [Opciones de pool mysql2](https://sidorares.github.io/node-mysql2/docs#using-connection-pools).

El retiro por edad usa eventos públicos connection/acquire/release y destroy. No inspecciona listas internas ni parchea release de conexiones. Cancela el timer al adquirir; solo programa/destruye una conexión libre. Limpia sus listeners/timers al cerrar pool o finalizar la conexión. No ejecuta heartbeat SQL.

**Edad máxima suave:** una transacción o un traspaso directo a un prestatario en cola no se corta al llegar a cinco minutos. mysql2 no emite release al entregar directamente a la cola; la conexión sigue ocupada a efectos del retiro. Se retirará al quedar libre. El retiro por edad no garantiza duración física estricta bajo ocupación continua, precisamente para preservar transacciones.

Starter documenta timeout público AWS inactivo de 340 s y recomienda comenzar con vida de conexión de cinco minutos; TCP keep-alive no evita ese timeout. La política reduce exposición, sin prometer que una conexión nunca se desconectará. Pool pequeño y cola 20 se mantienen muy por debajo de las 400 conexiones publicadas. [Límites Starter](https://docs.pingcap.com/tidbcloud/serverless-limitations/).

### Desconexiones y transacciones

Errores de transporte conocidos y límites de conexiones se traducen a 503 DATABASE_UNAVAILABLE, sin SQL, mensajes del driver o credenciales en la respuesta. No se devuelven datos demo como fallback. Los errores de integridad conservan sus códigos para las reglas existentes.

Una desconexión durante transacción destruye la conexión; no se devuelve al pool, no se repite la operación ni se presupone rollback de un commit cuyo resultado es incierto. Para fallos ordinarios se conservan rollback y release; si rollback falla, se destruye como antes. Se mantienen UTC, idempotencia del checkout y orden de bloqueos, sin cambiar reglas de negocio.

## 7. Seguridad y provisioning

[La documentación específica](../backend/database/provisioning/TIDB_STARTER.md) distingue operador inicial, migrador, runtime y mantenimiento. No incluye credenciales ni instrucciones de creación ejecutadas.

El runtime TiDB debe usar nombre completo con prefijo real y sufijo corto; el validador conserva 32 caracteres y rechaza root. Eso no prueba que la cuenta remota tenga permisos mínimos: no se consulta ni se interpreta SHOW GRANTS automáticamente en esta etapa.

Los grants por columna del provisioning local representan el objetivo de seguridad: no UPDATE de rol_id/email/password_hash existentes, no DDL ni administración de usuarios/roles/ledger. INSERT del rol del registro sigue siendo necesario y controlado por el servicio; no es un permiso para cambiar roles existentes. No se ejecuta RANDOM PASSWORD ni se asume su disponibilidad.

Si Starter no permite los grants requeridos por columna en su versión real, no se ampliarán silenciosamente a tablas. Habrá que explicar la diferencia y aprobar una solución. No debe usarse root como atajo ni conceder DELETE general para tareas de limpieza que pertenecen a mantenimiento.

JWT, bcrypt, cookies HttpOnly, CSRF, Origin y sesiones revocables permanecen funcionalmente intactos. Las pruebas existentes de CORS/roles/firma/CSRF y las nuevas de configuración siguen pasando. Los límites distribuidos, limpieza de sesiones y políticas de recuperación de cuenta siguen fuera del alcance.

## 8. Proxy futuro en Vercel — propuesta, no configuración activa

Se usan únicamente los nombres propuestos por el usuario: frontend `https://otakuzone.vercel.app` y backend `https://otakuzone-api.onrender.com`. **No se verificó disponibilidad ni se crearon/asignaron esos servicios.**

El navegador deberá usar `/api/v1` en el mismo origen frontend; Vercel reenviará la solicitud por HTTPS al backend. No se cambió el resolvedor ni vercel.json en esta etapa. La futura modificación deberá permitir específicamente la base relativa aprobada en producción, conservando la validación de desarrollo y evitando bases protocol-relative o destinos arbitrarios.

| Elemento | Tratamiento que debe comprobarse después |
| --- | --- |
| Cookie | Reenviar al backend para las rutas API; no leer JWT en JavaScript ni persistirlo en storage |
| Set-Cookie | Preservar sin combinar/perder cabeceras, incluyendo expiración y borrado. El navegador la asocia al host frontend porque allí recibió la respuesta; no añadir Domain del backend |
| Opciones | Conservar __Host-, HttpOnly, Secure, SameSite=Lax y Path=/ en producción; opciones locales intactas |
| Origin | Preservar el Origin del navegador. CORS_ORIGINS y browserMutation deben aceptar únicamente el frontend autorizado; no reescribir Origin para eludir CSRF |
| CSRF | Reenviar X-OtakuZone-CSRF, Content-Type y cuerpo/método originales; mantener token de sesión y validación |
| Credenciales | Mantener credentials: include |
| Caché | Conservar Cache-Control:no-store; sin caché compartida de API, sesión, cookies ni errores autenticados |
| Errores | Preservar status, JSON y Retry-After; una API 401/403/404/429/503 no debe convertirse en index.html |
| React Router | Fallback SPA solo después de rutas API; los recursos estáticos y rutas profundas deben seguir resolviendo correctamente |

Orden conceptual de rewrites, **no aplicado**: `/api/v1/:path*` hacia el mismo sufijo `/api/v1/:path*` del backend indicado por el usuario, antes del fallback `/(.*)` a index.html. No añadir un proxy abierto ni interpolar host desde entrada del cliente. Verificar el comportamiento real de cabeceras/caché/IP de cliente y la cadena TRUST_PROXY antes de publicar.

El backend directo seguirá protegido por autenticación, roles, Origin y CSRF; CORS por sí solo no es una autenticación del proxy. Las URLs de preview deberán aislarse de producción. No se necesita cambiar a SameSite=None para el diseño propuesto. No se solicitó ni realizó configuración de dominios en esta etapa.

## 9. Pruebas y validaciones

Entorno: Node 24.16.0, npm 11.13.0. Se añadieron **25 pruebas backend**, todas con fixtures/dobles o HTTP local temporal. No hay conexión SQL local o externa. El pool real solo se construye/cierra de manera lazy sin adquirir conexiones en una prueba de opciones.

| Validación | Resultado final |
| --- | --- |
| npm run lint, raíz | Aprobado |
| npm test, raíz | 22/22 aprobadas |
| npm test, backend | 58/58 aprobadas |
| npm run build:local | Aprobado; 2181 módulos y dist-local |
| npm run check:local | Aprobado; valida configuración sin abrir MySQL, módulos/ruta profunda/preview/API demo Express |
| git diff --check | Sin errores |
| Huellas de .env.local, backend/.env, manifest MySQL y lockfiles | Iguales a las observadas al inicio de Etapa 3.1; no se publican huellas privadas |
| Siete SQL originales | Huellas conservadas; no fueron editados ni ejecutados |
| Exclusiones Git de archivos privados | Conservadas; no aparecen versionados |

Cobertura nueva: MySQL admitido/rechazado, TiDB corroborado/discrepante, motores desconocidos, capacidades ausentes, variables/metadatos no observables, collations no equivalentes, ledger cruzado/fabricado, checksums cambiados, TLS, retiro por edad libre/ocupada/cola, commit sin interrupción, commit con desconexión sin replay, 503 HTTP redactado, política runtime de los grants locales, configuración local y cookies/CSRF. Se preservan las pruebas previas de JWT, roles, transacciones/rollback, CORS y AniList.

Una prueba inicial falló porque su fixture supuestamente demasiado largo tenía exactamente 32 caracteres, que son válidos. Se corrigió el fixture a 33; no se relajó la validación. Los runners también encontraron spawn EPERM en sandbox y se reejecutaron autorizados fuera de él. El primer intento de lint desde backend no tenía script; la validación correcta se ejecutó desde raíz y pasó. **No quedan pruebas fallidas en la ejecución final.**

El smoke demo es el existente de Express para probar HTTP sin SQL; no sustituye el motor configurado del producto. No se ejecutaron QA heredados, provisioning, db:migrate, admin:schema ni verificadores que creen/eliminaran datos reales. La prueba de la guardia del migrador TiDB solo entra en la rama bloqueada, que aborta antes de createConnection/DDL. No se compiló producción con URLs inventadas.

## 10. Estado de preparación y límites

| Estado | Alcance |
| --- | --- |
| Implementado y probado offline | Selección/identidad, mínimos, preflight con fixtures, rechazo seguro, catálogo separado, procedencia, protección del migrador, TLS/opciones, retiro por edad, transacciones y errores |
| Preparado pero no probado con servidor | Consultas preflight, banners admitidos, visibilidad ENFORCED/variables, retiro bajo sesiones mysql2 reales, guardias de entradas DDL |
| Pendiente de decisión | Equivalencia/contrato de email y SQL TiDB ejecutable con su catálogo aprobado |
| Pendiente de validación real autorizada | TLS/endpoint, grants/prefijo, versión, CHECK/FK negativos, aislamiento/concurrencia, UTC, GROUP BY, cuotas y recuperación |
| Solo propuesta | Proxy API, cabeceras y rewrites de Vercel; servicios Render/Vercel |

No se certifica TiDB, ni una conexión/login real a MySQL. La base local permanece intacta porque no se abrió ni se ejecutó SQL contra ella. La comprobación local y las pruebas previas pasan, pero un futuro banner no reconocido de un servidor conocido deberá revisarse explícitamente, sin relajar la detección de motores desconocidos.

Riesgos restantes: catálogo TiDB bloqueado, formato real de versiones por confirmar, enforcement y privilegios remotos no observados, duración suave del pool bajo ocupación continua, fallos de conexión/cuota aún posibles, resultado ambiguo de commit que debe reconciliarse, diferencias de SQL/IDs distribuidos, housekeeping de sesiones, backup/restore y observabilidad. No se añaden reintentos ciegos para ocultar estos riesgos.

## 11. Pasos concretos para Etapa 3.2

1. Revisar esta adaptación y autorizar el siguiente alcance concreto. No editar .env privados ni activar TiDB todavía solo por haber pasado las pruebas.
2. Acordar contrato y estrategia de email: comprobar si se puede conservar la collation real o aprobar explícitamente el diseño alternativo y su matriz de equivalencias. Sin eso no generar SQL adaptado ejecutable.
3. Completar el diseño del catálogo TiDB: nombres/versiones propias, hashes de SQL realmente ejecutado, procedencia de fuentes, bootstrap/ledger e historial sin mezcla; revisar recuperación de 006/007. Mantener 001–007 y manifest MySQL intactos.
4. Solo si se autoriza expresamente crear recursos, el usuario podrá crear Starter MySQL-compatible gratuito sin tarjeta, Marketplace ni spending limit positivo. Si se exige pago, detenerse. No hay recursos creados por esta etapa.
5. Autorizar por separado una conexión de solo lectura con parámetros reales guardados de forma segura. Confirmar versión, CA, prefijo, nombre de base, variables, collations, UTC/sql_mode, metadatos y permisos. No usar el migrador para descubrir capacidades. El preflight bootstrap está preparado para esa observación, pero todavía puede y debe fallar si falta una garantía.
6. Resolver con autorización cualquier variable administrativa necesaria; no ejecutar SET GLOBAL automáticamente ni retirar CHECK/FK. Diseñar los grants según versión real y comprobar mínimos sin root runtime.
7. Tras aprobar SQL/catálogo/preflight completo, habilitar runtime en una revisión nueva. No basta cambiar blocked a ready ni insertar filas manuales.
8. Obtener autorización expresa para migrar únicamente un esquema remoto aislado nuevo, con operador/cuenta separada y plan de recuperación. Ninguna migración forma parte de esta Etapa 3.1.
9. Autorizar pruebas de integridad y concurrencia reales con datos propios, revisar consumo RU y recuperación. Solo después evaluar la etapa del proxy y despliegue, que requiere otra autorización.

## Cierre

Etapa 3.1 finalizada con adaptación local y bloqueos explícitos donde falta evidencia. MySQL local, archivos privados y migraciones históricas permanecen intactos. No se crearon recursos, no se ejecutaron migraciones y no se avanzó a Render/Vercel. Se espera autorización expresa para continuar.
