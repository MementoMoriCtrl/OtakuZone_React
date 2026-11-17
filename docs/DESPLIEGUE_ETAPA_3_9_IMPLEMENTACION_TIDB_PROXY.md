# OtakuZone — Etapa 3.9: implementación TiDB y proxy Vercel

Fecha: **16 de noviembre de 2026**. Cierre documental: **Etapa 3.9.1**. Referencia: [preparación 3.8](DESPLIEGUE_ETAPA_3_8_PREPARACION_PRODUCCION.md).

## 1. Resultado y alcance

**Implementación local preparada y comprobada con pruebas relacionadas; despliegue y migración remota pendientes.** El catálogo ready indica disponibilidad del código, no ejecución ni certificación remota. El arranque exige esquema, integridad y ledger reales; no hay fallback a MySQL o demo ante un fallo TiDB.

3.9.1 crea este informe, actualiza el enlace del README TiDB y corrige exclusivamente el mensaje desfasado del preflight sobre bootstrap ausente. El bootstrap está implementado; si falta el historial, se exige utilizar el migrador con autorización expresa. No se reimplementan funciones ni se modifican SQL.

## 2. Archivos de la implementación 3.9

| Grupo | Archivos creados o modificados |
| --- | --- |
| Catálogo TiDB | `backend/database/tidb/manifest.json`, `ledger.sql`, `README.md` y siete archivos en `migrations/` |
| Migración y contrato | `backend/src/db/migrate.js`, `migrationCatalog.js`, nuevos `tidbMigrate.js` y `emailContract.js` |
| Runtime | `backend/src/db/tidbPreflight.js`, `schemaCheck.js`, `pool.js`, nuevo `tidbSession.js` |
| Configuración | `backend/src/config/env.js` |
| Proxy | `vercel.mjs` y `scripts/vercel-config.mjs`, en sustitución del archivo estático `vercel.json` |
| Pruebas | `backend/tests/tidb-migrations.test.js`, `tidb-preflight.test.js`, `production-config.test.js`, `email-ascii.test.js`; nuevos `tidb-ready.test.js` y `tests/vercelConfig.test.mjs` |
| Cierre 3.9.1 | Este informe; enlace en README TiDB y texto de error en preflight |

El workspace contiene modificaciones anteriores; esta lista no atribuye a 3.9 todos los cambios mostrados por Git. No se modificaron dependencias, autenticación, cookies, JWT, bcrypt o CSRF en este lote.

## 3. SQL, hashes e historial independiente

Ruta de las versiones: `backend/database/tidb/migrations/`. SHA-256 calculado sobre SQL sin BOM y con CRLF normalizado a LF, según el lector del catálogo.

| Archivo TiDB | SHA-256 del SQL TiDB | Transaccional |
| --- | --- | --- |
| `001_create_database.sql` | `5e7af2dd955fe4a8e9fad68228240f0c80521b2d84c293bbe6ed4d1d66616fbb` | No |
| `002_relational_schema.sql` | `8ed28b2f71988471005dca2d57ee0695462b039f19fc6ac44617e21f5e64ee1c` | No |
| `003_roles_and_plans.sql` | `2280ea97e6ecfff549ec4fa20681bbd81bd2970b66d6a0f88063760597f40d92` | Sí |
| `004_demo_catalog.sql` | `d87b745c21d6167ce0e59297755ee4eabb3783493bc4051ff9c36a0f96aeaed7` | Sí |
| `005_auth_sessions.sql` | `dc7dfce218f252dbc051d9ab8aa22385a89568cc4bd071d74d6a90a1ad2b7a8c` | No |
| `006_commerce.sql` | `2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e` | No |
| `007_admin_inventory.sql` | `244478c340d887cd001c2270511b89169bf122a0c6938aceaab7e2c4b9e83520` | No |

Bootstrap `backend/database/tidb/ledger.sql`: `405b954405b0a4e07820fad8f30974dcd9b48fa4bd426f9e944b4a951835ae3b`.

Cada versión contiene en el manifest `source.file` y `source.sha256` para su original MySQL. 001 y 003–007 conservan contenido normalizado y hash de sus fuentes; son archivos independientes y no prueban ejecución. Para 002, el hash fuente MySQL conservado es `c7eb87dda45af52185d697996cc6f24dbab706d0eac0b7c350d01c25c40a5237`; su hash TiDB distinto identifica la adaptación real.

002 mantiene VARCHAR(254), NOT NULL y UNIQUE completo, cambia únicamente la collation email a `utf8mb4_0900_bin` e incorpora `ck_usuarios_email_canonical` con el predicado aprobado en 3.6.1. El contrato TiDB espera **21 CHECK y 18 FK**. Se conservan roles, planes, productos, seeds y funcionalidades administrativas.

MySQL mantiene sus originales 001–007, manifest e historial `schema_migrations`. TiDB usa exclusivamente `schema_migrations_tidb`. Los hashes de procedencia no se insertan como supuestas ejecuciones TiDB. Los dialectos rechazan el ledger contrario en el destino; no se adopta el esquema de ensayo.

