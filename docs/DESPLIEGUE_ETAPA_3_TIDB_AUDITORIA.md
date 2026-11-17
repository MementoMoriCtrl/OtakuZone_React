# OtakuZone — Etapa 3: auditoría de TiDB Cloud Starter

Fecha de consulta: 16 de noviembre de 2026. Destino evaluado: **TiDB Cloud Starter, modo compatible con MySQL**, sin tarjeta ni facturación. No se evalúa la modalidad PostgreSQL ni se cambia de proveedor.

## 1. Dictamen y alcance

**Compatibilidad parcial y condicionada. No ejecutar el migrador actual contra TiDB todavía.** mysql2 y TLS tienen soporte documentado; gran parte del SQL es trasladable. Se encontró una collation no documentada como soportada, un control de versión MySQL que rechaza formatos habituales de TiDB y requisitos de integridad que necesitan verificación previa. No basta con sustituir host y contraseña.

Se consultaron íntegramente los informes de [Etapa 1](DESPLIEGUE_ETAPA_1_AUDITORIA.md) y [Etapa 2](DESPLIEGUE_ETAPA_2_CONFIGURACION.md), las siete migraciones, manifest, ledger, provisioning, pool/TLS, ejecutor, verificadores y SQL de autenticación, catálogo, comercio y administración. El código real prevalece sobre documentos históricos: `backend/database/README.md` aún contiene descripciones de fases antiguas que no reflejan toda la funcionalidad actual.

En esta etapa solo se crea este informe. Se preservan los cambios anteriores del workspace. No se alteran código, SQL, manifest, `.env` privados ni funcionalidades. Las validaciones regeneran únicamente artefactos locales ignorados y caché de herramientas. No se creó cuenta/instancia, introdujeron credenciales, activó facturación, consultó MySQL local/remoto, ejecutaron migraciones ni realizaron commits.

“Compatible documentalmente” significa que el SQL coincide con capacidades publicadas; **no** significa que se ejecutó con éxito en una instancia. No existe instancia cuya versión, variables, grants o certificados se hayan verificado aquí.

## 2. Compatibilidad de las migraciones

El manifest contiene 001–007; solo 003 y 004 tienen `transactional:true`. El inventario estático arroja **16 tablas de aplicación + schema_migrations = 17 tablas, 18 FK y 20 CHECK**. Son los recuentos esperados por el verificador actual.

| Archivo | Evaluación documental | Condiciones o problema |
| --- | --- | --- |
| `001_create_database.sql` | Compatible bajo condiciones | CREATE DATABASE IF NOT EXISTS, utf8mb4 y `utf8mb4_0900_ai_ci` están soportados en versiones actuales; requiere privilegio CREATE y nombre `otakuzone_db` |
| `002_relational_schema.sql` | **No compatible tal cual con el catálogo documentado** | `usuarios.email` exige `utf8mb4_0900_as_ci`, ausente del catálogo publicado. Además hay que garantizar CHECK/FK efectivos, columnas generadas e índices únicos |
| `003_roles_and_plans.sql` | Compatible documentalmente, dependiente de 002 | INSERT múltiple y ON DUPLICATE KEY UPDATE; carga roles de aplicación y planes demo, no usuarios SQL |
| `004_demo_catalog.sql` | Compatible documentalmente, dependiente de 002 | INSERT múltiple/upsert de categorías, productos, inventario y promociones. Contenido demostrativo; una promoción conserva referencia histórica a Jikan |
| `005_auth_sessions.sql` | Compatible bajo condiciones | CHAR ASCII, DATETIME(3), PK, índices, FK con DELETE CASCADE y CHECK de expiración; exige integridad activada |
| `006_commerce.sql` | Compatible bajo condiciones; requiere ensayo del DDL compuesto | ALTER agrega columnas, dos UNIQUE y una FK; crea historial y ejecuta INSERT SELECT con NOT EXISTS. No es una migración atómica ni completamente repetible |
| `007_admin_inventory.sql` | Compatible bajo condiciones | CREATE TABLE con FK/CHECK e historial de movimientos. No usa IF NOT EXISTS; un fallo posterior al DDL requiere conciliación antes de repetir |
| `bootstrap/ledger.sql` | Compatible documentalmente | VARCHAR/CHAR ASCII, TIMESTAMP(3), PK; collation de tabla `utf8mb4_0900_ai_ci` |

