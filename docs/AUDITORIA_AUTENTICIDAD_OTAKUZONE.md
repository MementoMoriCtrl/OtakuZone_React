# Auditoría de autenticidad y textos de interfaz — OtakuZone

Fecha: 14 de noviembre de 2026.

## Alcance y método

Se inspeccionaron los 79 archivos JavaScript/JSX de `src`, buscando textos visibles, accesibles y mensajes compartidos. Se revisaron las páginas, tarjetas, formularios, navegación, modales, estados de carga/error/vacío y servicios que generan mensajes para el usuario. Antes de editar se creó un inventario y se capturaron seis páginas públicas en móvil y escritorio.

La inspección incluyó:

- Inicio: Hero, secciones de anime, géneros, productos, planes, CTA y comprobación de desarrollo.
- Catálogo: Animes, AnimeSearchForm, AnimeCollection, AnimeCard, AnimeDetailsDialog y FavoriteButton; ramas de catálogo principal, ejemplo y favoritos anteriores.
- Favoritos, MiCuenta, Perfil, SessionAccount, registro, inicio de sesión, perfil, campos, validaciones y protección de acceso.
- Tienda, Producto, ProductCard, descripciones y adaptación de datos; Carrito, Pedidos e historial de estados.
- Suscripciones, confirmación, tarjetas, proveedor y presentación de beneficios.
- Administración: resumen, productos, categorías, inventario, pedidos y usuarios; componentes comunes de formularios y colecciones.
- Header, Navbar, Footer, página 404 y PagePlaceholder.
- ResourceState, ActionMessage, MediaImage, hooks y mensajes de errores de los servicios.

No se cambiaron rutas, endpoints, GraphQL, contratos, autenticación, roles, precios, operaciones comerciales, consultas SQL ni datos. En servicios frontend se cambiaron exclusivamente cadenas mostradas como errores o etiquetas de presentación. No hay modificaciones en `backend/`.

Al comenzar ya había cambios en `Hero.jsx` y `Home.jsx`: el saludo «BIENVENIDO A OTAKU ZONE» y la retirada de las promociones de Inicio. Se conservaron; no se atribuyen a esta auditoría.

## Decisiones A / B / C

### A. Eliminar

- Leyenda compartida «OtakuZone — Neo Tokyo · Proyecto académico» en las rutas donde seguía apareciendo.
- Etiqueta «FASE 02» de la página 404.
- Comprobación de desarrollo de Inicio y su importación. El componente técnico se conserva en el repositorio, sin renderizarlo en la navegación pública.
- Código de rol junto al nombre en el perfil público; los permisos y el enlace condicionado de administración siguen intactos.
- Promesa «Navegación sin espacios promocionales en Inicio» de la lista Premium. Ya no hay promociones en Inicio para ningún plan, por el ajuste previo; su retirada de los textos no modifica beneficios ni operaciones.

### B. Reescribir

- Referencias repetidas a AniList/Jikan y explicaciones sobre identificadores: «Catálogo principal», «Ficha de anime» y «Ficha guardada».
- «Demo local» se presenta como «Catálogo de ejemplo», manteniendo explícito que sus obras, puntuaciones y estados son ficticios.
- Tienda, contador, imágenes, carrito y pedidos usan lenguaje directo, conservando que no hay cobros ni envíos reales y que las existencias no representan stock para entrega.
- Los errores de formato o conexión dejan de pedir al usuario que compruebe una API o lea mensajes JSON/HTTP. Conservan su condición, estado HTTP cuando ayuda a identificar el fallo y botón de reintento.
- Favoritos explica el almacenamiento en este navegador y la ausencia de sincronización, sin detalles de conversión de IDs.
- Las menciones a MySQL se retiran del resumen administrativo; se conserva la definición de bajo inventario.
- Hero deja de afirmar que los productos son exclusivos, ya que no hay datos que lo acrediten.
- Suscripciones conserva precios, plan activo, historial y confirmación. Solo anuncia la insignia existente y aclara que no se procesan pagos reales.

### C. Conservar: transparencia y operación

