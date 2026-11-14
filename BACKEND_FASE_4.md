# OtakuZone — Entrega Fase 4

Fecha: 13/11/2026. Backend Node.js/Express implementado dentro de `backend/`, manteniendo el frontend en su ubicación original. Documentación operativa, estructura, configuración y ejemplos HTTP: [backend/README.md](backend/README.md).

## Decisiones de arquitectura

- Paquete, lockfile, dependencias, scripts y proceso de backend independientes. No se movió el frontend ni se modificaron sus versiones o manifiestos.
- Rutas versionadas, controladores, servicios, repositorio, validadores, middleware y utilidades separados. `app.js` crea la aplicación sin escuchar; `server.js` carga dotenv, inicia el puerto y cierra ordenadamente.
- Se añadió `repositories/` para aislar la fuente de datos y permitir sustituirla por MySQL en una fase posterior. No hay SQL, credenciales ni dependencia mysql2.
- El repositorio demostrativo lee `mock/db.json`, la misma fuente que JSON Server, y valida el esquema, los identificadores únicos y referencias de categorías. No escribe ni duplica datos. Para distribuir solo la carpeta backend debe suministrarse un archivo equivalente mediante DEMO_DATA_PATH; la independencia es del paquete/proceso, no una copia automática de fixtures.
- Se incluyen promociones para conservar el Home existente. No se añade un proxy de animes: la integración directa con Jikan ya tiene sus servicios y no necesita duplicarse para entregar estos recursos propios. Jikan y el modo demo local permanecen sin cambios.
- El frontend elige un único proveedor de tienda por URL. Express es el valor por defecto; JSON Server se selecciona explícitamente mediante la variable pública existente. Un adaptador común reconoce el sobre Express o las listas JSON Server, sin fallback silencioso ni dos implementaciones de UI.

## API entregada

Base: **http://127.0.0.1:4000/api/v1**.

| Endpoint GET | Funcionalidad |
| --- | --- |
| `/health` | Liveness del servidor, sin datos de entorno |
| `/products` | Doce productos demostrativos; `q` y `categoryId` opcionales |
| `/products/:id` | Detalle por identificador, 404 si no existe |
| `/categories` | Cinco categorías |
| `/categories/:id` | Detalle de categoría, 404 si no existe |
| `/promotions` | Dos promociones demostrativas |

Éxitos: `{ "success": true, "data": ..., "meta": ... }`. Errores: `{ "success": false, "error": { "code": ..., "message": ..., "details": ... } }`; meta/details solo aparecen cuando corresponden. HEAD y OPTIONS no llevan cuerpo. Se validan parámetros conocidos, longitud/tipo de filtros e identificadores. Las colecciones sin coincidencias devuelven 200 con lista vacía.

Códigos probados: 200, 204, 400, 403, 404, 405, 413, 429 y 500. Los errores de validación no reflejan valores de entrada; los errores internos no devuelven detalles, rutas ni trazas, incluso en desarrollo.

## Seguridad y entorno

CORS permite únicamente los orígenes configurados y responde 403 a orígenes no autorizados; no habilita credenciales. Helmet y eliminación de X-Powered-By aplicados. JSON limitado a 10 KB. Rate limiting por IP bajo `/api/v1`, incluidos health y errores de ruta, con 120 solicitudes/60 segundos por defecto, cabeceras estándar y Retry-After. El preflight se responde antes del limitador.

Variables validadas: NODE_ENV, HOST, PORT, CORS_ORIGINS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX y DEMO_DATA_PATH. En producción CORS_ORIGINS debe definirse explícitamente con HTTPS. Los `.env` están ignorados y se versionan solo los ejemplos sin secretos.

Límites documentados: CORS no es autenticación; la API es pública y de lectura. El limitador guarda contadores en memoria por proceso y se reinicia al reiniciar. `trust proxy` está desactivado y debe revisarse al desplegar detrás de un proxy. No se desplegó ni se configuró TLS. Health no comprueba disponibilidad de Jikan, fixture ni una base de datos.

## Dependencias reales

Comprobadas mediante `npm ls --depth=0` en backend y fijadas en su lockfile:

| Dependencia | Versión |
| --- | --- |
| express | 5.3.0 |
| dotenv | 18.0.10 |
| cors | 2.8.6 |
| helmet | 8.3.0 |
| express-rate-limit | 8.7.4 |
| zod | 4.6.7 |

