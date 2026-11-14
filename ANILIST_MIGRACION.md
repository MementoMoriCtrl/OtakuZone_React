# OtakuZone — migración de Jikan a AniList

Fecha: 14 de noviembre de 2026, America/Lima.

## Resultado

**AniList es el proveedor activo del catálogo público, centralizado en Express. Las cinco consultas reales y la integración React → Express → AniList están validadas.** El diseño Neo Tokyo y la arquitectura React existente se conservan. Home mostró simultáneamente datos reales de AniList y productos procedentes de MySQL en el entorno aislado.

No se modificaron autenticación, tienda, carrito, pedidos, suscripciones, administración, credenciales MySQL ni migraciones. El único cambio en el montaje general del backend es añadir el router público de anime. No se instaló ninguna dependencia, no se implementó OAuth ni se hizo commit. No se avanzó a FASE 10.

El pendiente de conectividad **del nuevo proveedor AniList** queda resuelto en las pruebas descritas. Esto no demuestra que Jikan haya vuelto a responder ni resuelve la propuesta manual de separación de privilegios MySQL de `FASE_9_CORRECCIONES.md`, que permanece intacta y pendiente de revisión humana.

## Auditoría y funcionalidades conservadas

Antes, `src/services/jikan.js` consultaba Jikan desde el navegador; Home, animeCatalog, Animes y el modal consumían el modelo normalizado. `useResource` gestionaba carga/error/reintento/cancelación; AnimeSearchForm conservaba los filtros en URL y aplicaba debounce de 450 ms. Favoritos usaba almacenamiento local versión 1 y clave source:id.

Se conservan tarjetas, modal nativo con cierre/Escape/foco, búsqueda por título, combinación de género/estado/orden, paginación, favoritos persistentes, estados de carga/vacío/error y modo demo explícito. Los hooks/contextos de autenticación y suscripciones no se modifican. Demo sigue cargándose localmente y no se presenta como una respuesta de AniList.

Los cambios visuales se limitan a atribución del proveedor, interpretación correcta de popularidad y campos del detalle solicitados: formato/fecha, personajes e información relacionada. No se reconstruyó la página ni el sistema visual.

## Arquitectura

```text
Home / Animes / modal
  → src/services/anilist.js
  → GET Express /api/v1/anime...
  → controlador y validadores AniList
  → servicio de catálogo
  → cliente compartido con caché/cola/cuota
  → POST https://graphql.anilist.co
  → adaptador a DTO compatible con React
```

Backend separado en:

- `backend/src/routes/anilist.js`: endpoints públicos, métodos permitidos y Retry-After.
- `controllers/anilistController.js`: sobre JSON y meta.source=anilist.
- `validators/anilist.js`: filtros/IDs/paginación estrictos.
- `services/anilistService.js`: variables y temporada UTC.
- `services/anilistClient.js`: POST fijo, caché, deduplicación, presupuesto y errores.
- `services/anilistQueries.js`: consultas GraphQL constantes.
- `services/anilistAdapter.js`: normalización, puntuación y texto seguro.

No se acepta una consulta GraphQL aportada por el cliente. React únicamente envía parámetros del catálogo mediante GET; el POST GraphQL ocurre en el servidor. No hay tokens AniList, cabecera Authorization, OAuth ni consultas contra usuarios privados de AniList.

## Endpoints Express

Todos bajo `/api/v1`, públicos y sujetos a los controles CORS/rate limit generales existentes:

| GET | Parámetros admitidos | Resultado |
| --- | --- | --- |
| /anime/popular | Ninguno | Cuatro populares, orden POPULARITY_DESC |
| /anime | q, genre, status, order, page | Página de hasta 12 resultados |
| /anime/genres | Ninguno | Géneros nombrados desde GenreCollection |
| /anime/season | season, year, page | Temporada/año indicados o trimestre UTC actual |
| /anime/:id | ID numérico positivo | Información, personajes y relaciones |

Ejemplo real de búsqueda validada:

```text
GET /api/v1/anime?q=Naruto&genre=Action&status=complete&order=score&page=1
```

