# OtakuZone — Fase 2: integración de APIs

Fecha: 13/11/2026. Implementación realizada sobre la arquitectura consolidada, sin iniciar la Fase 3.

## Resultado y límite de la validación

La integración de servicios está implementada y la tienda consume JSON Server correctamente. **No se puede declarar validada la integración real completa con Jikan ni el consumo exitoso simultáneo de ambas fuentes:** Jikan no fue accesible desde el entorno de ejecución. Node, Chrome y una consulta adicional directa por IPv4 terminaron en timeout, sin respuesta HTTP de Jikan. No se fabricaron respuestas exitosas ni se usaron animes ficticios como reemplazo.

Los dos servidores locales documentados sí se iniciaron y se comprobaron. Mientras las solicitudes de Jikan fallaban, React mostró los productos y promociones de la API local y errores independientes en las secciones de anime. Esto verifica aislamiento de fallos, pero no equivale a que ambas APIs entreguen datos correctamente.

## Inspección y cambios

Antes de editar se inspeccionaron manifiestos, servicios existentes (no había), páginas Home/Animes/Tienda, rutas, tarjetas, diálogo, estilos/configuración y el script de auditoría anterior. Se conserva `BrowserRouter` con `/`, `/animes`, `/tienda`, `/favoritos`, `/cuenta` y `*`; no se crean rutas nuevas.

Archivos principales:

| Archivo | Responsabilidad |
| --- | --- |
| `src/services/http.js` | Cliente fetch compartido, HTTP, timeout, reintentos, cola, cancelación y caché |
| `src/services/jikan.js` | Populares, temporada, búsqueda paginada, detalles y géneros; adaptación de propiedades |
| `src/services/otakuzone.js` | Productos, categorías y promociones de JSON Server |
| `src/hooks/useResource.js` | useState/useEffect, carga, error, reintento e ignorar resultados cancelados |
| `src/components/common/ResourceState.jsx` | Carga, error accesible con Reintentar y vacío |
| `src/components/common/MediaImage.jsx` | Marcador visible para imagen ausente o con error |
| `src/components/home/AnimeCollection.jsx` | Reutiliza tarjetas y diálogo entre Home y catálogo |
| `src/components/home/AnimeSearchForm.jsx` | Formulario que conserva lo escrito al llegar géneros de forma asíncrona |
| `src/data/productImages.js` | Referencias a los cuatro assets de producto originales |
| `mock/db.json` | 12 productos, 5 categorías y 2 promociones demostrativas |
| `.env.example` | URLs públicas configurables |
| `tests/services.test.mjs` | Pruebas unitarias con dobles explícitos |
| `scripts/check-apis.mjs` | Verificación HTTP real, con código de salida fallido si una API falla |
| `scripts/audit-apis-browser.mjs` | Verificación React/Chrome con servicios reales y fallo intencional de conexión |

Home usa Jikan para populares, temporada actual y seis géneros. Muestra cuatro productos y las promociones desde JSON Server. Animes incorpora formulario por título/género, parámetros de URL, paginación y diálogo de detalles. Tienda muestra los doce productos y permite filtrar por categorías obtenidas de la API. La categoría Papelería existe y no tiene productos, para representar un vacío real del catálogo simulado.

Se reutilizan AnimeCard, AnimeSection, AnimeDetailsDialog, CategoryCard, ProductCard y SectionHeading. Las tarjetas de anime admiten puntuación nula, géneros/sinopsis ausentes e imagen faltante. La sinopsis larga se limita visualmente en las tarjetas y se muestra completa en el diálogo cuando llega el detalle. El diálogo conserva sus controles de cierre y comportamiento nativo de foco de la Fase 1.

Se retiraron las antiguas listas estáticas de anime/productos/géneros de `homeData.js`; los planes propuestos Free/Premium siguen allí, identificados como demostrativos. No se eliminó ni reemplazó ninguna imagen local. Los productos nuevos reutilizan imágenes ilustrativas originales, con aviso explícito; no se presentan como fotografías de variantes reales.

## Fuentes y endpoints

Base Jikan: **https://api.jikan.moe/v4**.