Node.js 24.16.0 y npm 11.13.0. Solo se instalaron estas seis dependencias directas en backend; se utiliza el runner de pruebas y watch nativos de Node. La instalación reportó cero vulnerabilidades mediante npm en esta sesión. No se instaló mysql2 y los manifiestos/dependencias del frontend permanecen intactos.

## Validaciones realmente ejecutadas

1. `npm start` dentro de backend: inició HTTP en 4000.
2. `npm run dev` dentro de backend: inició correctamente en modo watch después de detener el proceso anterior. El sandbox bloqueó inicialmente el proceso hijo del watch; se repitió con el permiso correspondiente.
3. `npm run check:http` dentro de backend: **21 solicitudes HTTP reales** al proceso activo. Health, colecciones/detalles, filtros combinados, vacío, entradas largas/repetidas/desconocidas, IDs inválidos, rutas inexistentes, métodos no admitidos, JSON inválido, cuerpo excesivo, CORS permitido/denegado y preflight.
4. `npm test` dentro de backend: **8 pruebas pasan**. Siete abren servidores HTTP temporales en puertos asignados por el sistema; comprueban los recursos desde el fixture, cabeceras, validaciones y errores. Incluyen rate limit 429, Retry-After, recuperación después de la ventana y un fallo interno intencional en modo producción cuya traza queda en el servidor. Una prueba de configuración detectó inicialmente una excepción no controlada ante una URL CORS inválida; se corrigió el refinamiento y la ejecución final pasó completa.
5. `npm test` en la raíz: **17 pruebas pasan**, incluidas las 16 anteriores y una nueva del contrato Express/JSON Server.
6. `npm run lint` en la raíz: correcto, sin advertencias de código.
7. `npm run build` del frontend: correcto, `dist/` generado.
8. `git diff --check`: sin errores de whitespace; Git informa su conversión habitual LF/CRLF en Windows.
9. `node scripts/audit-backend-browser.mjs`: Chrome consumió realmente **http://127.0.0.1:4000/api/v1** desde Vite en 5173. Doce productos, cinco categorías, filtro de mangas, vacío de Papelería, cuatro productos/dos promociones en Home, acceso a registro, favoritos y responsive de tienda en 320/390/768/1440. Respuestas HTTP 200 de productos/categorías/promociones registradas. Sin excepciones ni console.error de la aplicación en esta prueba. Un intento inicial del script necesitó corregir el ámbito de una variable del propio harness.
10. Se levantó temporalmente otra instancia de Vite en **5174**, con `VITE_OTAKUZONE_API_URL=http://127.0.0.1:3001`. La misma prueba Chrome, configurada para ese frontend y proveedor, pasó contra **JSON Server real**, con HTTP 200 y las mismas cantidades/interacciones. La instancia de prueba en 5174 se detuvo después; no se crearon ni sobrescribieron archivos `.env.local`.
11. Comprobación final de disponibilidad: Express health 4000, frontend 5173 y JSON Server products 3001 respondieron HTTP 200 al mismo tiempo.

La captura de Tienda con Express se abrió e inspeccionó visualmente: se mantiene Neo Tokyo y el aviso de datos demostrativos. El responsive automatizado no sustituye una auditoría completa de accesibilidad.

Las pruebas no fabricaron respuestas exitosas de Jikan. La suite del backend usa un fallo interno provocado solo para probar el caso negativo 500. Jikan no se modificó ni se declara validado de nuevo en esta fase; su limitación externa anterior sigue documentada.

## Comandos de arranque

Desde la raíz, para instalar de forma reproducible (no se ejecutó una reinstalación limpia con ci en esta sesión):

```sh
npm ci
npm --prefix backend ci
```

Terminal 1:

```sh
npm --prefix backend run dev
```

Terminal 2:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

JSON Server es opcional y permanece como herramienta simulada de desarrollo:

```sh
npm run api
```

Cambiar `VITE_OTAKUZONE_API_URL` a `http://127.0.0.1:3001` y reiniciar Vite para utilizar esa alternativa; no es necesario mantener ambos proveedores de tienda activos para usar la aplicación.

## Pendientes fuera de alcance

No se implementaron autenticación, registro remoto, sincronización de favoritos/perfil, CRUD, pagos ni persistencia definitiva. Productos y precios siguen siendo demostrativos. La siguiente fase puede implementar el contrato del repositorio con MySQL y su configuración, sin introducir SQL en controladores. No se creó esa integración todavía y no se avanzó a la Fase 5.
