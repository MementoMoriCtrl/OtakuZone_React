# OtakuZone — Etapa 2: configuración y seguridad para producción

Fecha: 16 de noviembre de 2026.

## Resultado y alcance

Se leyó el informe completo de Etapa 1 y se preparó la configuración para frontend en Vercel, API Express en Render y MySQL administrado. Desarrollo conserva sus URLs, cookies y archivos privados. Producción exige URLs HTTPS explícitas para compilar el frontend; MySQL exige host explícito y TLS verificado cuando se usa en producción.

**Todavía no se puede publicar:** falta confirmar el dominio, los datos del proveedor MySQL y los proxies reales de Render. Las plantillas de producción dejan vacíos los datos desconocidos. No se inventó ni configuró un dominio de despliegue. Los hosts reservados presentes en las pruebas son fixtures, no destinos de producción.

No se ejecutaron migraciones, conexiones a MySQL, creación de usuarios, cambios de contraseñas/roles, despliegues, DNS ni commits. No se editaron `.env.local`, `backend/.env` ni archivos SQL. El informe de Etapa 1, que ya estaba sin seguimiento en Git al comenzar esta etapa, se preservó.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `.env.example` | Aclara uso local y remite a plantilla productiva |
| `.gitignore` | Permite versionar únicamente la nueva plantilla de producción y excluye `dist-local` |
| `package.json` | Node `24.x`, scripts `build:local`, `preview:local` y `check:local` |
| `package-lock.json` | Metadatos de engines sincronizados; sin actualizar dependencias |
| `vite.config.js` | Validación de API antes de build; salida local separada y bloqueo de ese modo en Vercel |
| `src/services/auth.js` | Obtiene base API mediante el resolvedor compartido |
| `src/services/anilist.js` | Obtiene base API mediante el mismo resolvedor |
| `src/services/otakuzone.js` | Obtiene base de catálogo mediante el mismo resolvedor |
| `backend/.env.example` | Documenta entorno local, TRUST_PROXY y CA opcional |
| `backend/package.json` | Acota Node a la rama `24.x` |
| `backend/package-lock.json` | Sincroniza engines; sin actualizar dependencias |
| `backend/src/config/env.js` | HOST predeterminado público solo en producción; interpreta TRUST_PROXY |
| `backend/src/config/loadEnvironment.js` | Omite `.env` local cuando NODE_ENV ya es production |
| `backend/src/config/database.js` | Valida TLS/host explícito en producción y acepta CA PEM |
| `backend/src/db/pool.js` | Configuración TLS compartida con verificación obligatoria |
| `backend/src/db/migrate.js` | Reutiliza opciones TLS para futura compatibilidad con CA; no se ejecutó |
| `backend/src/app.js` | Usa lista explícita de proxies confiables cuando se configura |

## Archivos creados

| Archivo | Propósito |
| --- | --- |
| `.env.production.example` | Variables públicas de build, vacías hasta confirmar API |
| `backend/.env.production.example` | Plantilla no operativa de Render, sin secretos |
| `src/config/api.js` | Validación de producción y fallbacks exclusivos para desarrollo/comprobación local |
| `backend/src/config/proxy.js` | Valida IP/CIDR confiables, rechaza true y redes /0 |
| `vercel.json` | Vite, instalación, build, dist, fallback SPA y cabeceras básicas |
| `tests/productionConfig.test.mjs` | Casos de URLs inválidas y separación local/productiva |
| `backend/tests/production-config.test.js` | Puerto/HOST, TLS/CA y rate limiting ante headers falsificados |
| `scripts/check-local-config.mjs` | Smoke reproducible sin MySQL ni solicitudes externas |
| `docs/DESPLIEGUE_ETAPA_2_CONFIGURACION.md` | Este informe |

No se añadieron dependencias ni se alteraron la lógica de cookies, JWT, bcrypt, CSRF, roles, pedidos, planes o AniList.

## Configuración local

Los archivos privados existentes permanecen intactos. En desarrollo el backend sigue cargando `backend/.env`; las variables ya exportadas conservan precedencia. El frontend sigue usando `.env.local` conforme a Vite. No copiar una plantilla vacía sobre estos archivos.