| Uso | Endpoint |
| --- | --- |
| Populares | `/top/anime?filter=bypopularity&limit=4&sfw=true` |
| Temporada actual | `/seasons/now?limit=4&sfw=true` |
| Catálogo/búsqueda | `/anime?page=1&limit=12&sfw=true&order_by=popularity&sort=asc` y opcionalmente `q`/`genres` |
| Detalles | `/anime/{id}/full` |
| Géneros | `/genres/anime?filter=genres` |

Las respuestas se adaptan a `id`, `title`, `genre`, `score`, `season`, `image`, `imageAlt`, `description`, `episodes` y `status`. Se comprueban listas e identificadores y se eliminan duplicados de anime por mal_id. No se asume que puntuación, temporada, sinopsis o imágenes existan. Los animes se identifican como información real de Jikan/MyAnimeList; sus textos pueden estar en inglés. «Últimos lanzamientos» muestra una selección de temporada actual y no promete orden cronológico.

Base local: **http://127.0.0.1:3001**, recursos `/products`, `/categories`, `/promotions`. Todo su contenido comercial se identifica como ficticio. Sin pagos, compras, stock real ni activación de suscripciones.

Documentación consultada: [Jikan](https://docs.api.jikan.moe/), [OpenAPI oficial de Jikan](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json) y [JSON Server estable 0.17.4](https://github.com/typicode/json-server/tree/v0.17.4). La documentación actual de la rama principal de JSON Server corresponde a la versión beta 1; se eligió y fijó la versión estable 0.17.4, usando sus opciones de CLI.

## Ejecución reproducible

Desde la raíz, instalación conforme al lockfile:

```sh
npm ci
```

En esta sesión se ejecutó `npm install --save-dev --save-exact json-server@0.17.4`; no se ejecutó una reinstalación limpia con `npm ci`. La instalación finalizó con cero vulnerabilidades reportadas por npm. `npm ls --depth=0` confirmó que las versiones anteriores de las dependencias directas no migraron: React/React DOM 19.3.1, Vite 8.3.8, Tailwind/@tailwindcss/vite 4.3.5, React Router DOM 7.18.5 y las demás dependencias preexistentes. Solo se añadió JSON Server como dependencia directa de desarrollo, junto con sus transitivas; no se añadió Axios ni una biblioteca de pruebas.

Terminal 1:

```sh
npm run api
```

Comando expandido y ejecutado: `json-server --watch mock/db.json --host 127.0.0.1 --port 3001`.

Terminal 2:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Comprobado Vite en **http://127.0.0.1:5173/**. Un servidor anterior ocupaba ese puerto; se detuvo la instancia iniciada durante la auditoría previa y se volvió a iniciar correctamente con este comando. JSON Server continuó activo al mismo tiempo.

Jikan no requiere levantar un proceso local ni registrar una clave. Se necesita conexión a su URL pública. Las URLs de Vite se pueden modificar con `.env.local` usando las variables de `.env.example`, reiniciando el frontend. No poner secretos en variables `VITE_*`.

Para repetir las verificaciones con los servidores activos:

```sh
npm run check:apis
node scripts/audit-apis-browser.mjs
npm test
npm run lint
npm run build
```

El script de navegador necesita Chrome o Edge instalado y Node 24. `CHROME_PATH` permite otro ejecutable, `AUDIT_URL` otro frontend. `scripts/audit-browser.mjs` delega ahora en la auditoría vigente, para evitar mantener comprobaciones antiguas que asumían ocho animes ficticios. Los perfiles/capturas se guardan en el directorio temporal del sistema y se imprimen sus rutas.

## Robustez

- Se utiliza exclusivamente `fetch`. Los componentes no realizan HTTP directamente.
- Timeout de 15 segundos por intento. Máximo dos intentos automáticos para conexión, 429 y 5xx; los 4xx restantes no se reintentan automáticamente.
- `Retry-After` se interpreta como segundos o fecha. Una espera superior a 10 segundos produce un error visible para reintentar manualmente; no se ignora enviando otro intento inmediato.
- Una cola compartida por pestaña espacia los inicios de Jikan al menos 1.1 segundos. No coordina pestañas ni otros clientes de la misma IP; un 429 sigue siendo posible.
- Las búsquedas se envían con el formulario, no con cada pulsación. Se comparten solicitudes de URL idéntica y se guardan éxitos 60 segundos en Jikan/30 segundos en tienda, con caché acotada. Los errores HTTP, JSON o de esquema no se conservan como éxitos en caché.
- Cada consumidor tiene su cancelación. Al desmontar se aborta su suscripción; el transporte se aborta cuando no quedan consumidores. El ciclo adicional de StrictMode puede reutilizar la solicitud en curso.
- Un cambio de consulta/página no muestra resultados anteriores como si fueran actuales. No se actualiza estado desde peticiones canceladas.
- Imágenes inexistentes o fallidas muestran «Imagen no disponible», sin asignar una portada ficticia a un anime real.

## Validaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Inicio de JSON Server con `npm run api` | Correcto, puerto 3001 |
| `/products` | HTTP 200, 12 registros |
| `/categories` | HTTP 200, 5 registros en la base final |
| `/promotions` | HTTP 200, 2 registros |
| Inicio de Vite con el comando documentado | Correcto, puerto 5173 |
| React: Home | Cuatro productos y promociones de la API local; secciones Jikan en error |
| React: Tienda | Doce productos dinámicos visibles |
| Carga | Mensaje observado en Chrome antes de resolverse las solicitudes |
| Vacío | Selección de Papelería: cero tarjetas y mensaje sin productos |
| Error y recuperación | Bloqueo intencional de `/products` mediante CDP; error visible, desbloqueo, Reintentar y doce tarjetas recuperadas desde el servidor real |
| Responsive | Sin desbordamiento horizontal en la comprobación de Tienda a 320/390/768/1440 px |
| Jikan desde Node | Timeout de conexión; incluso repitiendo fuera del sandbox |
| Jikan desde Chrome | `net::ERR_CONNECTION_TIMED_OUT`; sin registros de anime recibidos |
| Consulta directa IPv4 con curl | Timeout, HTTP 000; no es un estado HTTP del servidor |
| Ambas fuentes entregando datos simultáneamente | **No validado: Jikan no accesible** |
| `npm run check:apis` | Código 1 por Jikan; JSON Server sí pasa |
| Auditoría Chrome | Comprueba la tienda y errores; código 1 por no poder comprobar el éxito simultáneo |
| `npm test` | 9 pruebas correctas, 0 fallidas |
| `npm run lint` | Correcto, sin advertencias |
| `npm run build` | Correcto, producción generada en dist |
| `git diff --check` | Sin errores de whitespace; avisos de conversión LF/CRLF de Git en Windows |

Las pruebas unitarias usan respuestas controladas explícitas y prueban: propiedades ausentes/esquema, 404, JSON inválido, 429/Retry-After, 503/desconexión, deduplicación/caché, invalidación de esquema, cancelación compartida, cancelación final y cola. No se presentan como respuestas reales de Jikan. El runner necesitó permiso para crear el proceso hijo fuera del sandbox; tras concederlo pasó.

Las capturas de Tienda y Animes se abrieron y revisaron visualmente: tarjetas/productos y formulario/mensajes de error mantienen Neo Tokyo. No se observaron excepciones de JavaScript ni llamadas `console.error` de la aplicación en la auditoría completada. **Sí hubo errores de red por Jikan y los fallos intencionales de la prueba**: no se afirma que la consola/red estuvieran completamente libres de errores externos.

## Pendientes

1. Repetir `npm run check:apis` y la auditoría Chrome desde una conexión con acceso a Jikan. Deben pasar populares, temporada, géneros, búsqueda, detalles y el consumo simultáneo con JSON Server. El renderizado real de animes, detalle remoto, búsqueda/paginación y filtros contra Jikan quedan pendientes de esa validación; no se da por aprobado lo que no respondió.
2. El despliegue necesita hospedar la API simulada en una URL accesible y configurar el fallback de BrowserRouter. No se desplegó ni se validaron otros motores de navegador o lectores de pantalla.
3. JSON Server es una simulación local. No se construyó un backend Express, no se conectó MySQL y no se inició la Fase 3.