| Texto o información | Motivo |
| --- | --- |
| Ausencia de cobros y envíos reales | Evita que una selección de productos o un pedido se interprete como una compra con entrega. Se conserva en Inicio, Tienda, Carrito y Pedidos; se muestra también en el detalle de producto para accesos directos. |
| Imágenes ilustrativas y existencias sin stock para entrega | Mantiene claro el alcance real del catálogo. «MUESTRA» se reescribe como «IMAGEN ILUSTRATIVA». |
| Precios PEN, disponibilidad, totales e historial de estados | Son necesarios para comprender y completar las operaciones existentes. Valores y formato monetario intactos. |
| Aviso de catálogo ficticio y etiquetas de ejemplo | No se presenta la fuente de ejemplo como un catálogo real. Los datos originales y sus identificadores no se modifican. |
| «OtakuZone no ofrece reproducción de episodios» y sinopsis en inglés | Aclaran funciones y contenido realmente disponibles. |
| Favoritos en este navegador, sin sincronización | Evita prometer persistencia en la cuenta o en otros dispositivos. |
| Contraseña: mínimo, letra/número, límite de 72 bytes | El límite existe y algunos caracteres ocupan varios bytes. Se conserva el requisito exacto y sus validaciones. |
| Correo no editable, sesión expirada, acceso restringido | Información necesaria de seguridad y uso; no se alteraron controles ni permisos. |
| Instrucciones administrativas sobre IDs, roles, stock reservado y transiciones de pedidos | Son instrucciones operativas dirigidas a administradores, no explicaciones de desarrollo destinadas al visitante. Se conservan. |
| Carga, vacío, éxito, errores, reintento, producto no disponible y validaciones | Se mantienen los componentes, roles accesibles, condiciones y acciones. No se sustituyen errores por éxitos. |
| Nombre «Polo Órbita · Edición demo», descripciones/alt originales recibidos y registros administrativos | Son datos comerciales o registros existentes. No se renombraron productos ni se editaron datos del servidor. |
| Footer, navegación, contacto y enlaces sociales | Ya tienen textos adecuados; se inspeccionaron sin cambios. No se inventaron perfiles ni datos de contacto. |
| Comentarios, logs, variables, identificadores, código de proveedores y documentación técnica | No son textos de presentación y se conservan. El antiguo componente de comprobación permanece sin uso público. |

Las descripciones de obras del catálogo de ejemplo se presentan ahora sin «para probar la interfaz», conservando que son ficticias. Se aplica solo a su renderizado en tarjeta y modal: no se modifican datos locales ni snapshots de favoritos.

## Validaciones ejecutadas y resultados

| Comprobación | Resultado real |
| --- | --- |
| `npm run lint` | Aprobado sin advertencias en la ejecución final. |
| `npm test` | 20 pruebas frontend aprobadas después de los últimos cambios. |
| `npm test --prefix backend` | 30 pruebas backend aprobadas: transporte y servicio AniList, validaciones, HTTP, CORS, firma JWT, sesión, CSRF, configuración y repositorios/transacciones con dobles de prueba. |
| `npm run build` | Build de producción aprobado tras los últimos ajustes de producto. |
| Consultas reales locales de anime | Géneros: HTTP 200, 18 resultados. Búsqueda Naruto: HTTP 200, 12 resultados; también renderizados en el navegador. |
| Rutas públicas | Inicio, Animes, Favoritos, Mi Cuenta, Tienda, Suscripciones, detalle de producto y 404: 40 comprobaciones en 320, 375, 768, 1024 y 1440 px. |
| Rutas privadas con respuestas aisladas | Perfil, Carrito, Mis pedidos, detalle de pedido, Suscripciones y resumen administrativo: 30 comprobaciones en los cinco anchos. |
| Secciones administrativas válidas | `/admin/productos`, `/admin/categorias`, `/admin/inventario`, `/admin/pedidos`, `/admin/usuarios`: 25 comprobaciones adicionales con respuestas aisladas. Formularios y estados vacíos renderizados. |
| Revisión final de anime real y detalle de producto | 10 comprobaciones adicionales en los cinco anchos; aviso de compra visible al entrar directamente al producto. |
| Desbordamiento | En las comprobaciones de ancho, `scrollWidth === clientWidth`. No se añadió `overflow-x: hidden` ni se cambiaron clases o fuentes. |
| Búsqueda y favoritos | Búsqueda automática en el catálogo de ejemplo, selección y consulta de ficha, guardado y lectura de un favorito comprobados en un perfil temporal de navegador. |
| Formularios y errores | Registro vacío conserva validaciones; bloqueo de la consulta de productos muestra error y Reintentar, que recupera las 12 tarjetas. |
| Protección de rutas | Sin sesión, Perfil, Carrito, Pedidos y Administración siguen llevando a Mi Cuenta. |
| Suscripciones aisladas | Free → Premium → Free, error al cambiar, reintento e insignia comprobados; advertencia sobre pagos presente en la confirmación. No se cambió una suscripción real. |
| Datos comerciales | Respuesta completa de productos comparada antes/después de la auditoría pública: idéntica. No se enviaron escrituras comerciales. |
| Menú y footer | Menú móvil sin referencia académica; footer renderizado y revisado visualmente. |

