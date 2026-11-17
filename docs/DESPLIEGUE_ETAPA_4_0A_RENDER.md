# OtakuZone — Etapa 4.0A: preparación del backend para Render Free

Fecha: **16 de noviembre de 2026**. Auditoría estática sobre la implementación existente de [Etapa 3.9](DESPLIEGUE_ETAPA_3_9_IMPLEMENTACION_TIDB_PROXY.md). **Preparación documental completada; servicio Render y conexión real no probados ni desplegados.** Único archivo creado: este informe. No se requieren cambios de código identificados específicamente para Render en esta revisión.

## 1. Auditoría del backend

| Componente inspeccionado | Resultado y límites |
| --- | --- |
| `backend/package.json` y lockfile | ESM, Node `24.x`, dependencias runtime declaradas: Express 5.3.0, mysql2 3.24.6, Zod 4.6.7 y módulos de seguridad existentes. Start: `node src/server.js`. No hay scripts preinstall/postinstall ni compilación backend requerida en el manifest. No se instalaron dependencias. |
| `src/server.js` | Carga configuración, construye repositorio/pool SQL, comprueba identidad y preflight antes de escuchar. Lee tablas/columnas necesarias de auth, comercio y administración. Escucha mediante `listen(config.port, config.host)`. No importa ni ejecuta el migrador. |
| `src/config/env.js` | Lee PORT desde el entorno; default 4000 solo si falta. HOST predeterminado `0.0.0.0` en production y loopback en desarrollo. Un HOST explícito incorrecto puede sobrescribir el default: fijarlo en el panel. Producción exige motor explícito, catálogo SQL y auth habilitada; rechaza orígenes CORS sin HTTPS. |
| `src/config/loadEnvironment.js` | Con NODE_ENV=production no carga el `.env` local. El panel debe establecer NODE_ENV antes de iniciar Node. |
| `src/config/database.js` | DB_ENGINE admite mysql/tidb; mysql sigue siendo default local. TiDB requiere hostname explícito, TLS, pool 2–5 y usuario prefijado no root, máximo 32 caracteres completos. Puerto mantiene default MySQL 3306: especificar el real de Connect. |
| `src/db/pool.js`, `connectionLifecycle.js`, `tidbSession.js` | TLS con rejectUnauthorized=true, CA opcional como contenido PEM. Cada préstamo TiDB establece UTC de sesión y exige FK, autocommit, modos estrictos y configuración pesimista inmediata. Pool acotado, retiro de inactivas/edad sin cortar transacciones ocupadas. No hay fallback a demo/MySQL. |
| `src/db/engine.js`, `tidbPreflight.js`, `emailContract.js`, `schemaCheck.js` | Identificación corroborada, contrato email binario NO PAD, VARCHAR(254) NOT NULL, UNIQUE completo, CHECK canónico, 21 CHECK/18 FK esperadas y ledger completo. El arranque ejecuta preflight y lecturas de tablas; no equivale a invocar todo `schemaCheck.js` ni a una prueba de negocio completa. |
| `database/tidb/`, `migrationCatalog.js`, `tidbMigrate.js`, `migrate.js` | Catálogo ready con siete SQL y hashes/procedencia; ledger separado schema_migrations_tidb y marcadores applying/applied. Destino del migrador fijo otakuzone_db. Ready no significa aplicado. No se modificó ni ejecutó SQL. |
| `scripts/migrate.js` | Entrada operativa separada mediante npm run db:migrate. Abre conexión y puede escribir si se ejecuta: no usar en Build, Start ni Pre-Deploy. No se ejecutó. |
| `controllers/healthController.js`, `routes/index.js`, `app.js` | GET /api/v1/health devuelve JSON de estado con HTTP 200 si llega al handler. No consulta TiDB. No requiere sesión; está sujeto a CORS y al limitador global /api/v1, por lo que puede devolver 429. Usar ruta sin query. |
| Cierre del proceso | SIGTERM/SIGINT cierran servidor y recursos; plazo local de diez segundos con cierre forzado. requestTimeout=30 s y headersTimeout=15 s. Comportamiento no ensayado dentro de Render. |

