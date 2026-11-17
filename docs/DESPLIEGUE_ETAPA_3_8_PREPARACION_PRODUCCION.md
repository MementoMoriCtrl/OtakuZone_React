# OtakuZone — Etapa 3.8: preparación final para TiDB y producción

Fecha: **16 de noviembre de 2026**. Alcance: auditoría estática y configuración propuesta. **Sin conexiones SQL, migraciones, pruebas repetidas, modificaciones de código o despliegues.** Único archivo creado: este informe.

## 1. Estado actual y decisión práctica

**La instancia está preparada para avanzar; el repositorio aún tiene bloqueos explícitos de migración y arranque.** El siguiente paso útil es una implementación acotada de catálogo/migrador/preflight TiDB y rewrite Vercel, previa autorización. No hace falta otra ronda general de investigación de regex ni repetir el corpus de email ya completado.

Se acepta como evidencia aportada por el usuario: TiDB Starter 8.5.3 operativo; collation `utf8mb4_0900_bin`; CHECK/FK habilitados; modo pesimista; esquema `otakuzone_email_probe` y tabla creados, CHECK registrado, UNIQUE con Non_unique=0 e inserción válida realizada. No se publica la dirección personal. **No se consultó ni modificó ese esquema.**

La creación exitosa del CHECK ya resuelve la duda de admisión del DDL en esa tabla. No se vuelve a presentar como impedimento desconocido. En cambio, la evidencia entregada no incluye rechazo por CHECK de un INSERT inválido ni rechazo de duplicado por UNIQUE: basta una confirmación mínima de cada uno si todavía no existe, no repetir las doce filas ni miles de fixtures. El esquema de ensayo no equivale al esquema completo de la aplicación.

Se inspeccionaron las siete migraciones, manifests/ledger, migrador, entrada alternativa de 007, config/env/auth/proxy, pool/ciclo de vida, detector/preflight, arranque, errores, SQL auth, rutas/protecciones y configuración Vite/Vercel. Se distinguen hechos del código de los datos remotos confirmados por el usuario.

## 2. Bloqueos reales, por orden de resolución

| Prioridad | Bloqueo confirmado en repositorio | Efecto | Cambio mínimo posterior |
| --- | --- | --- | --- |
| 1 | `database/tidb/manifest.json`: blocked, migrations=[]; lector solo admite ese estado reservado | No existe bootstrap TiDB ejecutable | Crear catálogo propio aprobado con SQL/hashes/procedencia; actualizar lector/guardias mediante revisión coherente |
| 2 | `db/migrate.js` usa `schema_migrations`, bootstrap MySQL y referencias fijas a otakuzone_db | Cambiar solo status no hace al migrador compatible con el ledger TiDB | Usar ledger/bootstrap por catálogo, mantener separación de dialectos e historial MySQL intacto |
| 3 | `tidbPreflight.js` exige `utf8mb4_0900_as_ci` y termina runtime con fallo incondicional | El backend no llega a listen aunque TiDB esté operativo | Aceptar contrato A aprobado con binaria + CHECK/UNIQUE verificados; retirar el bloqueo final solo con catálogo/esquema coherentes |
| 4 | Solo está confirmado el schema de ensayo; faltan evidencia de schema de aplicación e historial aplicado | Arranque consulta auth_sesiones, historial_pedidos, movimientos_inventario y columnas de pedidos | Preparar y ejecutar posteriormente migración autorizada sobre destino de aplicación, nunca adoptar el probe |
| 5 | DB_ENGINE y selectores de producto son independientes | DB_ENGINE=tidb no obliga por sí solo a catálogo SQL/auth | Configuración explícita production + DB_ENGINE=tidb + CATALOG_SOURCE=mysql + AUTH_ENABLED=true; añadir guardia productiva después |
| 6 | `vercel.json` tiene únicamente fallback SPA; frontend necesita base API productiva válida | `/api/v1` en Vercel devuelve HTML sin proxy; llamadas directas a Render son cross-site | Rewrite API hacia Render antes del fallback, tres bases VITE al propio origen frontend |
| 7 | Orígenes/endpoints reales, identidad runtime y TRUST_PROXY no están fijados/verificados en esta revisión | Sin panel configurado/TLS/grants no hay conexión segura ni rate limiting fiable por cliente | Completar parámetros reales en hosting, revisar permisos y cadena de proxies; no inventar valores |