## 4. Migrador y recuperación

El migrador selecciona catálogo y comprueba destino `otakuzone_db` antes de conectar. TiDB utiliza bootstrap propio, lock y validación de hashes, versiones conocidas y prefijo continuo del historial. Rechaza tablas sin historial y estados parciales.

El ledger persiste `applying` antes de ejecutar cada versión; solo pasa a `applied` al terminar. 003/004 mantienen transacción para seed y cierre de entrada. CREATE DATABASE y bootstrap idempotentes preceden a esos marcadores.

DDL y ledger no son atómicos en conjunto: una interrupción puede dejar objetos parciales, especialmente 006/007. El marcador bloquea nuevos intentos; no recupera automáticamente. Comparar objetos y datos con SQL/hashes y aprobar reparación/restauración antes de reanudar. No borrar tablas ni fabricar filas o checksums para continuar.

No se añadieron migraciones automáticas a build/start. La entrada alternativa administrativa sigue siendo una herramienta MySQL, no un atajo para TiDB.

## 5. Preflight, sesiones y configuración productiva

Se eliminó para TiDB la exigencia histórica as_ci y el fallo final incondicional. Se comprueban:

- Identidad/versionado existentes, CHECK/FK globales habilitados, foreign_key_checks y modos estrictos de sesión.
- UTC, transacciones pesimistas, comprobación UNIQUE pesimista inmediata y autocommit ON antes de transacciones explícitas.
- Collation `utf8mb4_0900_bin` y NO PAD; email VARCHAR(254) NOT NULL.
- UNIQUE completo sobre email, sin prefijo; restricciones del catálogo TiDB y CHECK canónico comparado estructuralmente, preservando literales y agrupación.
- Siete entradas aplicadas con hashes válidos en ledger TiDB, sin historial MySQL cruzado.

Bootstrap solo observa capacidades; no aprueba runtime. No se consulta `mysql.tidb` ni se amplían permisos.

Cada préstamo del pool TiDB establece UTC de sesión y valida FK, modos, autocommit y configuración pesimista antes de prestar la conexión. También cubre execute/query del pool. Esto añade consultas de control por préstamo; su coste/latencia real queda por observar. No modifica variables globales ni debilita integridad. TLS verificado, CA opcional, retiro de conexiones y ausencia de replay se conservan.

`DB_ENGINE=mysql` continúa siendo el default local del cargador de base de datos. TiDB exige explícitamente `CATALOG_SOURCE=mysql` y `AUTH_ENABLED=true`. Producción exige motor explícito y esos selectores, evitando demo/auth desactivada accidentalmente. Los controles MySQL de versión/TLS se conservan.

## 6. Proxy Vercel