Se verificaron 95 combinaciones válidas de ruta/viewport en la revisión principal y 10 adicionales en la revisión final. Se corrigió el recorrido de auditoría administrativa para usar las rutas españolas de la aplicación; las rutas de la aplicación no se cambiaron.

Las capturas de Inicio, Animes, Tienda, Favoritos, Cuenta y Suscripciones se revisaron en los cinco anchos. Las vistas privadas se midieron en los cinco anchos y se revisaron mediante capturas móviles y de escritorio. La revisión final de Animes incluye resultados reales, no solo estados de carga. No se observaron recortes o desbordamientos nuevos en los textos modificados. No se realizó una auditoría automatizada completa de contraste o lector de pantalla.

En `tests/services.test.mjs` se actualizó únicamente la expectativa del mensaje al recibir JSON inválido. La prueba sigue comprobando el rechazo del mismo fallo; no se debilitó ni se eliminó la validación.

## Límites e incidencias pendientes

- Las páginas privadas se verificaron con respuestas controladas en memoria. Esto valida su presentación y comportamiento frontend, no una sesión real ni operaciones completas de pedido, inventario o suscripción contra MySQL.
- Las pruebas backend usan sus repositorios/transporte de prueba; no acreditan una compra o migración real. No se ejecutaron migraciones ni procedimientos que escriban datos de usuarios.
- No se ocultaron mensajes reales entregados por el backend. Si una respuesta del servidor conserva vocabulario técnico, puede seguir apareciendo como error. Reescribir esos mensajes de origen requeriría una tarea backend fuera de este alcance.
- Los datos comerciales conservan sus nombres y textos originales. Por ello, «Edición demo» o textos alternativos recibidos pueden continuar apareciendo. No se limpiaron silenciosamente datos almacenados.
- El módulo administrativo mantiene sus instrucciones técnicas necesarias para operar con seguridad. No se rediseñó el panel.
- El proveedor externo puede responder con errores o límites de solicitudes; permanecen los avisos y reintentos existentes. No se promete disponibilidad permanente.
- No se realizó ningún commit ni se inició otra fase.

## Capturas antes y después

Las capturas seleccionadas se guardan en `docs/evidencias-autenticidad/`. Las imágenes privadas contienen exclusivamente una cuenta y datos de auditoría aislados.

| Página | Ancho | Antes | Después |
| --- | --- | --- | --- |
| inicio | 320 px | [Antes](evidencias-autenticidad/before-inicio-320.png) | [Después](evidencias-autenticidad/after-inicio-320.png) |
| inicio | 1440 px | [Antes](evidencias-autenticidad/before-inicio-1440.png) | [Después](evidencias-autenticidad/after-inicio-1440.png) |
| animes | 320 px | [Antes](evidencias-autenticidad/before-animes-320.png) | [Después](evidencias-autenticidad/after-animes-320.png) |
| animes | 1440 px | [Antes](evidencias-autenticidad/before-animes-1440.png) | [Después](evidencias-autenticidad/after-animes-1440.png) |
| tienda | 320 px | [Antes](evidencias-autenticidad/before-tienda-320.png) | [Después](evidencias-autenticidad/after-tienda-320.png) |
| tienda | 1440 px | [Antes](evidencias-autenticidad/before-tienda-1440.png) | [Después](evidencias-autenticidad/after-tienda-1440.png) |

- [private-carrito-320.png](evidencias-autenticidad/private-carrito-320.png)
- [private-pedidos-320.png](evidencias-autenticidad/private-pedidos-320.png)
- [private-perfil-320.png](evidencias-autenticidad/private-perfil-320.png)
- [private-admin-1440.png](evidencias-autenticidad/private-admin-1440.png)
- [final-producto-320.png](evidencias-autenticidad/final-producto-320.png)
- [final-footer.png](evidencias-autenticidad/final-footer.png)

## Archivos modificados