Validación: título hasta 150 caracteres, género nombrado de hasta 50, estados airing/complete/upcoming, orden popularity/score, páginas 1–100. Temporadas WINTER/SPRING/SUMMER/FALL y años 1940–2100. ID positivo de hasta nueve cifras. Parámetros desconocidos/repetidos, arrays y GraphQL arbitrario se rechazan antes del transporte remoto. Las escrituras POST/PUT/PATCH/DELETE sobre estas rutas no están expuestas (405).

Las páginas se limitan a 100 tanto en servidor como en la UI; hasNext=false al alcanzar el límite, aunque el proveedor disponga de más resultados. La selección de trimestre actual se obtiene en UTC; no es un listado de todos los animes actualmente en emisión de temporadas previas.

## Consultas GraphQL implementadas

Las consultas completas se encuentran en [anilistQueries.js](backend/src/services/anilistQueries.js); las entradas se envían en `variables`, nunca concatenadas en el texto GraphQL.

| Operación | Variables y alcance |
| --- | --- |
| AnimeCatalog | page/perPage, search, genre, status, sort, season y year. Page.media con type=ANIME e isAdult=false. Reutilizada por populares, búsqueda y temporadas. |
| AnimeGenres | GenreCollection; no recibe entradas de usuario. Se excluye Hentai del selector y las consultas de medios mantienen isAdult=false. |
| AnimeDetails | id; Media de tipo ANIME, isAdult=false, personajes MAIN (hasta seis) y relaciones de franquicia. |

Las variables opcionales no seleccionadas **se omiten**, en lugar de enviarse como null. Durante la primera prueba real, null en los filtros opcionales produjo listas vacías; la omisión corrigió el comportamiento y quedó cubierta por una prueba de regresión.

Campos de listado/detalle: ID AniList, títulos romaji/inglés/nativo, portada HTTPS, banner opcional, descripción, géneros, estado, formato, averageScore, popularity, episodios, fecha de inicio parcial, season y seasonYear. El detalle añade nombres/imágenes de personajes principales y relación/ID/título/temporada/año de otros medios. El adaptador filtra relaciones a ANIME y limita lo mostrado a doce, sin asumir que toda relación sea una temporada o secuela.

