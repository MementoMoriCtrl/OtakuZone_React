# OtakuZone API

## Fase 5 — MySQL

Se conserva el API de Fase 4 y se incorpora mysql2 con pool, repositorio de catálogo y transacciones. El modelo contiene las doce entidades solicitadas, promociones para el Home existente y metadata de migraciones. No se añade autenticación ni una API pública de escrituras.

Documentación de base de datos: [database/README.md](database/README.md). Diagrama y decisiones: [database/MODELO.md](database/MODELO.md). Resultados realmente ejecutados: [informe de Fase 5](../MYSQL_FASE_5.md).

Validación completada en MySQL 8.0.46: cuatro migraciones, 14 tablas InnoDB, 12 FK y 18 CHECK activos. El catálogo local está configurado con CATALOG_SOURCE=mysql y se comprobaron persistencia, rollback y lectura real de SQL desde HTTP/React. Las credenciales permanecen exclusivamente en el .env ignorado.

Desde la raíz del proyecto, después de configurar únicamente en `backend/.env` las credenciales locales:

```sh
npm --prefix backend run db:migrate
npm --prefix backend run db:check
npm --prefix backend run db:verify
```

Para usar MySQL en Express, establecer `CATALOG_SOURCE=mysql` en ese archivo y reiniciar el backend. `CATALOG_SOURCE=demo` conserva el fixture de desarrollo; no es un fallback de conexión. Los scripts db:* siempre usan MySQL real y fallan si no hay acceso. No se ha declarado éxito de MySQL a partir de pruebas unitarias ni del modo demo.

`backend/.env.example` no contiene una contraseña ni una cuenta administrativa real. El `.env` local permanece ignorado. La cuenta temporal autorizada para desarrollo no se crea ni altera desde estas migraciones; la documentación incluye una alternativa de mínimo privilegio para la aplicación.

## Referencia de la API y configuración de Fase 4

Backend independiente de solo lectura, con Node.js, Express 5 y módulos ES. El frontend permanece en la raíz y no se sirve desde Express. No hay autenticación, MySQL, escrituras ni persistencia definitiva.

## Instalación y ejecución

Entorno comprobado: Node.js 24.16.0 y npm 11.13.0. Desde la raíz del proyecto:

```sh
npm --prefix backend ci
npm --prefix backend run dev
```

También puedes entrar a `backend/` y ejecutar `npm ci` y `npm run dev`. El modo desarrollo usa `node --watch`, sin nodemon. Para iniciar sin watch:

```sh
npm --prefix backend start
```

URL por defecto: **http://127.0.0.1:4000/api/v1**. `start` y `dev` se ejecutaron realmente en esta entrega. La instalación se realizó con `npm install --save-exact express dotenv cors helmet express-rate-limit zod`; el lockfile independiente permite repetirla con `npm ci`.

En otra terminal, desde la raíz del frontend:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir http://127.0.0.1:5173/tienda. El servicio existente del frontend usa Express por defecto, sin necesidad de `.env.local`. Si ya tienes `VITE_OTAKUZONE_API_URL` configurada, esa variable tiene prioridad: para Express debe ser `http://127.0.0.1:4000/api/v1`. Reiniciar Vite tras cambiar variables de entorno.

## Configuración

`backend/.env` es opcional en desarrollo. Para crearlo, copiar `backend/.env.example` a `backend/.env`. Dotenv carga ese archivo independientemente del directorio de ejecución; las variables del proceso tienen prioridad. Ambos `.env.example` se versionan; los archivos `.env` reales están ignorados por Git.

| Variable | Desarrollo / significado |
| --- | --- |
| NODE_ENV | `development`; también admite `test` y `production` |
| HOST | `127.0.0.1`; usar una interfaz explícita si el entorno de despliegue lo requiere |
| PORT | `4000`, entero entre 1 y 65535 |
| CORS_ORIGINS | Orígenes exactos separados por comas, sin barra final ni credenciales. Por defecto localhost/127.0.0.1 en 5173 y 4173 |
| RATE_LIMIT_WINDOW_MS | `60000`, entre 1000 y 3600000 |
| RATE_LIMIT_MAX | `120` solicitudes por IP y ventana; entre 1 y 100000 |
| DEMO_DATA_PATH | `../mock/db.json`, relativa a `backend/`; también admite ruta absoluta |