- `src/components/account/SessionAccount.jsx`
- `src/components/common/PagePlaceholder.jsx`
- `src/components/home/AnimeCard.jsx`
- `src/components/home/AnimeDetailsDialog.jsx`
- `src/components/home/AnimeSearchForm.jsx`
- `src/components/home/Hero.jsx`
- `src/components/home/ProductCard.jsx`
- `src/components/layout/Header.jsx`
- `src/data/homeData.js`
- `src/pages/Admin.jsx`
- `src/pages/Animes.jsx`
- `src/pages/Carrito.jsx`
- `src/pages/Favoritos.jsx`
- `src/pages/Home.jsx`
- `src/pages/Pedidos.jsx`
- `src/pages/Producto.jsx`
- `src/pages/Suscripciones.jsx`
- `src/pages/Tienda.jsx`
- `src/routes/AppRouter.jsx`
- `src/services/anilist.js`
- `src/services/animeCatalog.js`
- `src/services/http.js`
- `src/services/otakuzone.js`
- `src/services/storeContract.js`
- `tests/services.test.mjs`
- Este informe y 18 capturas seleccionadas.

## Inventario de sustituciones: versión anterior y nueva

A = eliminar; B = reescribir; C = conservar o reforzar una advertencia necesaria. Se incluyen fragmentos de JSX cuando identifican un elemento eliminado. Los imports retirados corresponden al elemento de desarrollo eliminado, no a funciones de negocio.