**No son bloqueos de rediseño:** sustituir mysql2, JWT, bcrypt o cookies; obtener dominio propio para usar el proxy; cambiar SameSite a None; consultar mysql.tidb con privilegios ampliados; repetir el estudio completo de collations. Ninguno es necesario para resolver los bloqueos anteriores.

## 3. Migraciones: qué necesita adaptación

Los archivos MySQL **001–007 y sus hashes deben conservarse**. «Adaptar» significa nuevas fuentes del catálogo TiDB con hash del SQL realmente ejecutado y vínculo al original; no cambiar la historia aplicada ni insertar hashes MySQL en un ledger TiDB ficticio.

| Fuente | Adaptación mínima para TiDB | Evaluación actual |
| --- | --- | --- |
| 001_create_database.sql | Definir destino de aplicación y bootstrap por dialecto; revisar CREATE DATABASE/privilegios | CREATE DATABASE no es incompatibilidad universal. Nombre actual fijo otakuzone_db es elección del ejecutor, no exigencia Starter |
| 002_relational_schema.sql | **Obligatoria:** email `utf8mb4_0900_bin` y CHECK canónico exacto ya ensayado documentalmente; mantener NOT NULL/UNIQUE completo | Es el cambio SQL de compatibilidad inequívoco; resto del esquema conserva FK, CHECK, generadas e índices |
| 003_roles_and_plans.sql | No se detecta reescritura de sintaxis necesaria; identificar como seed del catálogo TiDB | Roles cliente/administrador son necesarios para registro; planes son demo. No crea usuarios SQL ni cuentas web |
| 004_demo_catalog.sql | Sin incompatibilidad de sintaxis identificada; aprobar contenido demo inicial explícitamente | No eliminar funcionalidad ni omitir seeds sin decisión. Texto histórico Jikan no es dependencia de conexión |
| 005_auth_sessions.sql | Sin cambio de sintaxis obligatorio identificado; incorporar al catálogo y garantizar UTC/FK/CHECK | Necesaria para auth real; el probe no contiene sesiones |
| 006_commerce.sql | Mantener ALTER, UNIQUE/FK, historial y backfill en plan TiDB revisado | DDL + backfill no son atómicos en conjunto; documentar estado parcial y no repetir a ciegas |
| 007_admin_inventory.sql | Sin cambio de sintaxis obligatorio identificado; ejecutar por catálogo TiDB, no script MySQL alternativo | CREATE sin IF NOT EXISTS requiere recuperación específica si DDL queda aplicado sin ledger |
| bootstrap/ledger.sql | **Obligatoria:** ledger TiDB propio `schema_migrations_tidb` y soporte real en migrador | El bootstrap actual crea schema_migrations; cambiar manifest no basta |

No se detectaron otros cambios SQL obligatorios por mero uso de TiDB. Esto no certifica la ejecución del esquema completo. Conservar DECIMAL/BIGINT, tipos/columnas generadas y restricciones de negocio; no sustituirlas por validación React. La equivalencia operativa del modelo completo se valida una vez al migrar el destino autorizado, sin repetir el laboratorio de email.

Solo 003/004 se declaran transactional en el manifest MySQL; 001/002/005/006/007 contienen DDL. No poner migraciones en build/start de Render. `apply-admin-schema.js` fuerza MySQL y schema_migrations: conservarlo como herramienta MySQL o proteger claramente su alcance; no usarlo como atajo TiDB.

## 4. mysql2, TLS, pool, versión y preflight

### Conexión y separación local/productiva

- mysql2 3.24.6 sigue siendo el driver; TiDB usa protocolo compatible, con las mismas consultas parametrizadas. No hay fallback de error SQL a MySQL local ni a JSON.
- **MySQL es el default** de DB_ENGINE en `database.js`. Sus defaults locales de host/puerto siguen intactos. Producción exige host explícito/TLS; TiDB exige TLS incluso fuera de production, hostname y usuario prefijado no root.
- **Matiz confirmado:** `CATALOG_SOURCE` decide demo/mysql; `AUTH_ENABLED` decide cargar auth. Si se omiten, los defaults son demo/false y DB_ENGINE puede ni siquiera leerse. Si catálogo=demo y auth=true, auth usa TiDB pero catálogo sigue demo. Por eso no puede afirmarse exclusividad productiva solo con DB_ENGINE=tidb. Usar la combinación explícita de §6 y preparar guardia para impedir mezcla accidental en producción.
- En production `loadEnvironment()` no carga backend/.env; Render debe definir todas las variables necesarias. No copiar archivos privados locales ni el ejemplo productivo sin cambiar su selector mysql/3306.

