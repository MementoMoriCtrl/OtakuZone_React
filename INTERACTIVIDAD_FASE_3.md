# OtakuZone — Fase 3: interactividad y gestión del estado

Fecha: 13/11/2026. Se inspeccionaron el catálogo/formulario, las tarjetas y fichas, los servicios HTTP/Jikan, las páginas provisionales, el layout, los manifiestos y las pruebas antes de modificar archivos. Se conservan las cinco rutas, la 404, las APIs anteriores, las dependencias, las imágenes locales, Tailwind 4 y Neo Tokyo.

## Interacciones implementadas

| Interacción | Comportamiento |
| --- | --- |
| Búsqueda por nombre | Se actualiza 450 ms después de dejar de escribir; Buscar/Enter aplica inmediatamente. Conserva foco y texto al llegar géneros de forma asíncrona. |
| Género | Filtro inmediato, combinado con título y estado. |
| Estado | En emisión, finalizado o próximamente. Se eligió estado, no temporada, para compartir el mismo filtro entre Jikan y demo. |
| Orden | Popularidad ascendente por posición; puntuación descendente, con valores desconocidos al final en demo. |
| Fuente de catálogo | Jikan por defecto; Demo local solo al seleccionarlo o abrir `?source=demo`. No hay fallback silencioso. |
| Favoritos | Agregar/quitar en tarjeta, diálogo y página; estado compartido, `aria-pressed`, anuncios accesibles y persistencia local. |
| Modal | Detalle real mediante Jikan o ficha demo local según procedencia; cierre por botón, Escape y fondo, con foco nativo. |
| Registro demo | Obligatorios, correo, contraseña y confirmación; mensajes asociados a campos y foco en el primer campo incorrecto al enviar. |
| Perfil local | Valida nombre/correo/presentación, guarda datos básicos y los recupera tras recargar. |
| Accesos | El icono de búsqueda abre el catálogo y el CTA de Home lleva a Mi Cuenta para probar el registro. |

La URL conserva `q`, `genre`, `status`, `order`, `source` y `page`. Cambiar búsqueda/filtros reinicia la página. Las búsquedas escritas utilizan replace para no crear una entrada de historial por cada término; el envío y filtros mantienen la navegación por URL. Se conserva la paginación real de la fase anterior.

## Jikan y modo demostrativo

No se eliminó ni reemplazó Jikan. `src/services/jikan.js` sigue consultando la API pública mediante el cliente compartido, con cancelación, caché, deduplicación y límites de frecuencia de Fase 2. Se añadieron los parámetros oficiales de estado y orden. La búsqueda se construye en `src/domain/catalog.js`, fuera de los componentes.

Se intentó esta búsqueda real desde Chrome:

```text
https://api.jikan.moe/v4/anime?page=1&limit=12&sfw=true&order_by=score&sort=desc&q=Naruto&genres=1&status=complete
```

**Jikan no entregó resultados y el catálogo mostró error. No se declara validada la búsqueda externa ni los filtros contra respuestas reales.** Las dos solicitudes registradas corresponden al intento y su único reintento automático. No se interceptaron respuestas exitosas de Jikan para simular disponibilidad.

El modo local está en `src/data/demoAnime.js`: doce obras ficticias y seis géneros, usando los assets existentes. Cada registro tiene `source: 'demo'`, identificador propio, géneros, estado, puntuación y posición de popularidad demostrativos. Sus valores no representan estadísticas reales. Los títulos pueden reutilizar ilustraciones, y la interfaz lo avisa.

`src/services/animeCatalog.js` selecciona la fuente explícita para búsqueda, géneros y detalle. En modo demo se filtran los datos locales y no se consulta Jikan. En modo Jikan se preservan errores/carga/vacío/reintento y no se sustituyen resultados por muestras. El catálogo muestra un aviso, cada tarjeta su procedencia y el diálogo una explicación de la fuente. Los favoritos también conservan esa distinción.

Se utilizaron los parámetros documentados en la [especificación oficial de Jikan](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json): estado y orden se envían al servidor; no se reordenan solamente los primeros resultados de una página real.

## Estado y persistencia

- `AnimeSearchForm`: referencias al input y al temporizador, con limpieza al desmontar/cambiar URL; no duplica en useState los filtros aplicados de la URL. El texto pendiente solo existe en el input hasta que se aplica.
- `useResource`: se conserva para carga/error/reintento y descarte de resultados cancelados.
- `FavoritesProvider`: Context y `useSyncExternalStore` sobre `favoritesStore`; el almacén usa un reducer puro para modificar la colección y persiste desde la acción, sin efectos que guarden y provoquen renders en cascada.
- `favoriteKey` combina origen e identificador. Un registro demo nunca se confunde con un mal_id. Se deduplican registros al cargar y se limita provisionalmente la colección a 200 entradas.
- `localRepository`: claves `otakuzone.favorites.v1` y `otakuzone.profile.v1`, con sobres `{ version: 1, ... }`, validación de contenido y mensajes ante JSON corrupto, versión desconocida, bloqueo o cuota excedida. Un fallo al guardar favoritos mantiene la colección en memoria y avisa que no está persistida.
- Se escucha el evento `storage` para recargar favoritos de otra pestaña. La recarga del almacén se prueba con almacenamiento en memoria; no se afirma una prueba de dos pestañas reales.
- `useValidatedForm`: valores, campos visitados e intento de envío. Los errores se derivan de validadores puros, sin un segundo estado de errores. Mi Cuenta mantiene un único formulario de perfil; el registro puede preparar nombre/correo sin perder el borrador de presentación.