Se utiliza `vercel.mjs` porque JSON estático no interpola el origen desde una variable. Vercel admite configuración programática y extensión mjs; debe existir una sola configuración. No se añadieron dependencias para los helpers opcionales. [Configuración oficial de Vercel](https://vercel.com/docs/project-configuration/vercel-ts).

`RENDER_API_ORIGIN` es obligatorio: origen HTTPS real bajo onrender.com, sin ruta, puerto explícito, credenciales, query o fragmento. No hay hostname predeterminado inventado; la configuración falla si falta o es inválido.

Rewrites de `/api/v1` y `/api/v1/:path*` preceden al fallback React. Se establecen no-store para navegador/CDN y desactivación de caché del rewrite. Se conservan cabeceras generales de seguridad.

Las tres variables VITE admiten la misma URL absoluta del frontend HTTPS seguida de `/api/v1`, usando el resolvedor existente. No se alteran cookies, CSRF, Origin ni credentials:include. La preservación efectiva de cabeceras y errores requiere el smoke remoto posterior.

## 7. Resultados reales registrados

Estos resultados proceden de la implementación anterior; **no se repitieron en 3.9.1**, salvo la fila del preflight:

| Ejecución | Resultado y alcance |
| --- | --- |
| Lote relacionado de nueve archivos de pruebas | **35/35 aprobadas**: catálogo, preflight, pool, configuración, transacciones y proxy |
| `backend/tests/tidb-ready.test.js` actualizado | **6/6 aprobadas**; cinco se solapan con el lote anterior y una añade finalización de siete versiones con doble |
| Prueba filtrada «catálogo TiDB preparado conserva separación del historial MySQL» | **1/1 aprobada**; sin repetir matriz de correo |
| `npm run lint` | Aprobado |
| Vite build en modo producción, salida `dist-local` | Aprobado, **2182 módulos** |
| `git diff --check` durante implementación | Aprobado; advertencias LF/CRLF en cambios del workspace |
| Cierre 3.9.1: `node --test backend/tests/tidb-preflight.test.js` | **5/5 aprobadas**, con fixtures, sin conexión SQL |

No sumar 35+6+1 como pruebas distintas: hay solapamiento. Las pruebas del migrador usan dobles y no ejecutan SQL contra un servidor. Un fallo inicial de generación de 002 se detectó offline, se corrigió y el lote posterior pasó. No queda ese error pendiente.

El build utilizó únicamente variables del proceso con base reservada `https://frontend.test/api/v1`; no modificó archivos .env. Sus artefactos son de comprobación, **no publicables con esa configuración**. Falta el build con el origen final cuando se autorice publicar.

En este cierre el primer runner fue bloqueado por spawn EPERM del sandbox; su reejecución autorizada fuera del sandbox pasó 5/5. No se repitieron lint, build, matrices exploratorias o suites ajenas al cambio.

## 8. Variables pendientes de hosting

No se incluyen secretos ni se presuponen endpoints asignados.

| Render | Configuración o dato pendiente |
| --- | --- |
| NODE_ENV / HOST / PORT | production; 0.0.0.0; puerto dinámico del hosting |
| DB_ENGINE / CATALOG_SOURCE / AUTH_ENABLED | tidb / mysql / true, explícitos |
| DB_HOST / DB_PORT | Valores reales de Connect, todavía no consignados aquí |
| DB_NAME | Destino previsto otakuzone_db; nunca el probe |
| DB_USER / DB_PASSWORD | Identidad runtime separada y credencial privada; revisar permisos y límites del validador |
| DB_SSL / DB_SSL_CA | true; CA PEM solo si la cadena requiere aportarla; nunca desactivar verificación |
| DB_POOL_SIZE / DB_CONNECT_TIMEOUT_MS | Propuesta inicial 2 / 5000 |
| DB_POOL_IDLE_TIMEOUT_MS / DB_POOL_MAX_LIFETIME_MS | 60000 / 300000; vida máxima suave |
| CORS_ORIGINS | Origen HTTPS frontend real, sin ruta; allowlist exacta |
| TRUST_PROXY | Proxies entrantes IP/CIDR verificados, sin inventar direcciones ni usar true |
| JWT_SECRET | Secreto privado estable de longitud admitida, sin publicarlo |
| JWT_TTL_SECONDS / BCRYPT_ROUNDS | Propuesta existente 1800 / 12 |
| AUTH_RATE_MAX / AUTH_RATE_WINDOW_MS | 10 / 900000 |
| RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS | 120 / 60000 |

Render previsto: raíz backend, Node 24.x, build npm ci --omit=dev, start npm start. Health /api/v1/health sigue siendo liveness, no readiness continua. No copiar la plantilla productiva MySQL sin adaptar el panel.

| Vercel | Pendiente |
| --- | --- |
| RENDER_API_ORIGIN | Origen HTTPS real de Render, disponible al evaluar vercel.mjs |
| VITE_AUTH_API_URL | Origen HTTPS confirmado del frontend + /api/v1 |
| VITE_OTAKUZONE_API_URL | Misma base anterior |
| VITE_ANIME_API_URL | Misma base anterior |

Las variables VITE son públicas y se fijan al compilar; nunca incluir secretos de base/JWT. Configurar entornos preview de manera aislada. El hostname frontend también debe coincidir con CORS_ORIGINS.

## 9. Validación remota pendiente y bloqueos restantes

1. Autorizar esquema de aplicación y migración con identidad separada, permisos mínimos y recuperación. Ninguna versión se declara aplicada por este informe.
2. Comprobar conexión Node con TLS/CA reales, versión corroborada, metadatos visibles y sesiones runtime. El formato de CHECK devuelto por TiDB debe ser reconocido por la comparación estructural; una representación no reconocida detiene el arranque.
3. Verificar ledger y estructura completa tras migración autorizada. La tabla probe creada no sustituye la aplicación ni prueba todas sus FK, generadas y consultas.
4. Incorporar evidencia mínima de rechazo de un valor no canónico y un duplicado, si aún no existe; no repetir el laboratorio de email.
5. Validar proxy real: JSON/status, Cookie/Set-Cookie y borrado, no-store, Origin/CSRF, login/logout y autorización. Confirmar TRUST_PROXY con topología real.
6. Comprobar focalmente conflicto/atomicidad de registro con datos sintéticos autorizados. No añadir reintentos ciegos ni tratar todo conflicto TiDB como email duplicado.

Persisten riesgos ya documentados: cold starts, health estático, límites en memoria por proceso, housekeeping pendiente, cuotas, latencia y commit de resultado incierto. No se implementó una clasificación nueva especulativa de errores remotos; se conservan respuestas redactadas y manejo existente.

## 10. Preservación y cierre

Las comparaciones de hashes registradas durante implementación y recuperación conservaron MySQL 001–007, su manifest, entornos privados y manifiestos/lockfiles. El estado global Git ya contenía cambios anteriores. **MySQL local permanece intacto porque no se abrió conexión ni se ejecutó SQL contra él.**

No se conectó a TiDB ni se ejecutaron migraciones, provisioning, DML/DDL remotos o despliegues. No se consultó, modificó o eliminó otakuzone_email_probe. No se editaron .env, credenciales, usuarios, permisos, autenticación, cookies, JWT o CSRF ni se hicieron commits.

**Etapa 3.9 cerrada documentalmente mediante 3.9.1.** Código preparado localmente; operación remota todavía pendiente de configuración, autorización y validación. Se detiene el trabajo.

