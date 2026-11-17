# OtakuZone — Etapa 1: auditoría de preparación para producción

Fecha: 16 de noviembre de 2026. Alcance: revisión del repositorio actual para React/Vite en Vercel, Express en Render y MySQL administrado.

**Dictamen: todavía no está listo para publicación pública.** Hay una base de seguridad adecuada, pero faltan decisiones y controles de infraestructura, migraciones, operación y verificación integral. Se recomienda dominio propio con frontend y API en subdominios HTTPS del mismo dominio.

## Alcance y evidencia

- Solo se creó este informe. No se cambió código, configuración local de autenticación ni archivos de entorno.
- No se abrió una conexión a MySQL, ejecutaron migraciones, crearon usuarios, cambiaron contraseñas, desplegaron servicios ni realizaron commits.
- No se reprodujeron valores de los archivos privados `.env`. Los valores de ejemplo de este informe son propuestas o valores públicos del código.
- Árbol Git inicialmente limpio. Revisión de paquetes y lockfiles, configuración, rutas, servicios, repositorios, middleware, SQL y scripts.
- Entorno observado: Node `v24.16.0`, npm `11.13.0`.
- Frontend: `npm test`, **20/20 aprobadas**. Backend: `npm test`, **30/30 aprobadas**. Se reejecutaron con autorización fuera del sandbox tras bloqueo inicial `spawn EPERM`. Usan dobles y HTTP local temporal; no certifican integración con MySQL ni navegadores en hosting real.
- `npm run lint` terminó con código 0. No se ejecutó `npm run build` porque escribe `dist`; la compilación de producción queda pendiente para una etapa autorizada.
- No se instalaron dependencias ni ejecutaron scripts `verify`, auditorías de navegador o `npm audit`. No se certifica ausencia de vulnerabilidades, integridad de instalaciones limpias ni estado de la infraestructura.

## 1. Estado del frontend

### Estructura y dependencias

Aplicación ESM con páginas, componentes, rutas, estado, hooks, validadores y servicios separados. React y React DOM declarados `^19.3.1`, React Router DOM `^7.18.5`; Vite `^8.3.6`, plugin React `^6.1.2`, Tailwind `^4.3.5` y oxlint en desarrollo. Hay `package-lock.json` v3 independiente del backend: usar instalaciones reproducibles con `npm ci` en cada raíz.

El lockfile resuelve Vite `8.3.8` y plugin React `6.3.0`, con requisito Node `^20.19.0 || >=22.12.0`; React Router requiere Node >=20. El Node 24 observado satisface esos rangos. El frontend no declara `engines` ni hay pin compartido de versión: fijar Node 24 compatible y actualizado en ambos hostings. No inferir compatibilidad de instalación únicamente de los rangos: falta `npm ci` y build limpio en Linux.

### Scripts y Vite

`dev` inicia Vite; `build` genera `dist`; `preview` sirve una previsualización; `test` usa el runner de Node; `lint` ejecuta oxlint; `api` inicia JSON Server en loopback: **solo desarrollo**. `check:apis` consulta servicios, no sustituye pruebas automatizadas.

`vite.config.js` únicamente registra React y Tailwind. No incluye proxy, reglas de hosting ni comprobación que rechace URLs locales en producción. Vercel deberá compilar desde la raíz con `npm run build` y publicar solamente `dist`. Vite dev/preview no son el servidor público previsto.

`BrowserRouter` necesita fallback SPA para acceder directamente a `/perfil`, `/tienda/:id`, `/admin`, etc. No existe configuración de despliegue explícita en el repositorio que asegure ese comportamiento. Verificarlo en Vercel y configurar rewrites cuando corresponda; las rutas API deben tener prioridad si se elige proxy.

### URLs, recursos y datos locales