No se encontró una incompatibilidad de escucha, puerto, formato de módulos o comando de inicio que requiera reconstruir el backend. **Aún no se ha demostrado un arranque satisfactorio en Render con TiDB real.**

### Errores y datos sensibles

Los validadores de configuración devuelven nombres de campos, no sus valores. El handler HTTP devuelve errores genéricos y registra código/nombre para fallos internos. Transporte, acceso y límites de conexiones conocidos producen 503 redactado; no se devuelve SQL ni contraseña por esas rutas. No se modifican JWT, bcrypt, cookies, roles o CSRF.

El catch del arranque imprime código cuando existe y, en otro caso, error.message. Por ello no se certifica redacción universal de cualquier excepción futura de terceros; no volcar objetos de configuración, URLs con credenciales ni mensajes privados al informe. El texto de arranque «No se pudo iniciar MySQL» también se usa cuando el motor seleccionado es TiDB: es una imprecisión de diagnóstico, no una selección alternativa del motor. Se deja intacto en esta preparación.

## 2. Configuración exacta propuesta de Render

| Campo del panel | Configuración |
| --- | --- |
| Service Type | Web Service |
| Runtime / Language | Node |
| Instance Type | Free; no activar complementos o facturación por esta preparación |
| Repository / Branch | Repositorio y rama que contengan los archivos 3.9; selección real pendiente |
| Name / URL | Elegir en el panel; no se declara ningún hostname reservado o disponible |
| Region | Elegir entre las ofrecidas, considerando región TiDB y latencia; sin región inventada |
| Root Directory | `backend` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/v1/health` |
| Pre-Deploy Command | Vacío; no introducir migraciones |
| Persistent Disk | Ninguno; la persistencia SQL corresponde a TiDB |
| Auto-Deploy | Desactivado para controlar el primer despliegue y no publicar cambios posteriores sin revisión |

Render requiere escucha pública en 0.0.0.0 y expone el puerto mediante PORT; la aplicación ya puede consumirlo. No fijar el puerto HTTP a partir de DB_PORT. Crear el servicio desde el panel inicia un despliegue: **no hacerlo como parte de esta preparación**. [Render Web Services](https://render.com/docs/web-services), consultado el 2026-11-16.

Node `24.x` ya está acotado en engines. Comprobar en el panel/log de build que no exista NODE_VERSION u otro selector con precedencia que fuerce otra major. Si el panel necesita un selector explícito, NODE_VERSION es una variable adicional de hosting, no una variable que lea la aplicación; elegir una versión 24 compatible, sin confundirla con NODE_ENV. [Render Node Version](https://render.com/docs/node-version), consultado el 2026-11-16.

Comandos documentados, **no ejecutados aquí**, desde Root Directory backend:

```text
Build: npm ci --omit=dev
Start: npm start
```

No ejecutar npm run dev ni npm test como Start. No usar npm run db:migrate, admin:schema, db:verify ni los QA con fixtures como pasos automáticos. No generar secretos mediante auth:secret en el build. npm ci puede usar la red para descargar dependencias durante el futuro build; su éxito en Linux/Render todavía no está comprobado.

## 3. Variables para Render

**Fijo:** requerido para este destino. **Recomendado:** valor inicial admitido por el código, sin medición de Render. **Pendiente:** obtener dato real o secreto privado por un canal seguro. No se generó ni reprodujo ningún secreto.

| Variable | Clase | Valor o criterio |
| --- | --- | --- |
| NODE_ENV | Fijo | `production` |
| HOST | Fijo | `0.0.0.0` |
| PORT | Hosting | Lo suministra Render; no introducir un valor manual. El código lo lee y admite 1–65535. |
| DB_ENGINE | Fijo | `tidb`; no se deduce del hostname |
| CATALOG_SOURCE | Fijo | `mysql`: selecciona repositorios mysql2, no el fabricante del servidor |
| AUTH_ENABLED | Fijo | `true` |
| DB_HOST | Pendiente | Hostname exacto de Connect; no IP, localhost ni URL con protocolo |
| DB_PORT | Pendiente | Puerto exacto de Connect, explícito; no asumir 3306 o 4000 |
| DB_NAME | Fijo para el migrador actual | `otakuzone_db`, esquema completo de aplicación; nunca otakuzone_email_probe |
| DB_USER | Pendiente | Identidad runtime separada, prefijo.sufijo según validador, no root; máximo 32 caracteres completos. No truncarla. |
| DB_PASSWORD | Pendiente privado | Credencial de esa identidad; no incluirla en Git, chat, screenshots o logs |
| DB_SSL | Fijo | `true` |
| DB_SSL_CA | Condicional | Omitir si Node reconoce la cadena; si el proveedor lo requiere, contenido PEM válido, no ruta. Conservar verificación TLS. |
| DB_POOL_SIZE | Recomendado | `2`; rango TiDB 2–5 |
| DB_CONNECT_TIMEOUT_MS | Recomendado | `5000`; rango 1000–30000, ajustar solo con evidencia |
| DB_POOL_IDLE_TIMEOUT_MS | Recomendado | `60000`; rango 1000–300000 |
| DB_POOL_MAX_LIFETIME_MS | Recomendado | `300000`; rango 1000–300000, retiro suave al quedar libre |
| CORS_ORIGINS | Pendiente | Origen HTTPS real del frontend, sin /api/v1 ni slash final; lista separada por comas solo si se autoriza más de uno. No wildcard. |
| TRUST_PROXY | Pendiente de topología | IP/CIDR de proxies entrantes verificados, separados por comas. `false` es el default seguro, pero puede agrupar clientes bajo el mismo límite; no equivale a configuración final validada. Se rechazan true, conteos y redes /0. |
| JWT_SECRET | Pendiente privado | Secreto existente/aprobado de al menos 64 caracteres, estable entre reinicios. No generarlo ni rotarlo en esta etapa. |
| JWT_TTL_SECONDS | Recomendado | `1800`; rango 300–3600 |
| BCRYPT_ROUNDS | Recomendado | `12`; rango 10–14 |
| AUTH_RATE_MAX | Recomendado | `10`; rango 1–100 |
| AUTH_RATE_WINDOW_MS | Recomendado | `900000`; rango 1000–3600000 |
| RATE_LIMIT_MAX | Recomendado | `120`; rango 1–100000 |
| RATE_LIMIT_WINDOW_MS | Recomendado | `60000`; rango 1000–3600000 |

No copiar el .env de desarrollo. La plantilla productiva anterior selecciona MySQL; completar el panel con esta combinación explícita. No introducir VITE_* en el backend ni DB_PASSWORD/JWT_SECRET en Vercel frontend. AniList no requiere credenciales adicionales actuales.

Para el proxy ya implementado, el futuro origen real de este servicio alimentará RENDER_API_ORIGIN en Vercel. CORS_ORIGINS debe ser el frontend, no el backend por el mero hecho de recibir el rewrite. La confianza en proxies requiere distinguir la cadena entrante de las IP de salida hacia TiDB; no inventar IP/CIDR. No se cambian cookies SameSite=Lax ni se añade Domain.

## 4. Riesgos y bloqueos

**Bloqueos previos al arranque útil:** falta confirmar el esquema de aplicación migrado, siete entradas applied con hashes correctos, contrato real visible con permisos runtime y conexión TLS desde Render. Tener el probe no satisface esos requisitos. Si fallan preflight o lecturas iniciales, el proceso termina antes de listen; no resolverlo activando demo o retirando restricciones.

El preflight requiere TIDB_VERSION corroborado, variables/metadatos observables, CHECK/FK ON, modos estrictos/ONLY_FULL_GROUP_BY, autocommit, comprobación UNIQUE inmediata y transacciones pesimistas. El formato real del CHECK debe ser reconocido por el comparador estructural. Los grants runtime/migrador y la política de acceso/red siguen pendientes de verificación autorizada. No ampliar permisos a ciegas ni exigir acceso a mysql.tidb.

El build no migra: desplegar antes de preparar la base puede resultar en fallo de arranque. Una migración futura debe realizarse fuera de Build/Start, por operador e identidad separados, con autorización y recuperación para DDL parcial. No se incluye aquí un comando listo para ejecutarla.

El health confirma que el proceso responde, no disponibilidad continua de TiDB; además comparte rate limit. Con TRUST_PROXY=false, health y clientes pueden contribuir a una misma cuota. Verificar respuestas 200/429 en el hosting antes de considerarlo operativo; no desactivar protecciones preventivamente.

Render Free suspende servicios inactivos y usa filesystem efímero. Los cold starts pueden superar los 15 s del cliente auth. Render orienta Free a pruebas/hobby y desaconseja su uso productivo: este destino se prepara con esas limitaciones aceptadas, sin prometer disponibilidad. Revisar cuotas en el panel y no activar pagos automáticamente. [Render Free](https://render.com/docs/free), consultado el 2026-11-16.

Rate limits/cachés en memoria no son compartidos entre procesos y se pierden al reiniciar. Persistir archivos en el servicio no es un backup; la recuperación TiDB debe planificarse aparte. La validación de sesión añade consultas por préstamo y no hay medición de su coste o latencia desde Render. No se añaden heartbeats, reintentos de transacciones o rediseños en esta etapa.

## 5. Checklist para el despliegue posterior

- [ ] Revisar y autorizar despliegue por separado; confirmar rama con todos los archivos 3.9 incluidos y Node 24.x.
- [ ] Confirmar aplicación otakuzone_db preparada mediante migración autorizada, ledger propio y recuperación definida; mantener probe y MySQL intactos.
- [ ] Obtener hostname/puerto y credenciales runtime por canal privado; comprobar privilegios mínimos y CA necesaria.
- [ ] Fijar Root Directory backend, Free, Build/Start indicados y Pre-Deploy vacío.
- [ ] Completar variables fijas/recomendadas y datos reales; comprobar precedencia de versión Node y PORT del hosting.
- [ ] Confirmar origen frontend, CORS exacto y topología TRUST_PROXY antes de probar clientes por el proxy.
- [ ] Tras autorización, comprobar instalación, arranque/preflight, escucha y health 200 en Render; registrar solo diagnóstico redactado.
- [ ] Configurar posteriormente RENDER_API_ORIGIN y bases frontend de Vercel con los orígenes reales y ejecutar smoke mínimo autorizado de cookies/CSRF/login/logout y autorización.
- [ ] Revisar cold start, cuotas, recuperación y logs; no interpretar health verde como prueba funcional completa.

Las casillas permanecen sin marcar porque esas operaciones no se realizaron aquí. Los ensayos ya completados no se repiten como requisito de esta preparación.

## 6. Validación realizada y cierre

Se inspeccionaron manifests, scripts, configuración, arranque, rutas health, errores y módulos de db/catálogo TiDB, junto con documentación oficial de Render. No se inició server.js, npm start ni scripts que abren base. **No se ejecutaron pruebas locales nuevas:** no hubo cambio de implementación que requiriera regresión. Los resultados 35/35, 6/6, 1/1, lint/build y 5/5 del cierre anterior están documentados en 3.9; no se presentan como pruebas de Render ni como ejecuciones 4.0A.

No se ejecutaron npm ci, instalaciones, SQL, conexiones MySQL/TiDB, migraciones, creación de servicios, despliegues o commits. No se editaron .env, código, dependencias, migraciones, autenticación, cookies, JWT o CSRF. Se entrega exclusivamente este informe y se espera revisión.