Sin variables explícitas, el frontend conserva auth en `localhost:4000` y catálogo/anime en `127.0.0.1:4000`, todos con `/api/v1`. El backend conserva HOST `127.0.0.1`, puerto 4000 y los orígenes locales exactos previos. La cookie local sigue siendo `otakuzone_session`, HttpOnly, SameSite=Lax, Path=/ y Secure=false. Mantener el mismo nombre de host entre frontend y auth para la sesión local; con la configuración de ejemplo, abrir el frontend como localhost.

Comandos habituales:

```text
npm run dev
# En otra terminal, desde backend/:
npm run dev
```

Los comandos anteriores son instrucciones de uso; no se arrancó el backend normal durante esta etapa porque su inicio comprueba MySQL.

Para compilar y comprobar sin dominio:

```text
npm run build:local
npm run preview:local
npm run check:local
```

`build:local` usa el modo `local-preview`, genera **dist-local** y conserva APIs locales. Es una compilación optimizada para comprobación local, no un artefacto publicable. `preview:local` sirve esa carpeta. Vercel rechaza ese modo cuando está presente su variable VERCEL. Producción siempre usa `npm run build`, valida sus variables y publica `dist`.

`check:local` valida la configuración privada existente sin imprimirla ni abrir su pool; arranca servidores temporales Vite y API demo sin auth; verifica HTML, módulos, ruta profunda y catálogo; sirve también el build local y cierra los servidores al terminar. No inicia el servidor MySQL, no crea cuentas y no ejercita compras.

## Variables y configuración de producción

### Frontend: Vercel

Seleccionar raíz del repositorio, preset Vite y Node 24.x. `vercel.json` define `npm ci`, `npm run build`, salida `dist` y fallback de rutas de BrowserRouter a `index.html`. Agrega nosniff, política de referrer y denegación de framing. No configura dominios ni un proxy de API.

| Variable | Valor pendiente |
| --- | --- |
| `VITE_AUTH_API_URL` | URL HTTPS del subdominio API confirmado, terminada en `/api/v1` |
| `VITE_OTAKUZONE_API_URL` | Exactamente la misma base API |
| `VITE_ANIME_API_URL` | Exactamente la misma base API |

El build rechaza ausencia, HTTP, localhost, loopback habitual, hosts `.local`, ruta distinta de `/api/v1`, usuario/contraseña embebidos, query/hash o bases diferentes. Esta comprobación no valida propiedad del dominio, DNS, TLS real ni que dos dominios sean del mismo sitio; eso se comprobará después. No constituye un detector completo de direcciones privadas.

No poner JWT_SECRET, DB_PASSWORD u otros secretos en variables VITE: son públicas y quedan incluidas en JavaScript. Las nuevas plantillas terminan en `.example` y no se cargan automáticamente. Tras confirmar valores habrá que configurarlos en Vercel y reconstruir. No reutilizar automáticamente producción en previews de dominios independientes.