`src/services/auth.js` usa `VITE_AUTH_API_URL`, con fallback `http://localhost:4000/api/v1`. También atiende comercio y administración. `otakuzone.js` usa `VITE_OTAKUZONE_API_URL`; `anilist.js` usa `VITE_ANIME_API_URL`, luego la variable de auth, luego loopback. Si faltan variables en el build, el navegador del visitante intentará contactar su propio equipo y puede bloquear contenido mixto.

Las tres bases deben incluir `/api/v1` y apuntar a la misma API. Las variables `VITE_*` son públicas y se incorporan al build: cambiarlas exige reconstruir el frontend. Nunca incluir secretos en ellas.

Imágenes locales importadas desde `src/assets` y fuentes de `@fontsource` se empaquetan; `public/favicon.svg` se sirve estáticamente. Productos usan un mapa de cuatro imágenes ilustrativas (`src/data/productImages.js`); no hay carga persistente de imágenes comerciales. AniList proporciona imágenes HTTPS externas; `MediaImage` presenta fallback si fallan. Revisar licencias, atribución, peso y disponibilidad antes de publicación comercial.

Favoritos se almacenan localmente; no están sincronizados por cuenta en MySQL. Existe catálogo demo seleccionable explícitamente y compatibilidad con favoritos Jikan heredados. `src/services/jikan.js` conserva URL pública y variable `VITE_JIKAN_API_URL`; no es la integración principal actual ni necesita credencial AniList.

## 2. Estado del backend

### Estructura, ejecución y compatibilidad

Express `5.3.0`, mysql2 `3.24.6`, jsonwebtoken `9.0.3`, bcryptjs `3.0.3`, cors `2.8.6`, express-rate-limit `8.7.4`, Helmet `8.3.0`, dotenv `18.0.10` y Zod `4.6.7`. Usa **bcryptjs**, implementación JavaScript de bcrypt, no el paquete nativo `bcrypt`. No es por sí mismo un fallo; medir el coste del hash bajo carga.

`backend/package.json` exige Node >=24 y ofrece `start: node src/server.js`, `dev` con watch y pruebas Node. No requiere transpilación. Render: raíz `backend`, instalación propuesta `npm ci --omit=dev`, inicio `npm start`; fijar Node 24. Revisar que npm conserve acceso a las carpetas SQL para el trabajo separado de migraciones. No añadir migraciones al arranque HTTP.