| Archivo | Criterio | Antes | Después |
| --- | --- | --- | --- |
| src/pages/Home.jsx | A | import DevelopmentCheck from '../components/common/DevelopmentCheck.jsx' | Eliminado de la interfaz. |
| src/pages/Home.jsx | A | {import.meta.env.DEV && &lt;DevelopmentCheck /&gt;} | Eliminado de la interfaz. |
| src/pages/Home.jsx | B | Información real de AniList, ordenada por popularidad. Las sinopsis pueden estar en inglés. | Descubre los títulos más populares. Las sinopsis pueden estar en inglés. |
| src/pages/Home.jsx | B | Animes de la temporada actual según AniList. Esta selección de temporada no representa un orden por fecha de estreno. | Explora los animes de la temporada actual. |
| src/pages/Home.jsx | B | Géneros reales de AniList. Elige uno para filtrar el catálogo. | Elige tu género favorito y descubre nuevas historias. |
| src/pages/Home.jsx | B | Productos, imágenes y precios demostrativos en soles. Explora el carrito y crea pedidos académicos sin cobros ni envíos reales. | Explora nuestra selección otaku y organiza tu carrito. Las imágenes son ilustrativas; no se realizan cobros ni envíos reales. |
| src/pages/Home.jsx | B | Explora con Free o elige Premium para disfrutar de tu insignia y navegar sin espacios promocionales en Inicio. | Explora con Free o elige Premium para mostrar tu insignia en OtakuZone. |
| src/components/home/Hero.jsx | B | productos exclusivos del universo otaku | productos del universo otaku |
| src/routes/AppRouter.jsx | A | {pathname !== '/' && pathname !== '/suscripciones' && !pathname.startsWith('/tienda') && &lt;p className="mt-6 text-xs leading-relaxed text-neo-white/55"&gt;OtakuZone — Neo Tokyo · Proyecto académico&lt;/p&gt;} | Eliminado de la interfaz. |
| src/components/layout/Header.jsx | B | Busca animes y explora tu carrito académico. | Busca animes y explora tu carrito. |
| src/components/common/PagePlaceholder.jsx | A | &lt;span className="rounded-full border border-neo-violet/40 px-3 py-1 text-xs text-neo-white/70"&gt;FASE 02&lt;/span&gt; | Eliminado de la interfaz. |
| src/pages/Favoritos.jsx | B | TU SELECCIÓN LOCAL | TU SELECCIÓN PERSONAL |
| src/pages/Favoritos.jsx | B | Estos favoritos pertenecen a este navegador y todavía no se sincronizan con tu cuenta. Cada tarjeta identifica AniList, demo o un favorito anterior de Jikan. Los anteriores se conservan como fichas guardadas y no se convierten a IDs de AniList. | Tus favoritos se guardan en este navegador y no se sincronizan con tu cuenta. Algunas fichas guardadas anteriormente pueden contener información desactualizada. |
| src/components/account/SessionAccount.jsx | A | · {auth.user.role}&lt;/p&gt; | &lt;/p&gt; |
| src/components/account/SessionAccount.jsx | B | Ver favoritos locales | Ver mis favoritos |
| src/pages/Animes.jsx | B | source === 'demo' ? 'DEMOSTRACIÓN LOCAL' : 'ANILIST' | source === 'demo' ? 'EJEMPLOS' : 'ANIME' |
| src/pages/Animes.jsx | B | DEMO LOCAL: obras, puntuaciones, popularidad y estados ficticios. Se reutilizan ilustraciones locales. No son resultados de AniList ni una prueba de que la API esté disponible. | Catálogo de ejemplo: los títulos, puntuaciones y estados son ficticios y las ilustraciones pueden repetirse. Para consultar animes reales, elige el catálogo principal. |
| src/pages/Animes.jsx | B | Probar con datos demostrativos locales | Explorar el catálogo de ejemplo |
| src/components/home/AnimeSearchForm.jsx | B | &gt;Fuente&lt;select | &gt;Catálogo&lt;select |
| src/components/home/AnimeSearchForm.jsx | B | AniList · Información real | Catálogo principal |
| src/components/home/AnimeSearchForm.jsx | B | Demo local · Datos ficticios | Ejemplos · Títulos ficticios |
| src/components/home/AnimeCard.jsx | B | DEMO LOCAL · OBRA FICTICIA | EJEMPLO · OBRA FICTICIA |
| src/components/home/AnimeCard.jsx | B | JIKAN · FAVORITO ANTERIOR | FICHA GUARDADA |
| src/components/home/AnimeCard.jsx | B | ANILIST · INFORMACIÓN REAL | ANIME |
| src/components/home/AnimeDetailsDialog.jsx | B | FICHA DEMOSTRATIVA · OBRA FICTICIA | EJEMPLO · OBRA FICTICIA |
| src/components/home/AnimeDetailsDialog.jsx | B | FAVORITO ANTERIOR · JIKAN | FICHA GUARDADA |
| src/components/home/AnimeDetailsDialog.jsx | B | FICHA DE ANIME · ANILIST | FICHA DE ANIME |
| src/components/home/AnimeDetailsDialog.jsx | B | Datos locales ficticios para probar la interfaz. Esta ficha no procede de AniList ni valida su disponibilidad. | Esta obra es ficticia y forma parte del catálogo de ejemplo. Su información e ilustraciones son orientativas. |
| src/components/home/AnimeDetailsDialog.jsx | B | Ficha guardada anteriormente desde Jikan. Se conserva sin convertir su ID a AniList y sin consultar el proveedor anterior; sus datos pueden estar desactualizados. | Esta ficha se guardó anteriormente y su información puede estar desactualizada. |
| src/components/home/AnimeDetailsDialog.jsx | B | Información real proporcionada por AniList. La sinopsis puede estar en inglés. | La sinopsis puede estar en inglés. |
| src/pages/Tienda.jsx | B | PRODUCTOS DEMOSTRATIVOS | DESCUBRE TU ESTILO OTAKU |
| src/pages/Tienda.jsx | B | Productos ficticios y precios demostrativos en soles. Carrito y pedidos académicos asociados a tu cuenta, sin cobros ni envíos reales. El stock mostrado corresponde al inventario de demostración. | Explora figuras, mangas, polos y accesorios con precios en soles. Las imágenes son ilustrativas. No se realizan cobros ni envíos reales; las existencias mostradas no representan stock para entrega. |
| src/pages/Tienda.jsx | B | Productos de demostración | Catálogo de productos |
| src/pages/Tienda.jsx | B | {items.length} productos demostrativos | {items.length} productos |
| src/components/home/ProductCard.jsx | B | &gt;MUESTRA&lt;/span&gt; | &gt;IMAGEN ILUSTRATIVA&lt;/span&gt; |
| src/components/home/ProductCard.jsx | B | Disponibilidad comercial no informada por este proveedor. | Disponibilidad no informada. |
| src/pages/Carrito.jsx | B | Pedido académico sin cobro. El carrito no reserva stock; precios y existencias se comprueban al confirmar. Envío simulado gratuito. | No se realizan cobros ni envíos reales. El carrito no reserva existencias; los precios y la disponibilidad se comprueban al confirmar. El importe de envío mostrado no corresponde a una entrega real. |
| src/pages/Carrito.jsx | B | Confirmar pedido demostrativo | Confirmar pedido |
| src/pages/Pedidos.jsx | B | Historial académico de pedidos simulados, sin cobros ni envíos reales. Se muestran hasta 100 pedidos recientes. | Consulta tus últimos 100 pedidos registrados. Estos pedidos no generan cobros ni envíos reales. |
| src/pages/Admin.jsx | B | Gestión privada de OtakuZone · Acceso ADMIN | Gestión privada de OtakuZone · Solo administradores |
| src/pages/Admin.jsx | B | Indicadores consultados en MySQL. Bajo inventario considera productos activos con cinco unidades disponibles o menos. | Bajo inventario: productos activos con cinco unidades disponibles o menos. |
| src/pages/Suscripciones.jsx | B | Al confirmar, el sistema finalizará tu plan actual y activará el seleccionado. El cambio quedará registrado en tu historial cuando el servidor lo confirme. | Al confirmar, se finalizará tu plan actual y se activará el seleccionado. Verás la confirmación del cambio y su registro en tu historial. |
| src/pages/Suscripciones.jsx | B | El servidor no confirmó el plan seleccionado. Vuelve a consultar tu suscripción. | No se pudo confirmar el plan seleccionado. Vuelve a consultar tu suscripción. |
| src/pages/Suscripciones.jsx | B | Explora nuevas historias con Free o elige Premium para disfrutar de tu insignia y una navegación sin espacios promocionales en Inicio. | Explora nuevas historias con Free o elige Premium para mostrar tu insignia en OtakuZone. |
| src/pages/Suscripciones.jsx | B | Tu insignia aparece en el encabezado y los espacios promocionales de Inicio permanecen ocultos mientras tu plan Premium esté activo. | Tu insignia aparece en el encabezado mientras tu plan Premium está activo. |
| src/data/homeData.js | A | 'Navegación sin espacios promocionales en Inicio.', | Eliminado de la interfaz. |
| src/services/otakuzone.js | B | Producto de demostración | Selección otaku |
| src/services/otakuzone.js | B | Producto ficticio de demostración. | Descripción no disponible. |
| src/services/otakuzone.js | B | La API de tienda devolvió un producto inválido. | No se pudo cargar la información del producto. Inténtalo de nuevo. |
| src/services/otakuzone.js | B | La API de tienda devolvió una categoría inválida. | No se pudieron cargar las categorías. Inténtalo de nuevo. |
| src/services/otakuzone.js | B | La API de tienda devolvió una promoción inválida. | No se pudieron cargar las promociones. Inténtalo de nuevo. |
| src/services/anilist.js | B | El catálogo AniList devolvió una respuesta inesperada. | No se pudo cargar el catálogo. Inténtalo de nuevo. |
| src/services/animeCatalog.js | B | Esta ficha demostrativa ya no está disponible. | Esta ficha de ejemplo ya no está disponible. |
| src/services/storeContract.js | B | La API de OtakuZone devolvió una respuesta inesperada. | No se pudo cargar la información de la tienda. Inténtalo de nuevo. |
| src/services/http.js | B | No se pudo conectar con el servicio. Comprueba tu conexión y que la API esté disponible. | No se pudo conectar con OtakuZone. Comprueba tu conexión e inténtalo de nuevo. |
| src/services/http.js | B | El servicio respondió con un error HTTP ${response.status}. Inténtalo de nuevo. | No se pudo completar la consulta (error ${response.status}). Inténtalo de nuevo. |
| src/services/http.js | B | El servicio devolvió una respuesta JSON inválida. | No se pudo leer la información recibida. Inténtalo de nuevo. |
| src/components/home/AnimeCard.jsx | B | Descripción de obra de ejemplo recibida: «es una obra ficticia del universo OtakuZone… datos locales de demostración; no proceden de AniList». | [Título] es una obra ficticia del catálogo de ejemplo. Sus puntuaciones y estados son orientativos; las ilustraciones pueden repetirse. |
| src/components/home/AnimeDetailsDialog.jsx | B | La misma descripción técnica de la obra de ejemplo. | La misma descripción de ejemplo revisada que en la tarjeta; las sinopsis del catálogo principal y snapshots anteriores no se reescriben. |
| src/pages/Suscripciones.jsx | C | No había aviso de pagos en la introducción y la confirmación. | No se procesan pagos reales en esta plataforma / No se procesan pagos reales. |
| src/pages/Producto.jsx | C | El aviso de compra solo figuraba en otras vistas. | Las imágenes son ilustrativas. No se realizan cobros ni envíos reales; las existencias mostradas no representan stock para entrega. |
| tests/services.test.mjs | B | Expectativa /JSON inválida/ para un rechazo real. | Expectativa /No se pudo leer la información recibida/ para el mismo rechazo. |