La documentación de [Vite sobre entornos](https://vite.dev/guide/env-and-mode) describe la sustitución de variables en build. La configuración de SPA sigue la documentación de [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).

### Backend: Render

Preparación para un Web Service, sin crearlo:

| Ajuste | Configuración prevista |
| --- | --- |
| Root Directory | `backend` |
| Runtime | Node 24.x; `engines` queda acotado a esa rama |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| HOST | `0.0.0.0`; también es el default en producción |
| PORT | Usar la variable dinámica que proporciona Render |
| Health Check Path | `/api/v1/health`, con las limitaciones descritas abajo |

No establecer un PORT local en Render ni copiar `.env` de desarrollo. `server.js` ya usa `config.port`, validado entre 1 y 65535; las pruebas verifican un puerto distinto de 4000. Render exige escucha en `0.0.0.0` ([Web Services](https://render.com/docs/web-services)). La selección de Node y precedencia de NODE_VERSION/engines se documenta en [Render](https://render.com/docs/node-version): evitar que una variable de plataforma seleccione otra rama.

| Variables | Valor/criterio |
| --- | --- |
| `NODE_ENV` | `production`, definido por el hosting antes de iniciar Node |
| `CORS_ORIGINS` | Origen HTTPS exacto del frontend confirmado; sin rutas ni slash final. Varios únicamente si son necesarios, separados por comas |
| `TRUST_PROXY` | Lista de IP/CIDR de proxies realmente verificados; pendiente. No se ha supuesto ningún salto/IP de Render |
| `AUTH_ENABLED` | `true` |
| `CATALOG_SOURCE` | `mysql` |
| `DB_HOST`, `DB_PORT` | Endpoint y puerto del proveedor; host obligatorio explícito en producción |
| `DB_NAME` | Nombre del proveedor; el migrador actual sigue restringido a `otakuzone_db` |
| `DB_USER`, `DB_PASSWORD` | Cuenta runtime de privilegios mínimos y contraseña privada; sin valores en repositorio |
| `DB_SSL` | `true`, obligatorio cuando se carga configuración MySQL de producción |
| `DB_SSL_CA` | Opcional: CA PEM del proveedor; permite saltos reales o secuencias literales `\n` |
| `DB_POOL_SIZE` | Inicial 5; calcular total por réplicas y límites del proveedor |
| `DB_CONNECT_TIMEOUT_MS` | Inicial 5000; ajustar tras medir |
| `JWT_SECRET` | Secreto criptográfico de al menos 64 caracteres, compartido entre réplicas y protegido en Render |
| `JWT_TTL_SECONDS` | Inicial 1800; rango permitido 300–3600 |
| `BCRYPT_ROUNDS` | Inicial 12; rango 10–14 |
| `AUTH_RATE_MAX`, `AUTH_RATE_WINDOW_MS` | Inicial 10 / 900000 ms |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | Inicial 120 / 60000 ms |

Con NODE_ENV=production, el backend ya no lee `.env` de desarrollo. El despliegue debe definir expresamente AUTH_ENABLED y CATALOG_SOURCE como arriba; sus defaults generales se conservan por compatibilidad con desarrollo y pruebas. La aplicación no verifica por sí sola que todos los ajustes del panel correspondan al producto esperado.

### MySQL remoto

Se preserva el pool acotado, queries parametrizadas y `multipleStatements=false` para HTTP. TLS no admite desactivar `rejectUnauthorized`. Si no se especifica DB_SSL_CA, usa la confianza de certificados de Node; si el proveedor entrega CA privada, configurarla. No hay soporte añadido de certificado/clave cliente mTLS; evaluar si el proveedor lo exige.

El ejecutor de migraciones comparte ahora esas opciones TLS para evitar una futura incompatibilidad con el pool; **no se ejecutó**. No se cambiaron el manifest, checksums ni SQL. La creación/nombre fijo de base y datos demo continúan pendientes de una etapa autorizada. No usar el comando de migración como comprobación de conectividad.

## Seguridad conservada y ajustes pendientes

### Cookies y dominio

Producción conserva `__Host-otakuzone_session`, HttpOnly, Secure=true, SameSite=Lax, Path=/ y ausencia de Domain. Desarrollo conserva las opciones previas. Se mantiene fetch con `credentials: include`, CSRF por sesión, JWT HS256 con issuer/audience/expiración y sesiones revocables MySQL, bcrypt y autorización en el backend.

Al confirmar dominio, el frontend y la API deben usar HTTPS y pertenecer al mismo dominio registrable. Serán orígenes diferentes, por lo que se mantiene CORS exacto. No usar como solución final los dominios independientes de Vercel y Render con esta cookie Lax. No se cambió a SameSite=None ni se añadió Domain para compartir cookies.

No se eligió dominio, no se consultó disponibilidad y no se configuró DNS. Quedan pendientes:

1. Confirmar dominio y nombres reales de frontend/API bajo él.
2. Asignarlos a los servicios futuros y validar certificados/redirecciones HTTPS.
3. Completar las tres bases VITE y CORS_ORIGINS sin comodines ni orígenes de preview innecesarios.
4. Reconstruir y comprobar login/logout/expiración y CSRF en navegadores reales con esos hosts.

### CORS y proxies

Se mantienen CORS con credenciales, allowlist exacta y rechazo de HTTP en producción. Sin CORS_ORIGINS explícito, producción falla al cargar configuración. Las mutaciones siguen exigiendo Origin permitido, JSON y cabecera CSRF; solicitudes sin Origin no pasan esas defensas de escritura.

TRUST_PROXY acepta false o una lista explícita de IP/CIDR; no acepta true, alias ambiguos ni conteo supuesto de saltos. El default sigue siendo false y conserva comportamiento local. **Antes de publicar debe configurarse y verificarse la cadena real de Render:** false detrás del proxy puede agrupar clientes en el mismo contador. No copiar las direcciones reservadas de las pruebas al panel. Validar que no exista una ruta de acceso que permita falsificar una dirección confiable. [Express explica esta dependencia de la topología](https://expressjs.com/en/guide/behind-proxies/).

La prueba nueva verifica que cambiar la IP falsa al inicio de X-Forwarded-For no evade el límite cuando se confía solamente en el proxy inmediato simulado; no certifica la infraestructura de Render.

### AniList

Sin cambios funcionales. React usa la URL configurada de Express y el backend conserva el endpoint HTTPS fijo de AniList, operaciones GraphQL internas, validación, timeout, caché, deduplicación, cola acotada y tratamiento de 429/Retry-After. Estas lecturas no requieren una credencial nueva. No se llamó a AniList en vivo; las pruebas usan dobles. El presupuesto y la caché siguen siendo por proceso, pendiente de coordinación si hay varias réplicas.

### Archivos privados y publicación

`git check-ignore` confirmó exclusión de `.env`, `.env.local`, `backend/.env`, `.env.production` y `backend/.env.production`. `git ls-files` no mostró los tres archivos privados de entorno. Las plantillas `.env.production.example` sí quedan disponibles para versionar, sin secretos.

Esto no es un escaneo de secretos del historial. No servir backend, SQL, documentación privada, dumps ni `.git` como contenido estático. Vercel publica únicamente dist. No publicar dist-local ni usar el artefacto de comprobación como producción.

## Validaciones ejecutadas

Entorno: Node `v24.16.0`, npm `11.13.0`.

| Validación | Resultado |
| --- | --- |
| `npm run lint` | Aprobada |
| `npm test`, raíz | **22/22 aprobadas**, incluidas dos nuevas de configuración |
| `npm test`, backend | **33/33 aprobadas**, incluidas tres nuevas de configuración/proxy/TLS |
| `npm run build` | **Bloqueo esperado**: las variables locales no son una API productiva HTTPS; no hay dominio confirmado |
| `npm run build:local` | **Aprobado**, 2181 módulos transformados y salida dist-local |
| `npm run check:local` | **Aprobado**: configuración privada válida, Vite, módulos React, `/perfil`, preview y health/productos de API demo |
| Exclusiones Git | Aprobadas para los archivos de entorno privados revisados |
| `git diff --check` | Sin errores de whitespace |

Los runners de pruebas encontraron inicialmente `spawn EPERM` del sandbox; se reejecutaron con autorización fuera de él. No son fallos de la aplicación. Durante la preparación se corrigió el nombre inicial del modo local porque Vite reserva el modo `local`; el modo final es `local-preview` y el build final pasó.

El build local produjo JavaScript principal de aproximadamente 369 KB (112 KB gzip), CSS de 51 KB (8.5 KB gzip) e imágenes PNG de aproximadamente 1.9–2.8 MB cada una. La optimización de imágenes sigue pendiente.

**Límite de la comprobación local:** sirve y transforma React, pero no sustituye una sesión de navegador ni un login real. No se verificaron MySQL real, registro, login con cuentas existentes, escrituras de carrito/pedidos, certificados remotos ni la disponibilidad real de AniList. Esta limitación evita modificar datos y no se presenta como prueba integral aprobada.

## Riesgos que permanecen

- Dominio, DNS/TLS reales, proveedor MySQL y cadena de proxies sin confirmar; el proyecto está preparado para configurarlos, no certificado para publicar.
- Migraciones pendientes de revisión por nombre fijo, CREATE DATABASE, DDL parcial y datos demo; no ejecutar automáticamente en build/start.
- Sin ensayo actual de backups/restauración, grants mínimos, CA remota, UTC/sql_mode del servidor y presupuesto total de conexiones.
- Health estático sin readiness de MySQL y afectado por rate limiting; observabilidad, alertas y limpieza de sesiones pendientes.
- Límites y caché AniList en memoria por proceso; falta validación de carga y estrategia para réplicas.
- Falta build limpio Linux con npm ci y auditoría actual de dependencias; no se instalaron/actualizaron paquetes en esta etapa.
- Cabeceras básicas del frontend preparadas; CSP completa y política HSTS requieren revisión con dominios y recursos definitivos.
- Recuperación de cuentas, verificación de correo/MFA y protección adicional de registro continúan pendientes de decisión.
- Comercio y suscripciones siguen siendo demostrativos; no se añadieron pagos ni se eliminaron funcionalidades.

## Cierre

Etapa 2 finalizada. El entorno local comprobado sigue operativo dentro del alcance descrito. La configuración productiva queda deliberadamente incompleta donde requiere decisiones reales del usuario/proveedor. No se avanza a Etapa 3 sin autorización.