TiDB documenta `utf8mb4_0900_ai_ci` desde v7.4 y `ascii_bin`, pero no `utf8mb4_0900_as_ci`. No marcar todas las collations 0900 como incompatibles. **Bloqueo de 002 inferido del catálogo oficial, pendiente de confirmar en el servicio concreto con SHOW COLLATION.** Sustituir por una collation binaria o insensible a acentos cambiaría la igualdad/unicidad del correo; no es un cambio cosmético. [Character Set and Collation](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

### Restricciones y tipos

- **CHECK:** TiDB tiene soporte, pero la documentación indica que la función está desactivada por defecto mediante `tidb_enable_check_constraint`. Antes de crear tablas se deberá comprobar su valor y si se permite habilitarla en Starter. No se da por hecho el valor real de una instancia administrada. Si no puede garantizarse enforcement, detenerse: precios, stock, cantidades y fechas dependen de estas reglas. No eliminar CHECK ni sustituirlos silenciosamente por validación React. [Constraints](https://docs.pingcap.com/tidb/stable/constraints/).
- **FK:** soporte efectivo desde v6.6, sujeto a las variables de habilitación y `foreign_key_checks`. Las relaciones explícitas del proyecto, CASCADE y RESTRICT encajan documentalmente; los tipos/longitudes/collations de las columnas relacionadas coinciden. Requieren REFERENCES para crear las relaciones. Las restricciones de cascada sobre columnas generadas no afectan directamente a estas FK, que usan columnas normales. [FOREIGN KEY](https://docs.pingcap.com/tidb/stable/foreign-key/).
- **Generadas STORED:** cantidad disponible, subtotal y CASE para un único carrito/plan activo se definen en CREATE TABLE, con expresiones deterministas. TiDB soporta columnas generadas e índices sobre ellas. La limitación de añadir/modificar STORED mediante ALTER no corresponde a estas migraciones. Mantener los UNIQUE sobre valores generados, incluidos múltiples NULL para históricos. [Generated Columns](https://docs.pingcap.com/tidb/stable/generated-columns/).
- **DECIMAL, BIGINT UNSIGNED, SMALLINT, ENUM, BOOLEAN, VARCHAR/CHAR, DATETIME(3) y TIMESTAMP(3):** sin incompatibilidad estática identificada. `ENGINE=InnoDB` es compatibilidad de metadatos; TiDB no se convierte en un servidor InnoDB por declarar esa opción. [Compatibilidad MySQL](https://docs.pingcap.com/tidb/stable/mysql-compatibility/).
- **AUTO_INCREMENT:** insertId es utilizable, pero no asumir continuidad ni orden cronológico global. El proyecto usa ORDER BY id en pedidos/historial/listados: con asignadores distribuidos ese orden puede no representar el momento real. Los identificadores deberían seguir tratándose como claves, no números de recibo secuenciales. [Information Functions](https://docs.pingcap.com/tidbcloud/information-functions/).

## 3. Ejecutor, manifest y checksums

### Bloqueo del control de versión

`backend/src/db/pool.js: assertMysqlVersion()` interpreta el prefijo de VERSION como versión MySQL y exige >=8.0.16. Tanto `server.js` como el migrador y comprobadores usan esta función. TiDB documenta VERSION con un prefijo de compatibilidad `8.0.11-TiDB-…`, distinto de su versión interna. Se reprodujo **sin conexión** que la cadena fixture `8.0.11-TiDB-v8.5.0` es rechazada. No es la versión de una instancia creada ni consultada. [Formato de VERSION](https://docs.pingcap.com/tidbcloud/information-functions/#version).

Propuesta mínima, pendiente de autorización: distinguir explícitamente MySQL de TiDB y verificar versión/capacidades reales de este último, incluyendo restricciones aplicadas. Conservar el control MySQL actual. No simplemente bajar el mínimo MySQL ni aceptar toda cadena con “TiDB”: eso permitiría motores/versiones sin integridad requerida.

### Lock, bootstrap y recuperación

`GET_LOCK('otakuzone_db:migrations',10)` y RELEASE_LOCK están documentados actualmente en TiDB Cloud; el timeout y longitud usados encajan. **No se confirmó una incompatibilidad de estas funciones.** Es necesario ensayar exclusión entre dos sesiones y liberación al desconectar antes de confiar en el bloqueo para despliegues. [Locking Functions](https://docs.pingcap.com/tidbcloud/locking-functions/).

El migrador exige `DB_NAME=otakuzone_db`, abre conexión sin database, consulta VERSION, toma lock, inspecciona tablas y después ejecuta CREATE DATABASE, USE y bootstrap. TiDB admite bases de datos; no hay evidencia de que CREATE DATABASE esté universalmente prohibido en Starter. Hay que comprobar permisos del operador futuro. Si se conserva ese nombre no hace falta parametrizarlo por obligación del proveedor; si se elige otro, el ejecutor sí necesita adaptación autorizada.

La protección contra tablas sin historial y los checksums es útil, pero hay límites:

1. CREATE DATABASE y ledger ocurren antes de concluir la comparación de checksums; el comando no es de solo lectura.
2. Las migraciones DDL no se revierten junto con la inserción en ledger. Si DDL termina y el ledger falla, repetir puede fallar por objetos existentes, especialmente en 006 y 007.
3. El migrador ejecuta archivos con `multipleStatements:true`; está aislado del pool HTTP, que lo desactiva. No pasar SQL de usuario por ese canal.
4. Añadir una 008 no arregla un fallo de sintaxis de 002: nunca se alcanzaría. Tampoco debe editarse 002 ya aplicada en MySQL y fingir que el checksum original describe SQL diferente.

Propuesta mínima: preparar una ruta de bootstrap/versionado para TiDB con identidad de dialecto, archivos/checksums propios o una transformación explícita auditada que registre tanto origen como SQL ejecutado. **Elegir y autorizar el diseño antes de implementarlo.** Mantener intacto el historial MySQL; no insertar manualmente checksums de migraciones que no se hayan ejecutado.

Huellas SHA-256 calculadas solo leyendo archivos, con la misma normalización BOM/CRLF del ejecutor; no contrastadas con ninguna base:

| Migración | SHA-256 |
| --- | --- |
| 001 | `5e7af2dd955fe4a8e9fad68228240f0c80521b2d84c293bbe6ed4d1d66616fbb` |
| 002 | `c7eb87dda45af52185d697996cc6f24dbab706d0eac0b7c350d01c25c40a5237` |
| 003 | `2280ea97e6ecfff549ec4fa20681bbd81bd2970b66d6a0f88063760597f40d92` |
| 004 | `d87b745c21d6167ce0e59297755ee4eabb3783493bc4051ff9c36a0f96aeaed7` |
| 005 | `dc7dfce218f252dbc051d9ab8aa22385a89568cc4bd071d74d6a90a1ad2b7a8c` |
| 006 | `2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e` |
| 007 | `244478c340d887cd001c2270511b89169bf122a0c6938aceaab7e2c4b9e83520` |

## 4. Consultas SQL, transacciones e índices

Se revisaron `catalogSql.js`, `authSql.js`, `commerceSql.js`, los repositorios MySQL y SQL embebido de administración. No usan procedimientos almacenados, triggers, eventos, XA, GIS, FULLTEXT, SKIP LOCKED ni replicación MySQL. Sus limitaciones no son bloqueos actuales. Las restricciones específicas de Starter se contrastaron en [Limited SQL Features on TiDB X Instances](https://docs.pingcap.com/tidbcloud/limited-sql-features-tidb-x/), no se extrapolaron desde Dedicated.

| Operación real | Evaluación y acción futura |
| --- | --- |
| Consultas parametrizadas con execute y `?` | mysql2 tiene integración oficial; conservar parámetros |
| JOIN, subconsultas, INSERT SELECT, NOT EXISTS, upsert | Sin incompatibilidad confirmada; probar resultados y affectedRows |
| SUM/COALESCE/CAST DECIMAL | Mantener precisión SQL y conversión de importes en DTO; verificar totales y subtotal generado |
| LOWER/LOCATE, CASE, GREATEST, UTC_TIMESTAMP(3), TIMESTAMPADD | Sin bloqueo estático detectado; probar caracteres/acentos y precisión temporal |
| SELECT FOR UPDATE y BEGIN/COMMIT/ROLLBACK | Soportados documentalmente; verificar modo pesimista, conflictos y tiempos de espera |
| `GROUP BY p.id` con otros campos de pedidos no agregados | Depende de reconocimiento de dependencia funcional con ONLY_FULL_GROUP_BY; no se demuestra incompatibilidad. Ensayar consultas `order` y `orders`; si fallan, agrupar explícitamente los campos restantes o preagregar detalles |
| ORDER BY id / paginación OFFSET | Sintaxis trasladable; IDs no garantizan cronología y OFFSET profundo aumenta trabajo |
| information_schema.TABLES/COLUMNS/TABLE_CONSTRAINTS y ENFORCED | Confirmar columnas, visibilidad y semántica en servicio real; `schemaCheck.js` no es todavía una certificación TiDB |

No desactivar ONLY_FULL_GROUP_BY para lograr que una consulta pase. TiDB documenta el modo y diferencias de comprobación. [SQL Mode](https://docs.pingcap.com/tidbcloud/sql-mode/).

`withTransaction()` usa una sola conexión, fija UTC, confirma/revierte y destruye si rollback falla. No especifica aislamiento ni modo transaccional. La serialización por fila de usuario y el bloqueo ordenado de productos protegen carrito/checkout; deben ensayarse sobre el motor distribuido. No hay reintentos de conflictos implementados ni debe añadirse repetición ciega cuando un commit tenga resultado incierto. El checkout tiene clave de idempotencia y UNIQUE que deben conservarse.

Los índices cubren claves, sesiones por usuario/expiración, FK, pedidos por usuario/fecha e historial. Buscar con LOCATE/LOWER y contar paneles puede escanear filas; la lista de productos no está paginada. Eso afecta RU al crecer, sin exigir reescritura inmediata para el catálogo pequeño actual.

**Importante para futuras comprobaciones:** `getCart` puede crear un carrito y `subscription` puede crear el plan inicial incluso desde rutas GET. Un smoke remoto de esas rutas no es de solo lectura. Los scripts `db:verify`, auth/commerce/admin verify y `close-phase7.js` escriben o crean/eliminan recursos; no se ejecutaron.

## 5. mysql2, TLS, pool y preparación de conexión

mysql2/promise tiene un ejemplo oficial para TiDB. TLS es obligatorio en Starter público; Node dispone de CA incorporadas reconocidas por el servicio, por lo que no debería requerirse una CA manual en el caso normal. La conexión del proyecto con DB_SSL=true y rejectUnauthorized=true es adecuada documentalmente; mantener hostname real, sin sustituirlo por IP ni desactivar verificación. [Guía oficial node-mysql2](https://docs.pingcap.com/developer/dev-guide-sample-application-nodejs-mysql2/).

DB_SSL_CA es **contenido PEM**, no una ruta de archivo; puede quedar sin definir cuando se usa la confianza de Node. No copiar una ruta del ejemplo CLI a esa variable. Confirmar el certificado real y la configuración recomendada en el futuro diálogo Connect. TiDB Cloud admite TLS 1.2/1.3 y requiere usuario con prefijo de instancia. [TLS Starter](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/).

### Variables pendientes, sin valores inventados

| Variable existente | Preparación futura |
| --- | --- |
| `DB_HOST` | Host exacto entregado por Connect; todavía no existe |
| `DB_PORT` | Puerto entregado por Connect; Starter documenta 4000, no asumir el default local 3306 |
| `DB_NAME` | Acordar nombre; el ejecutor actual solo acepta `otakuzone_db` |
| `DB_USER` | Usuario SQL runtime completo, incluido el prefijo real de instancia |
| `DB_PASSWORD` | Secreto que solo se configurará en una etapa autorizada, fuera de Git/chat |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Opcional; normalmente innecesaria con CA incorporadas de Node |
| `DB_POOL_SIZE` | Propuesta inicial 2–5, sin modificar el valor local |
| `DB_CONNECT_TIMEOUT_MS` | Inicial actual 5000; revisar latencia/cold start antes de elevarlo |
| `NODE_ENV`, `AUTH_ENABLED`, `CATALOG_SOURCE` | En despliegue futuro: production, true y mysql, respectivamente |

Estos son nombres DB_* que **sí entiende el proyecto**, no los nombres TIDB_* del tutorial. No se creó un `.env` nuevo ni se completó una plantilla con host, usuario o contraseña ficticios. El límite Zod de DB_USER es 32 caracteres: comprobar la longitud completa con prefijo; si no cabe, ajustar ese límite con autorización o elegir un nombre válido más corto, sin truncarlo.

### Pool y consumo de conexiones

Pool actual: máximo 5 por defecto (configurable 1–20), cola 20, keep-alive, timeout de conexión 5 s, strings para bigint/DECIMAL, UTC del driver y múltiples sentencias desactivadas. Con catálogo mysql y auth habilitada, `server.js` reutiliza el mismo pool; no son 5 para catálogo más 5 para auth.

Starter gratuito admite 400 conexiones concurrentes. El endpoint público AWS tiene timeout inactivo de 340 s que TCP keep-alive no evita; también se advierten cortes de conexiones largas y se recomienda comenzar con vida máxima de unos 5 minutos. Transacciones no pueden superar 30 minutos. [Límites de conexiones y transacciones](https://docs.pingcap.com/tidbcloud/serverless-limitations/).

**Riesgo confirmado de configuración:** no hay política propia de vida máxima. En mysql2 3.24.6 instalado, `maxIdle` toma por defecto connectionLimit; el temporizador de retiro de inactivas en `lib/base/pool.js` solo se activa si maxIdle < connectionLimit. Por ello no basta con asumir que el default idleTimeout=60000 retirará estas conexiones. Proponer, sin implementar, límites de inactividad/maxIdle y una estrategia de retiro por edad compatible con el driver. No reciclar conexiones en mitad de una transacción ni añadir un keep-alive SQL periódico que gaste RU para evitar el escalado a cero.

Estimación de capacidad, no medición remota:

| Escenario futuro | Máximo estimado |
| --- | --- |
| Un proceso backend, pool 5 | Hasta 5 conexiones abiertas, creadas bajo demanda |
| Backend + un migrador dedicado + una sesión operativa | Aproximadamente 7 |
| Dos procesos coincidentes durante reinicio/despliegue, más esas dos sesiones | Aproximadamente 12 |

Fórmula: procesos × pool + migradores + sesiones de administración/prueba. La cola 20 no representa conexiones adicionales. No dimensionar el pool a 400 solo porque el plan lo permite. Mapear desconexiones/cuota a errores controlados también requiere ensayo: el código actual no clasifica todos los errores de servicio/TiDB y podría responder 500 en algunos casos.

## 6. Autenticación, sesiones y privilegios

### Integridad de cuentas y sesiones

JWT, bcrypt y CSRF se ejecutan en Node y no necesitan reemplazarse por adoptar TiDB. El registro inserta usuario y sesión en una transacción; login crea sesión; cada petición autenticada consulta sesión no revocada, no expirada y usuario activo; logout marca revocada_en. Una caída/cuota de base impide autenticar: no debe introducirse fallback permisivo.

La collation de email afecta registro duplicado y búsqueda de login. Elegir `utf8mb4_0900_ai_ci` perdería sensibilidad a acentos; elegir binaria cambiaría comparación respecto a MySQL actual. Propuesta: definir primero el contrato de correo y escoger una estrategia equivalente comprobada; si no hay equivalencia directa, explicar el cambio y obtener autorización. No implementar una sustitución silenciosa.

Hay que verificar UTC del servicio/conexiones y precisión de fechas: el driver usa Z y las transacciones fijan UTC, pero eso no prueba los defaults CURRENT_TIMESTAMP de todas las sesiones. El reloj de Node determina expira_en y el de TiDB valida vigencia. No hay tarea actual de limpieza de sesiones; crecimiento e índices consumen espacio/RU.

### Usuarios SQL y permisos mínimos

No confundir roles CLIENTE/ADMIN de OtakuZone con usuarios SQL o permisos de la consola TiDB. El registro web no debe crear usuarios de base de datos.

Los dos archivos de provisioning están diseñados para MySQL local: nombres sin prefijo, host `127.0.0.1`, `IDENTIFIED BY RANDOM PASSWORD` y grants granulares. **No son plantillas ejecutables certificadas para Starter.** La documentación exige prefijo al usar/crear un usuario SQL. No se verificó soporte de la variante RANDOM PASSWORD; no extrapolarla desde MySQL ni ejecutar esos scripts para probarla. [Prefijo de usuario](https://docs.pingcap.com/tidbcloud/select-cluster-tier/#user-name-prefix), [CREATE USER](https://docs.pingcap.com/tidb/stable/sql-statement-create-user/).

Proponer identidades separadas de bootstrap/migración y runtime. La primera necesita CREATE/ALTER/INDEX/REFERENCES y lectura/escritura del ledger y seeds; capacidad de crear usuarios/grants solo para el operador que los prepare. Runtime requiere SELECT sobre tablas usadas, INSERT de registro/sesiones/carrito/pedidos/historial/inventario de administración, UPDATE de los campos autorizados y DELETE de líneas propias de carrito; no CREATE USER, DDL, escritura de roles, cambios de password_hash existentes ni ledger.

El provisioning revisado ya describe una buena separación local, pero **no ampliar grants a nivel de tabla sin advertirlo** si el servicio no admite granularidad por columna. TiDB documenta privilegios por columna desde v8.5.6: la versión efectiva y su disponibilidad en Starter deben comprobarse antes de prometer los mismos grants. [Column-Level Privilege Management](https://docs.pingcap.com/tidb/stable/column-privilege-management/).

Para la futura cuenta runtime, separar mantenimiento de sesiones antiguas del privilegio DELETE ordinario de la aplicación. No conservar root como credencial del servidor público.

### Nuevo riesgo por dominios gratuitos

La arquitectura pedida ahora usa los dominios gratuitos de Vercel y Render, en lugar del dominio propio de Etapas 1/2. Son sitios independientes. **La cookie Lax actual no sostendrá las llamadas autenticadas directas entre ambos.** TiDB no cambia ese comportamiento.

Recomendación para una etapa posterior: evaluar proxy de `/api/v1` a través del origen frontend, manteniendo cookie HttpOnly/Secure/Lax, CSRF y sesión revocable. Requiere autorizar el ajuste de validación de bases API, pues actualmente exige URLs absolutas HTTPS, y colocar el rewrite API antes del fallback SPA; comprobar Cookie/Set-Cookie/Origin y no-cache. No se implementa ahora. SameSite=None con Secure permitiría el escenario cross-site en algunos navegadores, pero las restricciones de terceros lo hacen menos fiable. [Reglas de cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

No se avanza a Render/Vercel ni se presume que la arquitectura previa ya resuelve la nueva decisión de dominios.

## 7. Gratuidad, límites y estimación de consumo

Para **una instancia MySQL-compatible elegible**, la documentación indica **5 GiB row storage, 5 GiB columnar y 50 millones RU/mes**, hasta cinco instancias gratuitas por organización. La página comercial resume 25/25 GiB y 250 M RU a nivel de organización, pero su nota aclara la cuota por instancia: no asignar todo ese total a OtakuZone. [Pricing y nota de Starter](https://www.pingcap.com/pricing/).

Mantener el plan gratuito sin método de pago, sin Marketplace y sin aumentar el spending limit. Al agotar cuota se rechazan conexiones nuevas y se limita actividad existente; no resolverlo activando facturación. Si la interfaz exige tarjeta o un importe positivo, detener el procedimiento. Estas condiciones deberán reconfirmarse antes de crear recursos. [Spending limits](https://docs.pingcap.com/tidbcloud/manage-serverless-spend-limit/).

La matriz específica de Starter no ofrece BACKUP/RESTORE SQL ni IMPORT INTO; esto no implica ausencia de toda recuperación gestionada. No hay que diseñar backups suponiendo comandos o privilegios de un MySQL autoadministrado. Definir después un mecanismo gratuito de exportación/restauración y comprobar límites de la consola. [SQL limitado en TiDB X](https://docs.pingcap.com/tidbcloud/limited-sql-features-tidb-x/).

RU **no equivale a una consulta SQL**. Incluye lecturas/escrituras internas, CPU y egreso. El precio documenta, entre otros factores, 3 ms CPU/RU y 1 KiB de lectura de egreso por RU en endpoint público; los factores se suman. [Detalle de medición](https://www.pingcap.com/tidb-cloud-starter-pricing-details/).

Estimaciones propias para 30 días, **sin medición ni promesa de coste**, usando una hipótesis de RU media total por petición HTTP que usa base de datos:

| Peticiones DB/día | RU medias supuestas/petición | RU/mes estimadas |
| --- | --- | --- |
| 1 000 | 20 | 600 000 |
| 10 000 | 50 | 15 000 000 |
| 30 000 | 100 | 90 000 000: supera 50 M |

La media debe medirse en el panel en un ensayo autorizado; una petición puede ejecutar varias sentencias. Una respuesta SQL de 20 KiB ya aporta aproximadamente 20 RU solo por egreso público. No convertir estos escenarios en un número garantizado de usuarios soportados.

El catálogo inicial tiene 12 productos, 5 categorías y 2 promociones: sus datos textuales deberían ocupar mucho menos que 5 GiB, sin estimar un tamaño físico exacto. Las imágenes del frontend no se almacenan en TiDB. Crecerán usuarios, sesiones, pedidos, detalles e índices. Contar fila+índices, no únicamente longitud del JSON. La cuota columnar no amplía la cuota row ni es necesaria para estas consultas transaccionales.

AniList se consulta por HTTPS fuera de la base: esas llamadas no consumen directamente RU TiDB, aunque peticiones autenticadas de la aplicación sí pueden consultar sesiones. No añadir polling SQL para mantener despiertos servicios; tratar con normalidad límites/cold starts y fallos temporales.

## 8. Cambios mínimos propuestos — NO implementados

| Prioridad | Propuesta | Impacto que requiere autorización |
| --- | --- | --- |
| Bloqueante | Reconocer TiDB y comprobar capacidades en lugar del mínimo MySQL únicamente | Modifica arranque, migrador y verificadores; debe seguir rechazando motores sin garantías |
| Bloqueante | Resolver collation email y bootstrap TiDB versionado | Puede cambiar igualdad/unicidad de cuentas; requiere diseño e historial de checksums explícito |
| Bloqueante condicionado | Preflight de CHECK/FK, permisos y metadatos | Si requiere habilitar una variable global, esa operación remota necesita autorización adicional; si no es posible, detener |
| Alta | Provisioning específico Starter con prefijo y grants mínimos | Crea identidades remotas solo en etapa autorizada; no ejecutar SQL local directamente |
| Alta | Política de retiro de conexiones y errores temporales | Cambia ciclo del pool; debe preservar transacciones/idempotencia |
| Condicional | Ajustar DB_USER máximo si la identidad completa supera 32 | Solo validación, sin truncar credenciales |
| Condicional | Reescribir GROUP BY si el motor objetivo lo requiere | Mantener mismos totales/campos; no desactivar modo SQL |
| Publicación futura | Resolver cookie cross-site mediante proxy de mismo origen | Cambios frontend/hosting fuera de esta auditoría y sujetos a autorización |

No hace falta sustituir mysql2, JWT, bcrypt ni JSON de APIs. **No se ha sustituido MySQL por JSON Server**: el smoke usa el fixture demo existente de Express únicamente para probar HTTP local sin abrir una base; no representa el almacenamiento productivo.

## 9. Resultado de validaciones

| Comando/comprobación | Resultado actual |
| --- | --- |
| `npm run lint` | Aprobado |
| `npm test` en raíz | **22/22 aprobadas** |
| `npm test` en backend | **33/33 aprobadas** |
| `npm run build:local` | Aprobado, 2181 módulos, dist-local |
| `npm run check:local` | Aprobado: configuración validada sin abrir MySQL, módulos React, HTML/ruta profunda/preview y API demo Express |
| Recuento SQL/checksums | 7 archivos leídos, 16 tablas de aplicación, 18 FK, 20 CHECK; sin ejecución SQL |
| Control de versión con fixture TiDB | Rechazo reproducido offline; confirma el problema del validador, no una conexión |

Los dos runners de pruebas fallaron inicialmente por `spawn EPERM` del sandbox; las reejecuciones autorizadas fuera de él pasaron. No se ejecutaron scripts de integración que escriban fixtures, pruebas de navegador con cuentas ni npm ci/actualizaciones. No se añadió ninguna prueba nueva en esta etapa, porque no se modificó implementación.

Estas pruebas no demuestran TLS real, grants, aplicación de restricciones ni concurrencia TiDB. Tampoco prueban login real o recuperación tras agotamiento de RU. El build productivo no es objeto de esta validación y sigue requiriendo la configuración final de API.

## 10. Procedimiento posterior recomendado — NO ejecutado

1. **Autorizar primero los ajustes concretos de compatibilidad**, tras acordar contrato de email, historial/migraciones TiDB y preservación del MySQL local. No basta con autorizar “conectar” para saltarse esos problemas.
2. Implementar y revisar dichos ajustes en código, con pruebas offline y sin ejecutar migraciones. Añadir preflight de motor/restricciones y documentación de recuperación DDL parcial. Mantener el migrador fuera del arranque HTTP.
3. Con autorización separada para crear recursos, abrir TiDB Cloud por el usuario y elegir Starter **MySQL compatible** gratuito. Confirmar cuota y coste cero; no tarjeta, facturación, trial de pago ni Marketplace. Si no se ofrece una opción gratuita válida, detenerse sin cambiar de proveedor.
4. Elegir región/proveedor disponibles para Starter según latencia futura, sin contratar complementos. Registrar solo los parámetros reales de Connect en un canal seguro; no subir capturas con secretos ni introducirlos en chat o repositorio.
5. Autorizar una conexión inicial **solo de lectura** con TLS verificado. Comprobar VERSION/TIDB_VERSION, nombre/esquema vacío, collations, variables CHECK/FK, UTC/sql_mode, metadatos y SHOW GRANTS. Comprobar también prefijo/longitud de usuario. No ejecutar el migrador para descubrir estos valores.
6. Si falta enforcement y su activación es admisible, presentar el cambio administrativo concreto y obtener permiso antes de aplicarlo. Si Starter no permite conservar la integridad requerida, informar y detenerse, sin retirar restricciones ni cambiar proveedor.
7. Con autorización expresa de provisioning, preparar usuarios SQL separados y grants revisados según versión real; guardar credenciales fuera de Git. Confirmar que runtime no puede ejecutar DDL, cambiar roles o administrar cuentas.
8. Con autorización expresa para escribir en una base aislada nueva de ensayo, ejecutar **el migrador adaptado y revisado**, con un solo operador, lock, manifest y hashes correctos. No copiar un comando db:migrate actual como si ya fuera compatible. No tocar la base local.
9. Revisar DDL real, ledger/checksums, 17 tablas, 18 FK y 20 CHECK efectivos. Autorizar después pruebas de integridad/concurrencia con datos propios: duplicados de email, rollback, sesiones/revocación/expiración, subtotal y stock, exclusión de carrito/plan e idempotencia de pedidos. Definir limpieza explícita; no ejecutar los scripts QA heredados sin revisar su alcance.
10. Ensayar recuperación/exportación gratuita y registrar RU/almacenamiento/latencia antes y después. Ajustar pool dentro de los límites sin aumentar gasto. Definir respuesta al agotamiento: limitar uso/esperar renovación de RU, no activar pagos automáticamente; una cuota de almacenamiento requiere reducir/gestionar datos con autorización.
11. Presentar evidencia y pendientes. El paso a Render/Vercel y la solución de cookies en dominios gratuitos requiere otra autorización. No crear esos servicios dentro de esta etapa.

## Cierre

Auditoría completada; preparación documental disponible. **TiDB Starter es un candidato viable con ajustes y validación, no un reemplazo transparente ya certificado.** No se implementó ningún cambio de compatibilidad. Se espera autorización expresa para continuar.