`server.js` usa `PORT`, verifica versión/conexión MySQL y algunas tablas/columnas al inicio; configura timeouts y cierre por SIGTERM/SIGINT. El valor predeterminado de `HOST` es `127.0.0.1`: configurar **`HOST=0.0.0.0` en Render**, usando el puerto provisto por la plataforma. Render requiere escucha pública en ese host ([documentación](https://render.com/docs/web-services)).

### Autenticación, cookies y autorización

Evidencia: `config/auth.js`, `middlewares/auth.js`, `services/authService.js`, `controllers/authController.js` y `db/authSql.js`.

- Cookie de producción: `__Host-otakuzone_session`, HttpOnly, Secure, SameSite=Lax, Path=/, sin Domain y Max-Age igual al TTL. En local conserva nombre sin prefijo y Secure=false. Logout borra con las mismas opciones.
- El JWT solo transporta identificador de sesión y sujeto; HS256 permitido explícitamente, issuer y audience fijos, verificación de expiración, antigüedad y formato. Secreto mínimo de 64 caracteres; TTL configurable entre 300 y 3600 segundos, predeterminado 1800.
- Cada autenticación consulta sesión vigente/no revocada, usuario activo y rol en MySQL. Logout revoca sesión. No hay refresh token: transcurrido el TTL corresponde volver a autenticarse.
- Contraseñas con bcrypt, coste entre 10 y 14, predeterminado 12; validación de límite de 72 bytes UTF-8. Hash ficticio para reducir diferencias entre usuarios inexistentes y contraseñas erróneas.
- Registro asigna `cliente` desde el servidor y rechaza campos extra. Administración exige rol ADMIN en backend; los guardas React son una ayuda visual, no la barrera de seguridad.
- Los repositorios de comercio filtran operaciones por usuario y usan transacciones; falta certificación integral de aislamiento y concurrencia con MySQL real.
- No se identificó flujo de recuperación de contraseña, verificación de correo ni MFA. Evaluar abuso de registros y recuperación de cuentas antes de abrir registro público.

### CORS, CSRF y límites

CORS permite orígenes exactos, credenciales y encabezado `X-OtakuZone-CSRF`; no admite wildcard. En producción exige orígenes HTTPS. Solicitudes sin Origin pueden pasar CORS, pero las mutaciones del navegador exigen Origin autorizado, JSON y cabecera CSRF. CORS no sustituye autenticación.

Login/registro requieren cabecera `1`; su defensa combina Origin exacto y preflight, no un secreto CSRF individual. Mutaciones autenticadas verifican token HMAC ligado a la sesión, con comparación temporal segura. React mantiene ese token en memoria y usa `credentials: 'include'`; no persiste JWT en localStorage.

Hay límites globales `/api/v1` y específicos compartidos por login/registro, con 429 y Retry-After. **`trust proxy=false` está fijado en `app.js`**: detrás del proxy puede agrupar usuarios por IP del proxy. Corregir según la cadena real de proxies y probar resistencia a X-Forwarded-For falsificado; no usar `true` indiscriminadamente ([Express](https://expressjs.com/en/guide/behind-proxies/)). Los contadores son locales a cada proceso: reinicios los borran y varias réplicas no comparten presupuesto. Para escalar, usar almacenamiento compartido o controles equivalentes de infraestructura.

### AniList y rutas

React llama a Express; este hace POST a `https://graphql.anilist.co` con consultas internas y variables validadas. No admite GraphQL arbitrario del usuario ni requiere token para estas lecturas públicas. Hay timeout de 10 s, caché acotada de 60 s, deduplicación, cola limitada, separación de inicios de 2200 ms y presupuesto interno inicial de 28/minuto; lee headers de límite y Retry-After. No confundir ese presupuesto interno con una garantía del proveedor. Caché/cola son por proceso; varias réplicas pueden superar el presupuesto conjunto de la IP de salida. No se consultó AniList en vivo en esta auditoría.

Rutas bajo `/api/v1`:

| Grupo | Rutas principales | Protección |
| --- | --- | --- |
| Salud/catálogo | `/health`, `/products`, `/products/:id`, `/categories`, `/categories/:id`, `/promotions` | Lectura pública y límites |
| Anime | `/anime`, `/anime/popular`, `/anime/season`, `/anime/genres`, `/anime/:id` | Lectura pública, validación y cuota upstream |
| Cuenta | `/auth/register`, `/auth/login`, `/auth/session`, `/auth/me`, `/auth/logout` | Sesión según operación, CSRF en escritura |
| Comercio | `/plans`, `/cart`, `/cart/items`, `/cart/items/:id`, `/orders`, `/orders/:id`, `/subscription` | Planes públicos; resto requiere sesión; CSRF en escritura |
| Administración | `/admin/overview`, `/admin/dashboard`, productos, categorías, inventario, movimientos, usuarios y pedidos | ADMIN; CSRF en escritura |

### Logs, errores y operación

Helmet, JSON limitado a 10 KB, validación Zod, consultas parametrizadas y respuestas de error uniformes sin trazas al cliente. Logs actuales son console de arranque y código/nombre de errores internos. Faltan logs estructurados de petición, duración, identificador de correlación, alertas y política de retención/redacción. Nunca registrar Cookie, JWT, contraseñas, secretos ni cuerpos sensibles.

`/health` devuelve estado estático; no vuelve a consultar MySQL. La comprobación al inicio no detecta caída posterior para readiness. Proponer liveness y readiness diferenciados, sin saturar el pool ni depender de AniList para liveness. El límite global también alcanza health y puede devolver 429 al monitor.

## 3. Estado de MySQL

**Estado real no verificado.** No se certifican versión instalada, esquema aplicado, grants, datos, backups, red ni TLS. Los archivos históricos de evidencia no sustituyen una revisión actual.

El código requiere MySQL >=8.0.16 y rechaza MariaDB. Usa utf8mb4, DECIMAL conservado como texto en transporte SQL y bigint como string. Pool con 5 conexiones predeterminadas (1–20), espera habilitada, cola máxima 20, keep-alive, conexión de 5 s (1–30 s), `multipleStatements=false`. Transacciones liberan conexiones y destruyen la conexión si falla rollback.

`DB_SSL=true` activa verificación del certificado (`rejectUnauthorized=true`). No hay configuración propia para CA privada, certificado cliente o clave: si el proveedor exige CA no reconocida por Node, habrá que añadir soporte seguro. No resolverlo deshabilitando verificación. Restringir acceso de red y calcular `réplicas × DB_POOL_SIZE`, más migraciones/operación, dentro del máximo del proveedor.

`timezone:'Z'` controla conversiones del driver; no garantiza por sí mismo la zona de sesión del servidor. Transacciones fijan UTC y sesiones usan UTC_TIMESTAMP, pero hay DEFAULT CURRENT_TIMESTAMP en tablas. Verificar zona UTC del servicio y de todas las conexiones, además del sql_mode; el sql_mode estricto del migrador no se aplica automáticamente al pool HTTP.

### Migraciones

Existen siete SQL ordenados por `manifest.json`: creación de base, esquema relacional, roles/planes, catálogo demo, sesiones, comercio y administración/inventario. El ejecutor `npm run db:migrate` incorpora lock MySQL, ledger y SHA-256, rechaza tablas existentes sin historial y cambios de checksum. Es una buena base, sin ejecución automática al arrancar el servidor.

Limitaciones confirmadas:

1. Exige nombre `otakuzone_db` y ejecuta CREATE DATABASE/USE con ese nombre. Un servicio que imponga otra base o no permita crearla requiere adaptar el procedimiento antes de ejecutarlo.
2. `004_demo_catalog.sql` está incluido obligatoriamente: separar decisión de datos de demostración de la carga productiva. `003` también carga planes demostrativos.
3. DDL no es transaccional en este mecanismo. Un fallo puede dejar tablas creadas sin registrar el ledger; se necesita ensayo y procedimiento de recuperación, no asumir rollback completo.
4. Se ejecuta el primer SQL y bootstrap antes de terminar todas las comprobaciones del historial: el migrador no es un chequeo de solo lectura.
5. SQL de provisioning usa cuentas restringidas a `127.0.0.1`, inadecuadas para un backend remoto sin adaptación a la política del proveedor.
6. Separar cuenta de migración con DDL de cuenta runtime con DML mínimo. Revisar todos los grants contra las operaciones actuales; no usar root.

Los scripts de verificación no deben ejecutarse indiscriminadamente en producción: `close-phase7.js` crea/copía/elimina bases y cuentas temporales; hay scripts de promociones, secretos y esquema. Sus nombres no garantizan ausencia de escrituras. Definir una lista explícita de comprobaciones inocuas y un entorno aislado para las demás.

## 4. Variables necesarias para producción

Los valores privados deberán configurarse en el gestor de secretos del hosting; no se generan ni muestran aquí. Los dominios `.example` siguientes son marcadores.

| Variable | Destino | Valor o criterio |
| --- | --- | --- |
| `VITE_AUTH_API_URL` | Vercel, build | `https://api.otakuzone.example/api/v1` |
| `VITE_OTAKUZONE_API_URL` | Vercel, build | Misma base API |
| `VITE_ANIME_API_URL` | Vercel, build | Misma base API, no GraphQL directo |
| `NODE_ENV` | Render | `production` |
| `HOST` | Render | `0.0.0.0` |
| `PORT` | Render | Puerto asignado por plataforma; no fijar uno distinto sin coordinación |
| `CORS_ORIGINS` | Render | `https://www.otakuzone.example`; añadir apex solo si sirve realmente la app |
| `CATALOG_SOURCE` | Render | `mysql` |
| `AUTH_ENABLED` | Render | `true` |
| `DB_HOST`, `DB_PORT` | Render | Endpoint y puerto del MySQL administrado |
| `DB_NAME` | Render | Actualmente exige `otakuzone_db` para migrar |
| `DB_USER`, `DB_PASSWORD` | Render, secretos | Cuenta runtime con privilegios mínimos |
| `DB_SSL` | Render | `true`; verificar cadena CA del proveedor |
| `DB_POOL_SIZE` | Render | Inicial 5, ajustar con presupuesto total de conexiones |
| `DB_CONNECT_TIMEOUT_MS` | Render | Inicial 5000; ajustar según latencia medida |
| `JWT_SECRET` | Render, secreto | Aleatorio criptográfico de al menos 64 caracteres; persistente entre réplicas |
| `JWT_TTL_SECONDS` | Render | Inicial 1800; sin renovación automática |
| `BCRYPT_ROUNDS` | Render | Inicial 12; validar bajo carga |
| `AUTH_RATE_MAX`, `AUTH_RATE_WINDOW_MS` | Render | Inicial 10 / 900000 ms; revisar abuso y usuarios bajo NAT |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | Render | Inicial 120 / 60000 ms; ajustar tras corregir IP de cliente |
| `DEMO_DATA_PATH` | Solo modo demo | No necesario funcionalmente con catálogo MySQL |

`VITE_JIKAN_API_URL` es opcional/legado y no necesario para el catálogo AniList. No existen actualmente variables para SameSite, Domain, trust proxy o CA privada: no inventarlas en el panel esperando que el código las interprete. La versión Node se selecciona con el mecanismo de cada plataforma y debe quedar fijada de forma consistente.

## 5. Problemas confirmados

| Prioridad | Hallazgo y evidencia | Corrección necesaria |
| --- | --- | --- |
| Bloqueante | Fallbacks HTTP a loopback en servicios React | Definir las tres bases HTTPS en build y verificar artefacto |
| Bloqueante | Cookie Lax con dominios Vercel/Render independientes | Elegir dominio común o proxy; no publicar esa combinación tal cual |
| Bloqueante | HOST predeterminado loopback, `config/env.js` | Configurar 0.0.0.0 en Render |
| Alta | `trust proxy=false`, `app.js` | Confiar solo en proxies verificados y probar IP/límites |
| Alta | Migrador acoplado a nombre fijo y CREATE DATABASE | Acordar capacidades del MySQL administrado y adaptar antes de migrar |
| Alta | Manifest mezcla esquema y catálogo demo | Decidir contenido inicial y preparar un procedimiento compatible con checksums |
| Alta | Health estático y ausencia de readiness | Añadir comprobación operativa acotada y monitorización |
| Media | No hay política de hosting SPA ni Node fijado en frontend | Configuración reproducible y prueba de enlaces profundos |
| Media | Logs básicos sin correlación ni alertas | Añadir observabilidad con redacción |

No se afirma que los valores privados locales estén mal configurados. Los bloqueantes describen lo que se debe resolver para el destino previsto, no una obligación de cambiar el entorno local.

## 6. Riesgos potenciales y límites

- No hay evidencia actual de TLS/grants/backups ni ensayo de restauración de MySQL administrado. Definir RPO/RTO, región cercana a Render y política de conservación.
- Caché AniList y rate limits en memoria no coordinan réplicas; riesgo de agotamiento de cuota y abuso tras reinicios.
- No se observó limpieza periódica de sesiones expiradas/revocadas: planificar retención y mantenimiento limitado por lotes.
- No se ha probado carga real de bcrypt, concurrencia de pedidos/inventario, saturación de pool ni recuperación de desconexiones.
- No hay auditoría actual de vulnerabilidades de dependencias. La presencia de Express 4 en el lockfile raíz procede de herramientas de desarrollo como JSON Server; distinguirla del Express 5 del backend público.
- Compras y suscripciones son demostrativas, sin pasarela de pagos. No presentarlas como cobros reales ni habilitar cobros sin otra revisión. Stock puede modificarse por pedidos demostrativos.
- Falta validar experiencia de expiración de sesión, navegador móvil, privacidad estricta, y recuperación de cuenta.
- Revisar evidencias versionadas, capturas, datos de mock y documentos antes de hacer público el repositorio. `.gitignore` evita nuevos archivos ignorados, pero no elimina archivos ya versionados ni secretos del historial.

## 7. Correcciones necesarias y archivos que no deben publicarse

En una etapa posterior autorizada: resolver los bloqueantes, fijar Node, preparar configuración de hosting, automatizar CI con instalación limpia/pruebas/lint/build y revisión de dependencias, endurecer operación y ensayar migraciones en una base aislada. No editar SQL ya aplicado: añadir migraciones nuevas o diseñar baseline y estrategia de datos con historial verificable.

Publicar en Vercel solo `dist`. No servir `.env`, `.env.local`, `backend/.env`, `.git`, código/backend SQL como estáticos, dumps, logs, copias, credenciales, capturas privadas ni artefactos de pruebas. Los SQL pueden permanecer en repositorio privado y artefacto controlado de migración; no son recursos del frontend. Render necesita únicamente el código y dependencias de ejecución, con secretos inyectados por plataforma.

`.gitignore` cubre `.env`, `.env.*` excepto `.env.example`, `node_modules`, dist y logs. `git ls-files '*env*'` no mostró los archivos privados de entorno, solo ejemplos y código de configuración. Esto no es un escaneo completo de secretos o del historial. Revisar también `docs/evidencias`, scripts y mock antes de publicar el repositorio. No rotar credenciales sin evidencia/decisión autorizada; si se confirma una exposición, revocar y rotar mediante un procedimiento separado.

La CSP de Helmet protege respuestas del backend, no el HTML que sirve Vercel. Definir cabeceras frontend apropiadas a sus fuentes, scripts e imágenes y verificar que no rompan la aplicación.

## 8. Arquitectura de despliegue recomendada

### Alternativas de autenticación

| Alternativa | Funcionamiento | Evaluación |
| --- | --- | --- |
| `www.otakuzone.example` en Vercel y `api.otakuzone.example` en Render | Orígenes distintos pero mismo sitio HTTPS; Lax permite las peticiones entre ellos. Cookie host-only pertenece exclusivamente a API. Fetch include y CORS exacto siguen siendo necesarios | **Recomendada para OtakuZone:** conserva el diseño actual, evita dependencia de cookies de terceros y no añade otro salto de proxy |
| API mediante `/api/v1` del frontend hacia Render | El navegador ve un solo origen; la cookie host-only se asocia al host frontend. No depende de cookies de terceros | Alternativa sólida si se valida forwarding de Cookie, Set-Cookie, Origin, métodos y ausencia de caché; añade dependencia operativa del proxy |
| `proyecto.vercel.app` y `servicio.onrender.com` | Sitios distintos; requeriría cambiar cookie a SameSite=None y Secure | No recomendada como base de sesión pública: restricciones de terceros pueden bloquearla aunque CORS y fetch estén bien |

SameSite=None requiere Secure, y el prefijo `__Host-` requiere Secure, Path=/ y ausencia de Domain. SameSite usa el concepto de sitio, distinto de origen; compartir dominio registrable y HTTPS permite conservar Lax. Las restricciones de cookies de terceros son independientes de CORS. No pueden solucionarse solo activando credenciales ([MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

**Recomendación:** dominio propio bajo control, frontend `www` en Vercel, API `api` en Render y MySQL administrado accesible exclusivamente por canales autorizados y TLS. Mantener en producción HttpOnly + Secure + Lax + Path=/ + sin Domain y prefijo `__Host-`; no compartir cookie mediante Domain. Restringir CORS al origen real de la app y conservar CSRF. Evitar alojar subdominios no confiables bajo ese dominio.

Si se elige proxy, las tres variables VITE pueden ser `/api/v1`; Vercel permite rewrites a un origen externo ([documentación](https://vercel.com/docs/routing/rewrites)). Preservar la ruta, aplicar rewrite API antes del fallback SPA y evitar caché compartida de cualquier respuesta de sesión. La API debe seguir aceptando el Origin del frontend para CSRF aunque el navegador ya no necesite CORS entre orígenes. Verificar headers de extremo a extremo: un rewrite configurado no demuestra por sí solo una sesión correcta. No permitir que direcciones de preview usen indiscriminadamente datos/cookies de producción.

No se recomienda cambiar la autenticación local: todas las decisiones anteriores corresponden a configuración y cambios futuros de producción, aislados por entorno.

## 9. Orden exacto de implementación posterior

Los siguientes pasos son un plan; **ninguno se ejecuta como parte de esta etapa**.

1. Obtener autorización para etapa 2 y acordar dominio propio, alcance demostrativo/comercial y proveedor/región de MySQL.
2. Fijar Node 24 y npm compatibles en repositorio/hostings; comprobar `npm ci` por separado, pruebas, lint, build Linux y revisión de vulnerabilidades en un entorno aislado.
3. Preparar configuración de frontend Vercel: salida dist, fallback SPA, tres bases API HTTPS, cabeceras y separación producción/preview.
4. Preparar backend Render: raíz backend, comandos de instalación/inicio, HOST público, PORT de plataforma, producción, catálogo MySQL y autenticación habilitada.
5. Corregir confianza de proxy y probar IP real, falsificación de headers y límites; definir estrategia de contadores/caché para el número de réplicas previsto.
6. Adaptar conexión segura MySQL a CA/red del proveedor, calcular pool total y asegurar UTC/sql_mode. Documentar usuarios runtime y migrador con privilegios mínimos, sin ejecutar provisioning local en remoto.
7. Revisar migraciones: base impuesta, bootstrap, catálogo demo, checksums y recuperación DDL. Ensayar instalación limpia y fallo parcial en una base aislada autorizada; verificar backup/restauración.
8. Preparar secretos y variables separados por entorno, política de rotación JWT y retención de sesiones. No introducir secretos en VITE ni commits.
9. Añadir readiness, logs redactados, métricas y alertas; preparar lista de smoke tests sin escritura y pruebas integrales aisladas con autorización explícita para datos de prueba.
10. Revisar artefactos y exposición de archivos/historial; cerrar hallazgos de seguridad y documentar rollback de aplicación y compatibilidad de esquema.
11. Con autorización posterior de infraestructura, configurar DNS/TLS, MySQL y servicios de staging; aplicar migraciones con cuenta separada una sola vez mediante trabajo controlado.
12. Validar en staging Chrome/Firefox/Safari y móvil: login, recarga, expiración, logout, CSRF, CORS, acceso por roles, propiedad de pedidos, stock concurrente, deep links, imágenes, AniList 429 y caídas de BD. No usar scripts que creen usuarios/bases sin autorización específica.
13. Presentar resultados y configuración concreta para aprobación de publicación. Solo después, ejecutar despliegue productivo, migraciones autorizadas, smoke tests y monitorización con rollback disponible.

**Cierre de etapa 1:** informe completado; configuración local intacta. No se avanza a etapa 2 sin autorización.