En producción se exige definir CORS_ORIGINS explícitamente con HTTPS; no se heredan los orígenes de desarrollo. Ejemplo sin secretos:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
CORS_ORIGINS=https://otakuzone.example
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
DEMO_DATA_PATH=../mock/db.json
```

Los parámetros inválidos impiden iniciar el servidor, mostrando solo los nombres de configuración afectados. El cliente nunca recibe variables de entorno, rutas internas o trazas, tampoco en desarrollo. El backend no implementa TLS: en un despliegue público se necesita terminación HTTPS. `trust proxy` permanece desactivado; un despliegue detrás de proxy debe configurar y verificar sus saltos de confianza antes de usar IPs reenviadas. No se desplegó esta aplicación.

## Estructura y responsabilidades

```text
backend/
  src/
    config/env.js
    controllers/catalogController.js
    controllers/healthController.js
    routes/index.js
    services/catalogService.js
    repositories/demoCatalogRepository.js
    middlewares/validate.js
    middlewares/errors.js
    validators/catalog.js
    utils/HttpError.js
    utils/responses.js
    app.js
    server.js
  tests/http.test.js
  scripts/check-http.js
  .env.example
  package.json
  package-lock.json
  README.md
```

`app.js` compone middleware/rutas, sin abrir puertos al importarlo; `server.js` carga entorno, inicia el servidor y gestiona cierre por SIGINT/SIGTERM. Los controladores envían respuestas, los servicios gestionan casos de uso y 404, y el repositorio obtiene los datos.

Se añadió `repositories/` como frontera para la fase futura de base de datos. El repositorio actual lee y valida el archivo demostrativo compartido `mock/db.json`, sin escribirlo ni duplicarlo: 12 productos, 5 categorías y 2 promociones. Esta elección conserva una única fuente coherente con JSON Server. El proceso y las dependencias del backend son independientes, pero su configuración predeterminada necesita ese archivo de la raíz; para distribuir solo `backend/`, proporcionar un archivo de datos equivalente mediante DEMO_DATA_PATH. No se han creado conexiones, tablas, modelos SQL ni dependencias mysql2.

## Endpoints

Todos son públicos y de consulta. Base: `http://127.0.0.1:4000/api/v1`.

| Método / ruta | Descripción |
| --- | --- |
| GET `/health` | Liveness del proceso; no prueba MySQL ni Jikan |
| GET `/products` | Productos demostrativos; filtros opcionales `q` y `categoryId` |
| GET `/products/:id` | Producto por identificador; 404 si no existe |
| GET `/categories` | Categorías de productos |
| GET `/categories/:id` | Categoría por identificador; 404 si no existe |
| GET `/promotions` | Promociones demostrativas usadas en Home |

`HEAD` se atiende como GET sin cuerpo; `OPTIONS` permite preflight CORS sin cuerpo. No se admiten métodos de escritura: devuelven 405 en recursos conocidos. Las rutas desconocidas devuelven 404. Las colecciones vacías son 200 con `data: []`, no 404.

Los identificadores admiten letras minúsculas ASCII, números y guiones, hasta 64 caracteres. `q` admite hasta 100 caracteres. No se admiten parámetros desconocidos o repetidos ni arrays en lugar de strings. No hay paginación en este catálogo pequeño de doce productos; las colecciones se devuelven completas.

### Solicitudes y respuestas

En PowerShell, usar `curl.exe` para evitar el alias histórico de curl:

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/health"
```

HTTP 200:

```json
{"success":true,"data":{"status":"ok","service":"otakuzone-api","version":"v1"}}
```

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/categories/figuras"
```

HTTP 200:

```json
{"success":true,"data":{"id":"figuras","name":"Figuras coleccionables"},"meta":{"source":"demo"}}
```

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/products?categoryId=papeleria"
```

HTTP 200:

```json
{"success":true,"data":[],"meta":{"source":"demo","count":0}}
```

Consultas de colección y detalle que devuelven los registros completos:

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/products"
curl.exe -i "http://127.0.0.1:4000/api/v1/products?categoryId=mangas&q=volumen"
curl.exe -i "http://127.0.0.1:4000/api/v1/products/figura-mensajera"
curl.exe -i "http://127.0.0.1:4000/api/v1/categories"
curl.exe -i "http://127.0.0.1:4000/api/v1/promotions"
```