### TLS/CA y timeouts

Pool y migrador comparten `databaseTlsOptions`: DB_SSL=true activa verificación obligatoria `rejectUnauthorized=true`. DB_SSL_CA es **contenido PEM**, no ruta; admite saltos reales o `\n` literales. Con CA pública reconocida por Node puede omitirse. Mantener hostname de Connect y no usar IP ni desactivar verificación. [TLS Starter](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/), consultado el 2026-11-16.

Propuesta inicial: pool **2**, timeout conexión **5000 ms**, idle **60000 ms**, vida máxima suave **300000 ms**. Son valores existentes admitidos por el código, no una medición de latencia Render–Tokyo. Mantener 5 s salvo error real de conexión/cold start; no subir timeouts indiscriminadamente. HTTP auth frontend tiene timeout 15 s; servidor requestTimeout=30 s y headersTimeout=15 s. No hay timeout de ejecución/lock SQL configurado por aplicación; revisarlo solo si un caso real lo exige, sin añadir reintentos.

TiDB configura maxIdle=pool−1 para activar retiro de inactivas, cola 20 y keep-alive. Retiro por edad destruye solo conexiones libres; no corta transacciones. Con catálogo SQL y auth se comparte un pool; no hay dos pools obligatorios. Un proceso con pool 2 usa hasta dos conexiones; dos procesos solapados más migrador/operador: aproximadamente seis. No llevar el pool al límite del proveedor. El endpoint público tiene límites de inactividad; keep-alive no reemplaza la política de retiro. [Límites Starter](https://docs.pingcap.com/tidbcloud/serverless-limitations/).

### Identidad, integridad y UTC

| Control actual | Conclusión / ajuste posterior |
| --- | --- |
| Detector reconoce sufijo -serverless y TiDB >=7.4 | El banner 8.5.3 aportado encaja; requiere además TIDB_VERSION con release/Edition coincidentes y variable propia. No rechaza 8.0.11 por confundirlo con versión MySQL |
| Motor observado debe coincidir con DB_ENGINE | Conservar: nunca fallback a otro dialecto |
| Preflight consulta CHECK/FK global, foreign_key_checks/mode/UTC/sql_mode de sesión | Conservar integridad y fallo explícito. Confirmación de consola no garantiza cada nueva sesión runtime |
| Exige as_ci | Cambiar a contrato TiDB aprobado binario + CHECK canónico y UNIQUE completo; no cambiar MySQL local |
| Restricciones esperadas se derivan del SQL MySQL | Derivar del catálogo TiDB aprobado: debe incluir el **nuevo CHECK email**, no limitarse a las veinte CHECK históricas/18 FK |
| Ledger TiDB requerido pero validación runtime termina con fallo fijo | Revisar ledger real/checksums/esquema y habilitar de forma coherente; no fabricar filas para pasar |
| Driver timezone=Z y transacciones hacen SET SESSION time_zone | Z no establece UTC del servidor. Lecturas fuera de transacción y conexiones nuevas necesitan política explícita de sesión/garantías verificadas |

El preflight actual **no consulta mysql.tidb**; no hay que añadir ese permiso como requisito. También falta comprobar collation/NOT NULL/UNIQUE y cláusula email reales como contrato, en vez de aceptar solo un nombre de collation. La política futura de conexión debe validar/aplicar UTC y modos autorizados antes de prestar cada sesión, conservando CHECK/FK y pesimista. No ejecutar SET GLOBAL ni ampliar modos automáticamente en esta etapa.

## 5. Errores, cookies, proxy y seguridad

### Errores de base y observabilidad

`db/errors.js` traduce fallos de transporte/acceso/base/conexiones conocidos a 503 redactado. Otros errores quedan para reglas de negocio o handler 500 genérico; el log imprime código/nombre, no SQL completo. Registro captura ER_DUP_ENTRY y devuelve 409; administración contempla duplicados/FK. No todos los errores CHECK, conflictos TiDB o cuota tienen clasificación específica. Si llegan con códigos nuevos pueden ser 500, sin que eso permita acceso inseguro.

Corrección recomendada acotada: centralizar clasificación por códigos/errno observados, distinguir 1062 de CHECK/FK y de error temporal; no etiquetar 8147/9007 siempre como email duplicado ni devolver mensajes del driver con datos personales. Conservar rollback, destrucción ante fallo de transporte y ausencia de replay. No cambiar autenticación para ocultar indisponibilidad.

Health `/api/v1/health` es liveness estático, no readiness continua de TiDB; pasa por rate limiting. Arranque sí comprueba base/esquema antes de escuchar. Mantener esta limitación visible en Render; no convertir un health verde en evidencia de registro/login funcional.

### Proxy mínimo en Vercel, sin cambiar cookies

Arquitectura prevista: navegador → origen frontend Vercel `/api/v1/...` → rewrite HTTPS a Render `/api/v1/...` → TiDB TLS. No utilizar el esquema probe como DB_NAME.

El `vercel.json` actual solo reescribe todo a index.html. Añadir posteriormente una regla específica `/api/v1/:path*` al mismo sufijo del origen Render **antes** del fallback SPA; incluir `/api/v1` sin sufijo si no queda cubierto. El destino será fijo y confirmado, nunca tomado de parámetros del cliente. Vercel documenta rewrites externos y control de caché. [Rewrites oficiales](https://vercel.com/docs/routing/rewrites).

**Ajuste mínimo importante:** el resolvedor actual ya permite URLs HTTPS absolutas. Las tres variables VITE pueden apuntar a **ORIGEN_FRONTEND_CONFIRMADO + `/api/v1`**, que sigue siendo mismo origen para el navegador y pasa la validación existente. No es necesario cambiar ahora `src/config/api.js` para admitir bases relativas. Una alternativa futura `/api/v1` relativa exigiría modificar el validador; no es imprescindible para publicar con un hostname frontend estable.

Conservar cookie productiva `__Host-otakuzone_session`, HttpOnly, Secure, SameSite=Lax, Path=/, sin Domain; el navegador la recibe en el origen frontend por el proxy. Mantener Cookie/Set-Cookie y su borrado, múltiples cabeceras, Origin, X-OtakuZone-CSRF, Content-Type, métodos/cuerpo, status y Retry-After. No traducir errores API a HTML. No reescribir Origin para eludir CSRF.

Express ya devuelve Cache-Control:no-store global. Evitar reglas Vercel que lo anulen y desactivar explícitamente caché de rewrites API cuando se configure (`x-vercel-enable-rewrite-caching: 0`, según documentación vigente); no cachear sesión, cookies, respuestas autenticadas o errores. La preservación real de cabeceras se comprueba una vez en el smoke final.

CORS_ORIGINS debe contener solo el origen HTTPS real de frontend (sin `/api/v1` ni slash final). CORS permite ausencia de Origin para lecturas, pero las mutaciones exigen Origin permitido/JSON/cabecera y token de sesión donde corresponde. No añadir comodines, previews arbitrarios ni origen Render por el hecho de que sea destino del rewrite. Fetch auth conserva credentials:include.

TRUST_PROXY admite false o IP/CIDR explícitos; rechaza true y conteos. Con false, detrás de Render puede agrupar usuarios y limitar el servicio en conjunto. Debe identificarse la cadena Vercel→Render→Express y acceso directo Render antes de elegir valores; una lista de salida de Render hacia TiDB no equivale a proxies entrantes. No inventar direcciones ni usar true. Express exige que la confianza corresponda a la topología real. [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/).

No se requieren cambios a bcrypt, JWT, CSRF, roles o opciones locales de cookies. Los dominios gratuitos independientes con fetch directo Vercel→Render no son el diseño final con Lax; el proxy de mismo origen resuelve ese límite sin cambiar a SameSite=None.

## 6. Configuración final requerida

### Render: servicio futuro, sin crearlo

Root Directory **backend**, Node **24.x**, build **npm ci --omit=dev**, start **npm start**, health **/api/v1/health** con el límite de liveness descrito. HOST=0.0.0.0 y PORT dinámico del hosting; no fijar 4000/3306/4000 de DB como puerto HTTP. Render exige escucha pública en 0.0.0.0. [Web Services](https://render.com/docs/web-services).

La plantilla `backend/.env.production.example` sigue siendo no operativa y selecciona mysql/3306: **no copiarla sin completar/corregir valores de panel**. No se edita en esta auditoría.

| Variable Render | Valor/criterio final, sin credenciales |
| --- | --- |
| NODE_ENV | `production` antes de arrancar Node |
| HOST | `0.0.0.0` |
| PORT | Variable dinámica de Render; dejar que el servicio la suministre |
| DB_ENGINE | `tidb`, explícito |
| CATALOG_SOURCE | `mysql`: selector del repositorio mysql2, no selección del fabricante del servidor |
| AUTH_ENABLED | `true` |
| DB_HOST | Hostname real de Connect, no IP/localhost; pendiente en este informe |
| DB_PORT | Puerto real de Connect; Starter suele usar 4000, confirmar dato real; no default local 3306 |
| DB_NAME | Esquema completo de aplicación aprobado; nombre actual previsto `otakuzone_db`; nunca `otakuzone_email_probe` |
| DB_USER | Usuario runtime completo con prefijo real; no root; debe cumplir validador actual y máximo 32 caracteres |
| DB_PASSWORD | Secreto privado de ese usuario en Render; sin valor en chat/Git/documentación |
| DB_SSL | `true` |
| DB_SSL_CA | Opcional: omitir si cadena reconocida por Node; si se requiere, contenido PEM del proveedor, no ruta |
| DB_POOL_SIZE | Propuesta inicial `2`, rango TiDB actual 2–5 |
| DB_CONNECT_TIMEOUT_MS | `5000` inicial; ajustar solo ante latencia/fallo medido |
| DB_POOL_IDLE_TIMEOUT_MS | `60000` |
| DB_POOL_MAX_LIFETIME_MS | `300000`, retiro suave sin cortar préstamos activos |
| CORS_ORIGINS | Origen HTTPS frontend confirmado, sin rutas; allowlist exacta |
| TRUST_PROXY | IP/CIDR de proxies entrantes verificados; valor pendiente. false conserva fallback seguro pero no certifica rate limiting por cliente |
| JWT_SECRET | Secreto criptográfico privado de al menos 64 caracteres, estable entre reinicios/réplicas |
| JWT_TTL_SECONDS | `1800` inicial, rango permitido 300–3600 |
| BCRYPT_ROUNDS | `12` inicial, rango 10–14 |
| AUTH_RATE_MAX | `10` |
| AUTH_RATE_WINDOW_MS | `900000` |
| RATE_LIMIT_MAX | `120` |
| RATE_LIMIT_WINDOW_MS | `60000` |

No requiere credenciales AniList: el backend mantiene endpoint fijo HTTPS, timeout/caché/cola propios. DEMO_DATA_PATH no se necesita con catálogo SQL. Issuer/audience, nombre de cookie y SameSite no son variables configurables actuales: no inventar JWT_ISSUER, COOKIE_DOMAIN u otras opciones que el código no lee.

DB_USER largo o patrón de prefijo distinto al validador actual constituye incompatibilidad **condicional real**: verificar la identidad elegida antes de publicarla. No truncar nombres ni usar root por comodidad. No usar la cuenta de migración en el servidor HTTP. Grants runtime/migrador requieren revisión efectiva; no ejecutar provisioning MySQL local sobre Starter.

### Vercel y parámetros pendientes

Raíz repositorio, Vite, Node 24.x, npm ci → npm run build → dist. Mantener build:local/dist-local fuera del despliegue. Configurar **VITE_AUTH_API_URL, VITE_OTAKUZONE_API_URL y VITE_ANIME_API_URL** con exactamente la misma base absoluta HTTPS del **frontend** + `/api/v1`, una vez confirmado su hostname estable y añadido el rewrite. Estas variables son públicas; nunca DB_PASSWORD o JWT_SECRET en VITE_*.

Faltan valores reales de origen frontend/origen Render y cadena de proxies; no se afirma disponibilidad/asignación de nombres sugeridos en etapas previas. No hace falta comprar dominio ni configurar DNS propio para esta solución. Previews deben aislarse de auth productiva o tener una política de origen explícita; no añadirlos automáticamente a CORS.

## 7. Orden recomendado de implementación y despliegue

1. **Autorizar un lote de código concreto**, no otra auditoría: catálogo SQL TiDB con cambio de 002/ledger, migrador por dialecto, preflight de contrato A e integridad por sesión, guardia de selectores productivos y rewrite API. Mantener archivos privados/001–007/local intactos. Revisar errores observados sin reintentos ciegos.
2. Aprobar esquema de aplicación, contenido inicial y usuarios SQL/grants mínimos. Mantener probe intacto; no copiar su cuenta ni fabricar historial. No crear usuarios en esta etapa.
3. Ejecutar solo los checks automatizados afectados por esos cambios y un build productivo con el origen final. Las suites que ya pasaron no se repiten por este informe; después de modificar implementación sí son regresión pertinente, sin nueva matriz exploratoria.
4. Con autorización separada de escritura, realizar el bootstrap/migración **una vez**, con migrador adaptado, identidad separada, hashes y plan de recuperación. No usar build/start para ello. Verificar ledger y estructura completa inmediatamente, sin tocar MySQL local ni eliminar el probe.
5. Configurar parámetros reales y secretos en Render, TLS y política de sesión. Con autorización de despliegue, iniciar backend y comprobar arranque/preflight/schema/health. Si falla, resolver evidencia concreta; no bajar CHECK/FK/modos ni introducir fallback demo.
6. Con origen Render confirmado, configurar rewrite y bases frontend al origen Vercel, CORS exacto y TRUST_PROXY basado en la cadena observada. No hace falta cambiar opciones de cookie para el proxy.
7. Con autorización de despliegue frontend, ejecutar un smoke mínimo de navegador por el proxy y un flujo autenticado con cuenta de prueba autorizada. Comprobar JSON/Set-Cookie/no-store/Origin/CSRF/login/logout y rol restringido. No se crea ni modifica ninguna cuenta sin ese alcance de prueba aprobado.
8. Publicar solo tras esos resultados, documentar backups/recuperación y cuotas. Evitar polling para mantener despiertos servicios o activar pagos. Si aparece fallo real, corregirlo y repetir únicamente su verificación/regresión relacionada.

## 8. Verificaciones mínimas pendientes y riesgos aceptables

**No repetir**: disponibilidad de collation, reconocimiento de funciones, creación del probe, registro de CHECK/UNIQUE, inserción válida y SELECT de patrones confirmados. Tampoco repetir 2.580/4.493 casos offline ni abrir otra discusión de escapes.

Pendiente imprescindible, una sola vez y con alcance autorizado:

- Si el usuario ya tiene evidencia de rechazo negativo y duplicado del probe, incorporarla sin repetir. Si no, basta **un INSERT no canónico rechazado y un duplicado exacto rechazado**, conservando tabla/filas de ensayo; no ejecutar limpieza ni toda la matriz. Tener índice registrado y una inserción válida no demuestra esas dos garantías negativas.
- Tras adaptación/migración: conexión Node/Render TLS con usuario runtime, identidad corroborada, UTC/modos y estructura/ledger de aplicación. Esto valida un entorno nuevo, no repite el ensayo del editor.
- Un smoke del proxy/autenticación y una comprobación focal de atomicidad ante conflicto de registro con datos sintéticos autorizados. No exigir una campaña de carga o catálogo completo de casos antes del primer despliegue académico.

Riesgos no bloqueantes para una publicación de demostración: health estático, caché/rate limits en memoria por proceso, sesiones sin housekeeping, optimización de imágenes pendiente, latencia Tokio y resultado ambiguo de commit que exige conciliación. No presentarlos como resueltos ni añadir rediseños preventivos.

Render Free tiene suspensión/cold starts y límites; su documentación lo orienta a hobby/preview y desaconseja aplicaciones productivas. Conservar presupuesto cero implica aceptar que no hay disponibilidad garantizada y que el timeout frontend puede agotarse en un arranque frío. No contratar un plan automáticamente. [Render Free](https://render.com/docs/free), consultado el 2026-11-16.

Verificación de preservación: la comparación SHA-256 de **301 archivos existentes inventariados**, incluidos entornos privados, no encontró cambios; el único añadido es este informe. Se excluyen `.git`, dependencias instaladas y artefactos build/caché; no se ejecutaron herramientas que los regeneren. No se publican huellas privadas.

**Conclusión:** viable avanzar al lote mínimo de implementación indicado; **no desplegable tal como está el código hoy** por bloqueos de catálogo/migrador/preflight y proxy. La configuración final propuesta está definida en nombres/criterios; faltan datos reales de hosting y permisos. No se realizaron conexiones, pruebas, migraciones, cambios de código/env/seguridad, modificaciones del probe o MySQL, despliegues ni commits. Se detiene la Etapa 3.8 al entregar este informe.