La UI depende del contrato `getSnapshot/subscribe/toggle` del almacén y de métodos del repositorio; una fase futura puede cambiar la persistencia por un adaptador remoto. Todavía no hay sincronización de usuarios, autenticación ni escritura en un backend. Los snapshots de favoritos reales son copias locales y no garantizan que una puntuación siga actualizada; abrir su ficha intenta consultar Jikan.

## Reglas de formularios

- Nombre obligatorio: 2–60 caracteres después de quitar espacios extremos.
- Correo obligatorio: formato con usuario, arroba y dominio; máximo 254 caracteres. No se comprueba la propiedad del buzón.
- Contraseña de prueba: 8–128 caracteres, al menos una letra y un número.
- Confirmación obligatoria e idéntica.
- Presentación opcional: máximo 300 caracteres.
- Errores comprensibles con `aria-invalid`, `aria-describedby`, etiquetas asociadas y foco en el primer campo erróneo al enviar. Mensajes de éxito mediante `role="status"`.

El registro solo valida y prepara nombre/correo en el formulario de perfil. No crea una cuenta ni inicia sesión. Las contraseñas se limpian al validar correctamente; nunca se transmiten ni se guardan en localStorage. El repositorio de perfil utiliza una lista permitida de nombre, correo y presentación, incluso si un llamador proporciona propiedades adicionales.

## Ejecutar y comprobar

Para usar Home/tienda con la API simulada, terminal 1:

```sh
npm run api
```

JSON Server: `http://127.0.0.1:3001`, recursos `products`, `categories`, `promotions`. Se comprobó HTTP 200 de productos en esta fase; no se modificó su base de datos.

Terminal 2:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Vite respondió HTTP 200 en `http://127.0.0.1:5173`. Los procesos de Fase 2 seguían activos; no se reinstalaron dependencias. Jikan es remoto y no se levanta localmente.

Para probar las interacciones sin depender de Jikan:

1. Abrir `http://127.0.0.1:5173/animes?source=demo`.
2. Escribir Distrito, esperar o pulsar Buscar; combinar género y estado, cambiar orden y probar un texto sin coincidencias.
3. Guardar una tarjeta, abrir su ficha, alternar favorito y visitar Favoritos. Recargar para comprobar persistencia; quitarlo para ver el vacío.
4. En `/cuenta`, enviar vacío y con correo/contraseña incorrectos. Probar un registro válido, guardar el perfil y recargar.

Comandos de validación:

```sh
npm test
npm run lint
npm run build
node scripts/audit-interactivity.mjs
```

La auditoría Chrome necesita un Chrome/Edge local y Node 24; permite `CHROME_PATH` y `AUDIT_URL`. Usa un perfil temporal independiente. Comprueba la aplicación real en modo demo, no respuestas HTTP ficticias de Jikan. La única inyección de fallos de esta suite bloquea storage deliberadamente para comprobar manejo de errores. El script termina correctamente si pasan las interacciones; informa la validación externa por separado. Para exigir que ambas APIs estén disponibles siguen existiendo `npm run check:apis` y `node scripts/audit-apis-browser.mjs`, que fallan si Jikan no responde.

## Resultados ejecutados

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias | 16 pasan, 0 fallan: 7 de interactividad/persistencia y 9 existentes de servicios |
| Lint | Sin advertencias |
| Build | Correcto con las versiones existentes |
| Chrome: demo | Doce tarjetas; búsqueda por nombre sin tildes, debounce, envío inmediato, filtros combinados, orden y vacío correctos |
| Chrome: favoritos | Tarjeta/modal/página consistentes, sin duplicados, quitar/agregar y recuperación tras recargar |
| Chrome: modal | Ficha demo correcta, cierre Escape y devolución del foco al activador |
| Chrome: formularios | Obligatorios/correo/contraseña/confirmación; perfil guardado y recuperado; contraseñas ausentes del almacenamiento |
| Chrome: storage | JSON corrupto, recuperación al guardar y bloqueo de lectura/escritura con favoritos en memoria |
| Chrome: responsive | Catálogo demo, Favoritos y Cuenta sin scroll horizontal en 320, 390, 768 y 1440 px |
| Jikan real | Consulta enviada con título/género/estado/orden correctos; sin resultados recibidos y error visible; validación externa pendiente |
| Errores JS | Sin excepciones de ejecución ni console.error de la aplicación en la suite completada; los fallos de red de Jikan se distinguen |

Se inspeccionaron visualmente las capturas del catálogo demo en escritorio y Cuenta en móvil, manteniendo la paleta y tipografías. Las capturas son del viewport, no una auditoría visual exhaustiva de todos los estados. Dos ejecuciones iniciales del script necesitaron corregir una variable y un selector del propio harness; no se presentan esas ejecuciones como pruebas completas del producto.

No se instalaron dependencias ni se cambiaron package.json/package-lock.json. No se implementó backend, Express, MySQL, autenticación real ni Fase 4. Queda pendiente repetir la validación externa cuando Jikan sea accesible; el modo demostrativo permite continuar comprobando las interacciones de forma explícita.
