# Ajustes de presentación de Tienda Otaku

Fecha: 14 de noviembre de 2026.

## Cambios y archivos

- `src/components/home/ProductCard.jsx`: se cambió únicamente «Precio demostrativo» por «Precio regular». El componente compartido aplica el texto al catálogo, las tarjetas de Inicio y el detalle. Se conservan clases, imágenes y formato monetario PEN (`S/`); no cambian importes ni su lógica.
- `src/routes/AppRouter.jsx`: se omite la línea «OtakuZone — Neo Tokyo · Proyecto académico» en Tienda y sus detalles. No se sustituye por contenido ni se cambian clases de distribución, rutas o protecciones. Se conserva la excepción previa de Suscripciones.
- `docs/AJUSTES_PRESENTACION_TIENDA.md`: este informe.

No se modificaron datos MySQL, precios, inventario, backend, carrito, pedidos, autenticación ni suscripciones. Los cambios anteriores del proyecto se conservaron. Sin dependencias, migraciones ni commits.

## Auditoría de textos relacionados

Los siguientes textos se identificaron y conservaron; su retirada o reformulación no se aplicó automáticamente.

| Ubicación | Texto | Clasificación y decisión |
| --- | --- | --- |
| `Tienda.jsx`, encabezado | «PRODUCTOS DEMOSTRATIVOS» | Presentación comercial; pendiente de acordar un texto alternativo. |
| `Tienda.jsx`, introducción | «Productos ficticios y precios demostrativos», «pedidos académicos», «inventario de demostración» | Mezcla presentación con información sobre el alcance del sistema. Se conserva completa para no retirar advertencias incidentalmente. |
| `Tienda.jsx`, introducción | «sin cobros ni envíos reales» | Advertencia esencial para decisiones de compra; conservada. |
| `Tienda.jsx`, contador y etiqueta accesible de sección | «productos demostrativos», «Productos de demostración» | Presentación comercial/accesible; identificada sin cambios adicionales. |
| `ProductCard.jsx`, imagen | «MUESTRA» | Etiqueta visible de presentación de productos ilustrativos; conservada, sin alterar tarjetas ni imágenes. |
| Descripciones recibidas por la API, visibles en catálogo y detalle | «Producto ficticio para la tienda académica…», imagen ilustrativa reutilizable, «no hay compras ni stock real» | Incluyen advertencias necesarias sobre compras, imágenes y stock. Conservadas; no se editaron datos ni se ocultaron en frontend. |
| `services/otakuzone.js`, adaptación y textos de respaldo | «Producto de demostración», «Producto ficticio de demostración» | Pueden aparecer en detalles o datos incompletos; identificados sin modificar servicios. |

La etiqueta exacta «Precio demostrativo» fue sustituida. Las demás expresiones demostrativas no se eliminaron globalmente: el alcance autorizado incluye una auditoría, no su sustitución indiscriminada.

## Validaciones reales

- `npm run lint`: aprobado sin advertencias.
- `npm test`: 20 pruebas frontend aprobadas. Ejecutadas fuera del sandbox para evitar el bloqueo de procesos de Node observado previamente.
- `npm run build`: aprobado.
- API local existente `GET /api/v1/products`: HTTP 200 y 12 productos. Solo consultas; sin mutaciones.
- Chrome headless: comprobados los 12 productos del catálogo, sus nombres y precios contra la API y el formato `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })`.
- Comprobadas las 12 rutas de detalle: mismo importe que la API, «Precio regular», ausencia de «Precio demostrativo» y ausencia de la línea académica bajo el contenido.
- Catálogo y una vista de detalle revisados a 320, 375, 768, 1024 y 1440 px: `scrollWidth === clientWidth`, sin desplazamiento horizontal.
- Capturas de catálogo en 320 y 1440 px revisadas visualmente: tarjetas conservadas y nueva etiqueta visible. Se obtuvo además una captura de detalle móvil.

La auditoría de navegador utilizó un script temporal, eliminado al terminar. No se probaron operaciones de carrito o pedidos porque no se modificaron.

## Capturas disponibles

Archivos locales temporales generados durante esta ejecución:

- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-XT4XB8/store-regular-320.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-XT4XB8/store-regular-1440.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-XT4XB8/store-detail-320.png`

No se inició ninguna fase adicional.