Referencias oficiales consultadas: [GraphQL](https://docs.anilist.co/guide/graphql/), [consultas Media](https://docs.anilist.co/guide/graphql/queries/media), [referencia Media](https://docs.anilist.co/reference/object/media) y [Page](https://docs.anilist.co/reference/object/page). La apertura directa de algunas páginas devolvió 403 al lector de documentación; los resultados indexados oficiales y las consultas reales al endpoint permitieron contrastar el esquema utilizado. No se omitió TLS ni se alteraron controles de acceso.

## Adaptación de datos y diferencias con Jikan

| Antes | Ahora |
| --- | --- |
| ID MyAnimeList/mal_id, source=jikan | ID AniList/id, source=anilist. No son intercambiables. |
| Géneros con IDs numéricos | Géneros con nombres como Action o Slice of Life; se codifican en las URLs. |
| score 0–10 | averageScore 0–100, dividido entre diez para las tarjetas existentes. Sin puntuación: null/S/P. |
| popularity como posición en ranking | popularity como cantidad de usuarios que lo tienen en sus listas; la tarjeta indica Usuarios en listas, sin usar #. |
| Estados Jikan | RELEASING/FINISHED/NOT_YET_RELEASED se adaptan a airing/complete/upcoming; CANCELLED/HIATUS se muestran con su estado real. |
| HTTP GET desde React al proveedor | React consulta Express; Express hace POST GraphQL con variables. |

El DTO conserva title, image/imageAlt, description, genre/genreIds, score, popularity, status/statusCode, season y episodes. Añade titles, banner, format y startDate. No rellena episodios, puntuaciones o fechas ausentes con datos ficticios.

La descripción se normaliza a texto y React la representa sin dangerouslySetInnerHTML. Se eliminan etiquetas del proveedor; las imágenes deben usar HTTPS. El modal muestra campos adicionales únicamente cuando existen. Las relaciones son información de catálogo, no reproducción de episodios ni acceso a streaming.

Los enlaces anteriores con géneros numéricos no se convierten a nombres AniList mediante equivalencias inventadas. Los filtros numéricos del demo siguen funcionando; en el catálogo AniList solo se admiten nombres de género válidos sintácticamente.

## Favoritos existentes

Se conserva `otakuzone.favorites.v1` y su versión. El lector admite source=anilist, source=jikan y source=demo. Las claves `anilist:1`, `jikan:1` y `demo:demo-1` son distintas; no se mezclan IDs.

No hay borrado masivo ni migración automática por ID. Los antiguos Jikan se muestran como **favorito anterior**, conservando su snapshot; su modal explica que pueden estar desactualizados. `getCatalogDetails` devuelve ese snapshot sin solicitar el ID MAL a AniList y sin contactar Jikan. El usuario puede quitarlos explícitamente o guardar el resultado correspondiente del nuevo proveedor.

`src/services/jikan.js` queda marcado como legado y solo se conserva para pruebas históricas del adaptador anterior; no forma parte del grafo de imports de React activo. El bundle compilado no contiene el endpoint api.jikan.moe. Los scripts históricos explícitos de Jikan siguen siendo antecedentes; `audit-browser.mjs` y `check:apis` apuntan a la integración nueva.

## Caché, concurrencia y cuota

La documentación oficial advierte que la cuota está temporalmente reducida a **30 solicitudes/minuto**; no se presupone disponibilidad de 90. [Límites oficiales](https://docs.anilist.co/guide/rate-limiting).

El cliente Express, compartido por todas las rutas de anime de una instancia:

- Presupuesto máximo de **28 inicios por ventana móvil de 60 segundos** y separación de 2.2 segundos entre inicios. Reduce el presupuesto si X-RateLimit-Limit indica uno inferior.
- Una solicitud remota en vuelo; hasta ocho claves distintas pendientes. Demasiada cola produce 503; cuota/espera excesiva de inicio produce 429 con Retry-After. No se mantienen esperas automáticas de minutos dentro de una petición.
- Deduplicación de consultas idénticas pendientes y caché de DTO válidos durante 60 segundos, máximo 100 entradas. Variables distintas forman claves distintas. Errores HTTP, JSON, GraphQL y DTO inválidos no quedan cacheados.
- HTTP 429 o error GraphQL 429 bloquea nuevas consultas remotas hasta Retry-After/X-RateLimit-Reset; sin indicación, utiliza una espera conservadora de 60 segundos. Una respuesta con Remaining=0 también activa la pausa. Las respuestas ya cacheadas siguen disponibles.
- Timeout de transporte de diez segundos. No hace reintentos automáticos contra AniList. La espera de cola y el procesamiento pueden aumentar la duración total de la operación.

El frontend conserva el cliente HTTP compartido: caché corta de 15 segundos para anime, cancelación por consumidor y hasta un reintento acotado de conexión/429/5xx según sus reglas existentes; Retry-After largo se ofrece como reintento manual. No se agrega otra librería ni un bucle de reintentos GraphQL. El backend no salta su pausa aunque el navegador repita una petición.

Estos límites/caché son **por proceso**, no distribuidos entre workers, despliegues o herramientas CLI independientes. Deben coordinarse las consultas si comparten IP. Una búsqueda rápida puede recibir 429/503 y mostrar Reintentar; no se garantiza disponibilidad permanente del proveedor. La cancelación del navegador no garantiza cancelar un trabajo remoto ya iniciado o compartido.

## Errores

- 400: parámetros propios inválidos; no se consulta AniList.
- 404: anime inexistente.
- 405: método no admitido; no se acepta POST de GraphQL arbitrario desde React.
- 429: cuota o pausa; Retry-After expuesto por los controles CORS existentes.
- 503: conexión o cola no disponible; 504: timeout de transporte.
- 502: respuesta HTTP/JSON/GraphQL/DTO inválida del proveedor.

No se devuelve al frontend el mensaje interno de GraphQL ni trazas. Error, vacío y demo son estados distintos. React conserva ResourceState y Reintentar, sin reemplazar automáticamente una llamada fallida por registros ficticios.

## Pruebas ejecutadas

### Reales contra AniList

`node backend/scripts/check-anilist.js` terminó con código 0, sin mocks ni respuesta demo:

| Consulta POST real | Resultado |
| --- | --- |
| Populares | PASS, cuatro registros |
| Búsqueda Naruto + Action + complete + score | PASS, doce resultados; estado y género contrastados en los DTO |
| Géneros | PASS, colección con Action |
| Temporada actual | PASS, doce resultados |
| Detalle | PASS, ID consistente con el consultado |

La primera ejecución había devuelto listas vacías por filtros null y terminó con código 1; no se cuenta como aprobación. Se corrigió el servicio y se repitió correctamente.

Chrome real con React, Express y catálogo MySQL aislado, ejecución final `otakuzone_f7_test_c2c8a921d6b6`, terminó con código 0:

- Home simultáneo: cuatro populares, doce de temporada, seis géneros mostrados y cuatro productos MySQL.
- Segunda página real de catálogo recibida.
- Búsqueda/filtros combinados, detalle real en modal y favorito source=anilist con ID numérico persistido.
- Snapshot técnico Jikan conservado junto al nuevo favorito y abierto como legado sin convertir su ID.
- Respuesta vacía real para una búsqueda técnica sin coincidencias.
- Demo local explícito de doce obras, claramente identificado.
- Fallo de conexión provocado bloqueando el endpoint propio de anime en el navegador; error visible y recuperación mediante Reintentar en los recursos independientes de búsqueda y géneros.
- Anchos 320/375/768/1024/1440 px sin scroll horizontal en el escenario comprobado; sin excepciones ni console.error de aplicación.

[Captura del detalle real en React](docs/evidencias/anilist/detalle-real.png).

No se provocó una saturación real de AniList para generar 429. La pausa y los errores de cuota se probaron con mocks explícitos.

### Unitarias y HTTP con mocks identificados

`npm test`: **20/20 PASS**. Incluye las 18 pruebas anteriores y dos de compatibilidad de favoritos/URL. Se mantienen separados IDs AniList/Jikan y se verifica que los registros versión 1 no desaparezcan.

`npm --prefix backend test`: **26/26 PASS**. Incluye las 18 anteriores y ocho pruebas nuevas de AniList:

- DTO, títulos/score/ausentes y descripción sin HTML ejecutable.
- Variables sin concatenación ni nulls opcionales y temporada UTC.
- POST fijo, caché/expiración y deduplicación concurrente.
- Errores de conexión/timeout, JSON/GraphQL y validación, sin caché de fallos ni exposición de mensajes internos.
- HTTP/GraphQL 429, Retry-After y pausa global con reloj simulado.
- Presupuesto de 28, un transporte en vuelo y rechazo de cola excesiva.
- HTTP local Express con upstream mock: parámetros, métodos, GraphQL arbitrario rechazado y límite de página 100.
- Cabecera Retry-After pública y errores sin trazas.

Estas fixtures llevan nombres de prueba y **no se presentan como resultados reales de AniList**. No se instaló Vitest/Playwright ni se declara haberlos usado: se reutilizan Node Test Runner y Chrome/CDP.

### Regresión general

En la base aislada se ejecutaron y aprobaron las verificaciones existentes: integridad MySQL, **35 solicitudes de autenticación, 62 comerciales, 72 administrativas y 26 HTTP adicionales**; además, inserción/actualización/eliminación técnica SQL vistas por Express. Pasaron los recorridos Chrome de autenticación, búsqueda/demo/favoritos, comercio/planes y ADMIN. El recorrido de interactividad actualizado también obtuvo doce resultados reales AniList.

La ejecución integral inicial se detuvo después en el guion nuevo de navegador: no se declara que aquel comando completo terminara con éxito. La repetición exclusiva de AniList aprobó tras corregir las incidencias abajo. Las regresiones comerciales no se repitieron por cada ajuste de etiquetas o guion de anime.

`npm run lint`: PASS sin diagnósticos. `npm run build`: PASS, Vite 8.3.8, 2179 módulos. `git diff --check`: PASS (solo avisos de normalización LF/CRLF). Sin dependencias/lockfiles nuevos.

## Incidencias corregidas durante la migración

1. Filtros GraphQL opcionales null: listas vacías; se omiten variables no seleccionadas y se cubre con regresión.
2. Una sustitución inicial dejó la etiqueta Jikan y el prefijo de ranking en tarjetas; se corrigieron a AniList y Usuarios en listas. Revisión posterior dejó referencias Jikan en UI únicamente para favoritos anteriores.
3. El nuevo guion CDP intentaba serializar un nodo DOM al esperar Home; se cambió por un booleano. Aquella ejecución falló y tuvo también un timeout de cierre de Chrome; su base/cuenta se limpiaron.
4. El guion reintentaba solo el primer recurso tras bloquear toda la API de anime: géneros y búsqueda mantienen errores independientes. Se reintentan ambos en la prueba; no se alteró esa lógica de UI para ocultar errores.
5. Se acotó hasNext en la página 100 para evitar que el botón Siguiente llevara a una página fuera del límite.

Las ejecuciones fallidas se conservan como fallidas; los resultados finales reales y unitarios se distinguen de ellas.

## Aislamiento, alcance y limitaciones

Se reutilizó el preparador de FASE 7/8/9 con el modo `--anilist`: crea base/cuenta temporales con permisos solo en esa base, comprueba que desarrollo esté denegado, copia esquema/catálogo y elimina únicamente sus recursos exactos. No copia usuarios, sesiones ni pedidos reales. Las pruebas comerciales se hicieron exclusivamente allí.

La comprobación posterior encontró **cero bases temporales y cero cuentas temporales**. No se aplicaron migraciones ni SQL de aprovisionamiento real. Tampoco se cambió backend/.env; el riesgo MySQL anterior permanece para revisión del operador.

La disponibilidad remota, límites por IP y calidad/completitud de datos siguen dependiendo de AniList. No se certifica carga prolongada, despliegue con varios procesos, imágenes siempre disponibles, traducción de sinopsis o equivalencias automáticas de IDs/URLs antiguas. Los favoritos Jikan no se actualizan remotamente. JSON Server sigue siendo alternativa de catálogo comercial; anime usa Express, aunque la tienda apunte a JSON Server.

## Configuración y reproducción

Sin tokens ni cambios de MySQL:

```text
VITE_ANIME_API_URL=http://127.0.0.1:4000/api/v1
```

El valor anterior está en `.env.example`, no se escribió en un archivo real del usuario. Si falta, el cliente usa VITE_AUTH_API_URL o el valor local por defecto; no hereda la URL de JSON Server de la tienda. Reiniciar Vite después de cambiar variables.

Arranque habitual desde la raíz:

```sh
npm --prefix backend run dev
npm run dev
```

Pruebas:

```sh
npm test
npm --prefix backend test
npm run lint
npm run build
npm --prefix backend run anime:verify
```

`anime:verify` consulta directamente el endpoint público real con las consultas del backend; no necesita MySQL. Evitar ejecutar varias comprobaciones remotas simultáneamente.

Integración real de navegador con catálogo MySQL aislado (requiere credenciales de bootstrap disponibles, MySQL y Chrome/Edge):

```sh
npm --prefix backend run anime:verify:browser
```

`npm run check:apis` consulta ahora los endpoints propios de AniList y el catálogo HTTP configurado; requiere Express activo. El script fue actualizado y revisado por lint; no se ejecutó hasta el final en la ejecución integral interrumpida. Sus cinco consultas equivalentes sí se ejecutaron directamente y desde React como se documenta arriba.

## Archivos de esta migración

Nuevos: capas backend AniList (cliente, consultas, adaptador, servicio, validadores, controlador/router), `src/services/anilist.js`, pruebas backend/frontend, CLI `check-anilist.js`, guion `audit-anilist-browser.mjs`, este informe y captura.

Adaptados: montaje `app.js`; Home/Animes/Favoritos y componentes de anime; modelo de filtros/favoritos; animeCatalog; textos demo; `.env.example`; scripts npm; preparador QA y guiones de catálogo; check:apis y alias de auditoría de navegador; ambos README. El cliente Jikan se marca legado y su prueba histórica se identifica como tal. `http.js` solo cambia un comentario; su lógica compartida se conserva.

El repositorio ya contenía cambios sin commit de la FASE 9 y su propuesta de permisos al iniciar; se conservaron. Ningún servicio/repositorio ni página de autenticación, comercio, suscripciones o ADMIN cambió como parte de esta migración. Las siete migraciones permanecen intactas.

**Migración implementada y validada en los escenarios descritos. Sin commit y sin FASE 10.**
