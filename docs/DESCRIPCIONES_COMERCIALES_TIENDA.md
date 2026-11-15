# Descripciones comerciales de Tienda Otaku

Fecha: 14 de noviembre de 2026.

## Inspección y alcance

`GET /api/v1/products` y `GET /api/v1/products/:id` entregan las descripciones; `services/otakuzone.js` adapta esos datos y `ProductCard` las presenta cuando recibe `inStore`. El catálogo y el detalle reutilizan ese componente. La API local devuelve 12 referencias: tres figuras, tres mangas, tres polos y tres accesorios.

La modificación es exclusivamente de presentación. No se modificaron API, contratos, datos MySQL, semillas, migraciones ni servicios. Las descripciones originales siguen en el servidor; los 12 identificadores conocidos reciben el nuevo texto al renderizar la tarjeta de Tienda o el detalle. Las referencias nuevas o desconocidas conservan su descripción original.

## Archivos de esta tarea

- `src/data/productDescriptions.js`: 12 textos propios asociados al identificador, más una función de consulta sin mutación de productos.
- `src/components/home/ProductCard.jsx`: usa esa función únicamente en la descripción de Tienda y detalle. No modifica estilos, imágenes, precios, disponibilidad, enlaces ni acciones. Las tarjetas de Inicio no muestran esta descripción y quedan intactas.
- `docs/DESCRIPCIONES_COMERCIALES_TIENDA.md`: este informe.

Se preservaron nombres, identificadores, categorías, imágenes, precios, inventario, etiquetas y avisos generales. El nombre «Polo Órbita · Edición demo» se conserva por la restricción de no renombrar referencias. No se afirman materiales, licencias, medidas, ediciones limitadas ni garantías. La comodidad de los polos se plantea como intención al vestir, sin prometer propiedades técnicas de la prenda.

## Validaciones ejecutadas

- `npm run lint`: aprobado sin advertencias.
- `npm test`: 20 pruebas frontend aprobadas, fuera del sandbox para evitar el bloqueo de procesos de Node observado en esta sesión.
- `npm run build`: aprobado.
- Navegador Chrome con la API local existente, sin mutaciones: comprobadas las 12 tarjetas y las 12 rutas de detalle, con textos coincidentes y 12 descripciones distintas. El párrafo repetido ya no aparece en el catálogo.
- Nombres y precios renderizados contrastados con la API en catálogo y los 12 detalles; disponibilidad contrastada en las 12 tarjetas.
- Verificados búsqueda por nombre, filtro de mangas (tres resultados), orden descendente de precios y enlace a detalle.
- Aviso general «sin cobros ni envíos reales» conservado y comprobado.
- Catálogo y detalle sin desbordamiento horizontal a 320, 375, 768, 1024 y 1440 px: `scrollWidth === clientWidth`.
- Capturas de catálogo en los cinco anchos y detalle móvil revisadas visualmente, sin recortes de descripción ni solapamientos.
- Respuesta completa de productos comparada antes y después: sin cambios.
- Referencia desconocida: conserva su descripción original.

Los scripts de comprobación fueron temporales y se eliminaron. No se enviaron operaciones de carrito, pedidos o suscripciones ni se acreditó un flujo de compra completo: esas funcionalidades no se modificaron y se preservaron sus manejadores. No se ejecutaron pruebas backend porque no se modificó backend.

## Evidencias locales temporales

- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-CCUUM2/descriptions-store-320.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-CCUUM2/descriptions-store-1440.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-CCUUM2/descriptions-detail-320.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-DHjCSK/descriptions-store-375.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-DHjCSK/descriptions-store-768.png`
- `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-DHjCSK/descriptions-store-1024.png`

Sin dependencias nuevas, commits ni fases adicionales. Los cambios previos del proyecto se conservaron.

## Descripciones actualizadas

| ID | Producto | Categoria | Descripcion |
| --- | --- | --- | --- |
| figura-mensajera | Figura Mensajera de Distrito Cero | figuras | Lleva el espíritu de Distrito Cero a tu colección con su Mensajera. Una figura para dar protagonismo a tu rincón de exhibición. |
| figura-lunar | Figura Guardiana Lunar | figuras | Haz un lugar para la Guardiana Lunar entre tus personajes favoritos. Su temática lunar aporta un nuevo motivo para ampliar tu colección y exhibirla a tu manera. |
| figura-orbita | Figura Exploradora Órbita | figuras | Dale un lugar a la Exploradora Órbita en tu universo de figuras. Una propuesta de inspiración espacial para renovar tu zona de exhibición. |
| manga-distrito-1 | Distrito Cero · Volumen 01 | mangas | Comienza tu recorrido por Distrito Cero con el volumen 01. El punto de partida para descubrir esta historia y abrirle un espacio en tu colección de manga. |
| manga-distrito-2 | Distrito Cero · Volumen 02 | mangas | Continúa tu lectura de Distrito Cero con el volumen 02. Acompaña el primer tomo en tu estantería y sigue explorando su historia a tu ritmo. |
| manga-jardin | El jardín de cristal · Volumen 01 | mangas | Abre las páginas de El jardín de cristal con su volumen 01. Una nueva historia para tus momentos de lectura y el inicio de otra colección en tu biblioteca. |
| polo-midnight | Polo Neo Tokyo · Midnight | polos | Haz de Neo Tokyo parte de tu estilo cotidiano con Midnight. Combínalo a tu manera en un look cómodo que exprese tu pasión por el universo anime. |
| polo-cyan | Polo Neo Tokyo · Cyan | polos | Expresa tu lado Neo Tokyo con la propuesta Cyan. Un polo para crear combinaciones relajadas y darle identidad otaku a tu estilo de cada día. |
| polo-orbita | Polo Órbita · Edición demo | polos | Lleva la inspiración de Órbita a tus looks informales. Una opción para quienes buscan unir estilo anime y comodidad al vestir a su manera. |
| llavero-luna | Llavero Luna de Neón | accesorios | Dale a tus llaves un toque de Luna de Neón. Un accesorio para reunirlas y sumar un guiño a tu universo otaku en lo cotidiano. |
| llavero-orbita | Llavero Órbita Azul | accesorios | Pon tus llaves en la órbita de tu estilo con Órbita Azul. Un detalle para identificarlas y expresar tu afinidad por la temática espacial. |
| llavero-jardin | Llavero Jardín de Cristal | accesorios | Lleva un pequeño guiño a Jardín de Cristal junto a tus llaves. Un accesorio que une una función cotidiana con la personalidad de tu colección otaku. |