Los productos contienen `id`, `name`, `categoryId`, `price`, `imageKey`, `imageAlt` y `description`. El frontend sigue resolviendo sus imágenes locales mediante imageKey; Express no duplica ni sirve los assets. Cada colección añade `meta.source: "demo"` y `meta.count`.

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/products/no-existe"
```

HTTP 404:

```json
{"success":false,"error":{"code":"PRODUCT_NOT_FOUND","message":"El producto solicitado no existe."}}
```

```sh
curl.exe -i "http://127.0.0.1:4000/api/v1/products?categoryId=../secret"
```

HTTP 400:

```json
{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Los parámetros de la solicitud no son válidos.","details":[{"field":"query.categoryId","message":"Parámetro no admitido o valor inválido."}]}}
```

Otros códigos: 403 `CORS_ORIGIN_DENIED`; 404 `CATEGORY_NOT_FOUND`/`ROUTE_NOT_FOUND`; 405 `METHOD_NOT_ALLOWED` con cabecera Allow; 400 `INVALID_JSON`/`INVALID_PATH`; 413 `PAYLOAD_TOO_LARGE`; 429 `RATE_LIMITED` con Retry-After; 500 `INTERNAL_ERROR` con mensaje genérico. El detalle de fallos internos queda en el log del servidor, no en la respuesta.

### CORS y seguridad aplicada

```sh
curl.exe -i -H "Origin: http://127.0.0.1:5173" "http://127.0.0.1:4000/api/v1/products"
curl.exe -i -H "Origin: https://untrusted.example" "http://127.0.0.1:4000/api/v1/products"
curl.exe -i -X OPTIONS -H "Origin: http://127.0.0.1:5173" -H "Access-Control-Request-Method: GET" "http://127.0.0.1:4000/api/v1/products"
```

Resultados: 200 con Access-Control-Allow-Origin exacto; 403 sin autorización CORS; preflight 204. No se habilitan cookies/credenciales. Clientes sin Origin pueden consultar la API pública: CORS no es autenticación ni impide clientes HTTP externos.

Helmet aplica cabeceras de seguridad y se elimina X-Powered-By. Los cuerpos JSON tienen un máximo de 10 KB, las entradas se validan con Zod y los errores son centralizados. Rate limiting se aplica bajo `/api/v1` (incluye health), después del preflight: por defecto 120 solicitudes por IP en 60 segundos, con cabeceras estándar. Su almacén es en memoria por proceso, se reinicia con el servidor y no coordina múltiples réplicas.

## Frontend, Jikan y JSON Server

La integración es configurable mediante una sola variable pública del frontend:

```dotenv
VITE_OTAKUZONE_API_URL=http://127.0.0.1:4000/api/v1
```

`src/services/otakuzone.js` sigue siendo el único servicio de productos/categorías/promociones. Su adaptador acepta el sobre de Express o las listas originales de JSON Server. No hay consultas simultáneas a ambos proveedores ni fallback automático. Todos los datos comerciales siguen identificados como demostrativos.

Para continuar usando la simulación de desarrollo, mantener `npm run api` en la raíz (puerto 3001) y cambiar explícitamente la variable a `http://127.0.0.1:3001`. Reiniciar Vite. No se modificaron ni eliminaron JSON Server ni `mock/db.json`.

Jikan conserva sus servicios directos, configuración, caché, filtros y manejo de errores del frontend. No se añade un proxy `/animes` en Express: no es necesario para estos endpoints propios, duplicaría una integración existente y su disponibilidad externa no ha quedado validada. El modo demo local de anime también se conserva. No se afirma una nueva validación exitosa de Jikan.

## Pruebas y versiones

Con el backend activo, desde la raíz:

```sh
npm --prefix backend run check:http
npm --prefix backend test
npm test
npm run lint
npm run build
node scripts/audit-backend-browser.mjs
```

- `check:http`: 21 solicitudes HTTP reales al proceso activo, incluyendo CORS/preflight, validaciones, errores y límites de cuerpo.
- Pruebas de backend: 8 correctas; siete abren servidores HTTP temporales reales. Incluyen 429 y recuperación de la ventana, además de un fallo interno provocado para comprobar la ocultación de trazas en producción.
- Pruebas de frontend: 17 correctas, incluido el contrato Express/JSON Server.
- La auditoría Chrome usa un perfil temporal y el frontend activo; comprueba los recursos realmente recibidos del proveedor configurado, doce productos, filtros/vacío, Home/promociones y continuidad de favoritos/cuenta/responsive. No falsifica respuestas exitosas de APIs.

Versiones instaladas y bloqueadas: Express 5.3.0, dotenv 18.0.10, cors 2.8.6, helmet 8.3.0, express-rate-limit 8.7.4 y Zod 4.6.7. No se añadió mysql2. La instalación reportó cero vulnerabilidades en el análisis de npm de esta sesión; esto no sustituye una auditoría de seguridad.

Fuentes oficiales consultadas: [Express 5](https://expressjs.com/en/5x/api/), [Helmet](https://helmet.js.org/), [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration) y [Zod](https://zod.dev/api).

No se implementó autenticación ni persistencia MySQL. No se avanzó a la Fase 5.
