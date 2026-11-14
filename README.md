# OtakuZone — Neo Tokyo

## Estado actual — Fase 2: integración de APIs

Frontend React existente con Jikan para anime real y JSON Server para productos, categorías y promociones demostrativas. Se conservan las cinco rutas, la 404, las tarjetas, los diálogos, los assets locales y Neo Tokyo. No se implementan Express, MySQL, compras ni autenticación.

**Disponibilidad comprobada:** JSON Server respondió HTTP 200 y React mostró sus 12 productos. Jikan dio timeout desde Node y Chrome en este entorno. El frontend muestra ese error sin sustituirlo por animes ficticios. El consumo exitoso simultáneo de ambas APIs queda pendiente de conectividad con Jikan; no se simularon respuestas exitosas.

### Iniciar los servicios

Requisitos comprobados: Node.js 24.16.0 y npm 11.13.0. Desde la raíz del proyecto:

```sh
npm ci
```

Terminal 1 — JSON Server independiente:

```sh
npm run api
```

Sirve `mock/db.json` con JSON Server 0.17.4 y observa cambios. URLs:

- http://127.0.0.1:3001/products — 12 productos ficticios.
- http://127.0.0.1:3001/categories — 5 categorías; Papelería no tiene productos.
- http://127.0.0.1:3001/promotions — 2 promociones demostrativas.

Terminal 2 — frontend:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir http://127.0.0.1:5173/ y mantener ambas terminales abiertas. Estos dos comandos se iniciaron correctamente en esta entrega. Si un puerto está ocupado, detener el proceso anterior o ajustar el puerto y su URL. Jikan es un servicio público remoto: no se inicia localmente y no necesita clave privada.

La configuración funciona sin `.env`. Para cambiar URLs, copiar `.env.example` a `.env.local`, editar y reiniciar Vite:

```dotenv
VITE_JIKAN_API_URL=https://api.jikan.moe/v4
VITE_OTAKUZONE_API_URL=http://127.0.0.1:3001
```

Las variables `VITE_*` son públicas: no colocar secretos. `127.0.0.1` corresponde al desarrollo local; un despliegue HTTPS necesita una API de tienda accesible también por HTTPS.

### Uso y validación

- Home: populares, temporada y géneros reales de Jikan; productos y promociones demostrativos de JSON Server. Carga/error/reintento independientes por fuente.
- `/animes`: búsqueda por título al enviar formulario, filtro por género, paginación y detalles en el diálogo. Parámetros guardados en la URL.
- `/tienda`: 12 productos, categorías y precios de muestra en PEN. Elegir Papelería comprueba el estado vacío.
- Las caídas de una API no se ocultan con muestras de reserva. «Reintentar» vuelve a consultar el servicio.

Con los servicios activos:

```sh
npm run check:apis
node scripts/audit-apis-browser.mjs
```

`check:apis` consulta servicios reales y devuelve código 1 si alguno falla. Si populares responde, comprueba también temporada, géneros, búsqueda Naruto y detalles. Usa Jikan público; `OTAKUZONE_API_URL` permite cambiar la URL de tienda para este script.

La auditoría de navegador usa Chrome/Edge instalado y Node 24, sin dependencias adicionales. `CHROME_PATH` indica otro ejecutable y `AUDIT_URL` otro frontend. Comprueba carga, productos, vacío, responsive, navegación y un bloqueo intencional de conexión seguido de recuperación. No fabrica éxitos de Jikan y termina con código 1 si no puede comprobar ambas fuentes. `node scripts/audit-browser.mjs` ejecuta esta auditoría actualizada.

```sh
npm test
npm run lint
npm run build
npm run preview -- --host 127.0.0.1
```

Las pruebas unitarias usan dobles explícitos para comprobar HTTP, normalización, cancelación, deduplicación y caché; no prueban disponibilidad de Internet. Resultados y limitaciones: [informe de Fase 2](INTEGRACION_FASE_2.md). Auditoría anterior: [Fase 1](AUDITORIA_FASE_1.md).

### Arquitectura y documentación

`src/services/http.js`: fetch, timeout de 15 segundos por intento, un reintento automático para conexión/429/5xx, caché corta y solicitudes compartidas. Un `Retry-After` mayor de 10 segundos requiere reintento manual. Jikan limita los inicios a uno cada 1.1 segundos por pestaña. La cancelación aborta el transporte cuando ya no hay consumidores. `useResource` ignora resultados cancelados.

`src/services/jikan.js` adapta los datos reales para las tarjetas. `src/services/otakuzone.js` valida los registros locales y resuelve las imágenes existentes: cuatro ilustraciones se reutilizan entre variantes, indicándolo en la interfaz. Los planes Free/Premium siguen siendo propuestas estáticas de demostración.

Fuentes: [documentación oficial de Jikan](https://docs.api.jikan.moe/), [especificación oficial v4](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json) y [JSON Server 0.17.4](https://github.com/typicode/json-server/tree/v0.17.4).

<details>
<summary>Historial de entregas anteriores; no describe el estado actual de las APIs</summary>

Proyecto académico de JavaScript Avanzado. FASES 1 a 4: configuración inicial, navegación multipágina y Home Neo Tokyo con contenido demostrativo local.

Auditoría y consolidación del frontend (13/11/2026): [informe de la Fase 1](AUDITORIA_FASE_1.md), con versiones instaladas, hallazgos, correcciones, validaciones y pendientes. Las fases descritas a continuación son el historial de entregas anteriores. La comprobación de navegador se puede repetir con `node scripts/audit-browser.mjs` mientras Vite está en ejecución; no requiere instalar dependencias.

## Requisitos

- Entorno comprobado: Node.js v24.16.0 y npm 11.13.0.
- Vite requiere Node.js 20.19+ o 22.12+; se recomienda usar la versión comprobada.

## Instalación y ejecución

Ejecutar desde la raíz `OtakuZone_React`:

```sh
npm install
npm run dev
```

Abrir la URL que indique Vite (normalmente http://localhost:5173). El Home muestra animes, géneros, productos y planes de demostración. La comprobación de la FASE 1 se conserva en un panel plegable al final, únicamente con el servidor de desarrollo; no se incluye en producción.

```sh
npm run build
npm run preview
```

La compilación genera `dist/`. `preview` sirve esa compilación para revisarla localmente; no es un servidor de producción.

El proyecto incluye también `npm run lint` (Oxlint), proporcionado por la plantilla oficial. Para reproducir exactamente las dependencias del archivo de bloqueo, usar `npm ci`.

## Estructura

```text
OtakuZone_React/
├── public/favicon.svg
├── src/
│   ├── assets/
│   │   ├── neo-tokyo-city.png       # Hero original, conservado
│   │   └── demo/                    # 10 imágenes locales y sus prompts
│   ├── components/
│   │   ├── common/
│   │   │   ├── PagePlaceholder.jsx
│   │   │   ├── SectionHeading.jsx
│   │   │   └── DevelopmentCheck.jsx
│   │   ├── home/
│   │   │   ├── Hero.jsx
│   │   │   ├── AnimeCard.jsx
│   │   │   ├── AnimeSection.jsx
│   │   │   ├── AnimeDetailsDialog.jsx
│   │   │   ├── CategoryCard.jsx
│   │   │   ├── ProductCard.jsx
│   │   │   ├── SubscriptionCard.jsx
│   │   │   └── CTASection.jsx
│   │   └── layout/
│   │       ├── Header.jsx
│   │       ├── Navbar.jsx
│   │       └── Footer.jsx
│   ├── data/homeData.js
│   ├── pages/                      # Home y las cinco páginas restantes
│   ├── routes/AppRouter.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── .oxlintrc.json
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Dependencias

- React y React DOM 19.3.1.
- React Router DOM 7.18.5: navegación entre páginas independientes mediante BrowserRouter, Routes, Outlet y NavLink.
- Lucide React 1.72.0: iconografía.
- @fontsource/inter y @fontsource/poppins 5.3.0: fuentes servidas localmente, sin solicitudes a Google Fonts.
- Desarrollo: Vite 8.3.8, @vitejs/plugin-react 6.3.0, Tailwind CSS y @tailwindcss/vite 4.3.5, Oxlint 1.93.0 y tipos de React de la plantilla (el código de la aplicación es JavaScript/JSX).

Las versiones exactas quedan registradas en `package-lock.json`.

## Identidad visual

`src/index.css` define variables CSS mediante `@theme`, que también generan utilidades Tailwind:

| Variable | Color | Ejemplo de utilidad |
| --- | --- | --- |
| --color-neo-midnight | #0B1020 | bg-neo-midnight |
| --color-neo-slate | #222B45 | bg-neo-slate |
| --color-neo-violet | #6366F1 | text-neo-violet |
| --color-neo-cyan | #22D3EE | text-neo-cyan |
| --color-neo-white | #F1F5F9 | text-neo-white |

Poppins se utiliza para títulos e Inter para texto. Se incluyen únicamente los pesos utilizados. El modo oscuro es permanente.

Tailwind CSS 4 se integra mediante `@tailwindcss/vite` en `vite.config.js` y `@import 'tailwindcss'` en el CSS. No requiere `tailwind.config.js`, configuración PostCSS ni directivas antiguas de Tailwind 3.

Documentación oficial: [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite) y [Vite](https://vite.dev/guide/).

## Navegación — FASE 2

| Ruta | Página |
| --- | --- |
| / | Home completo: Hero, populares, novedades, géneros, tienda, planes y registro preparado |
| /animes | Animes |
| /tienda | Tienda Otaku |
| /favoritos | Favoritos |
| /cuenta | Mi Cuenta |
| Cualquier otra | Página no encontrada (404 visual) |

Header y Navbar se comparten mediante el layout público. NavLink marca la ruta activa en cian y con `aria-current="page"`; la navegación no recarga el documento. Cada página actualiza el título del navegador y al cambiar de ruta se lleva el foco al contenido.

A partir de 1024 px se muestra la navegación horizontal. Por debajo, el botón hamburguesa abre y cierra un panel desplegable. El menú se cierra al seleccionar un enlace, al cambiar de ruta, con Escape y al pasar a escritorio. Escape devuelve el foco al botón. Se incluye un enlace para saltar al contenido y estilos de foco visibles.

El icono de usuario navega a Mi Cuenta. Búsqueda y carrito son botones deshabilitados, con etiquetas que indican que estarán disponibles en una próxima fase. No se simulan búsquedas, compras ni autenticación.

Para un futuro alojamiento estático con BrowserRouter, el servidor deberá devolver `index.html` para las rutas de la aplicación. La página 404 actual pertenece al frontend; no establece un estado HTTP 404 en el servidor de desarrollo.

## Verificaciones anteriores — FASE 2

- `npm run dev`: servidor Vite iniciado correctamente.
- Chrome sin ventana: navegación de escritorio y móvil por las cinco rutas, carga directa y ruta inexistente.
- Comprobado el indicador activo, la conservación del documento al navegar, el enlace de usuario, el contador de Home y el regreso desde 404.
- Menú móvil: apertura, cierre al seleccionar una opción, Escape con recuperación de foco y cierre al cambiar a escritorio.
- Anchos de 320, 375, 390, 768, 1024, 1280 y 1440 px: sin desbordamiento horizontal ni superposición de los bloques del Header.
- Capturas de escritorio y móvil revisadas visualmente.
- Consola del navegador: sin errores tras añadir el favicon del proyecto.
- `npm run build`: compilación de producción correcta.

La FASE 2 conserva las dependencias, el archivo de bloqueo, las fuentes, los estilos globales y la configuración de Tailwind/Vite de la FASE 1. No requirió instalaciones nuevas.

## Componentes visuales — FASE 3

- `src/components/home/Hero.jsx`: banner independiente con imagen de ciudad japonesa futurista, degradados oscuros, título y descripción solicitados. Sus enlaces React Router conducen a `/animes` y `/tienda`. La imagen decorativa se importa desde `src/assets/neo-tokyo-city.png` y se sirve localmente, sin depender de un proveedor externo. Se carga con prioridad alta.
- `src/components/layout/Footer.jsx`: componente compartido con logotipo, descripción, enlaces a Inicio/Animes/Tienda Otaku, contacto ficticio y derechos reservados. Los iconos representativos de Instagram, YouTube y Twitch utilizan Camera, Video y MessageCircle de la versión instalada de Lucide; permanecen deshabilitados y señalados como próximos mientras no existan perfiles oficiales.
- `Header.jsx` y `Navbar.jsx`: revisados y conservados sin cambios; mantienen toda la navegación y el comportamiento responsive de la FASE 2.
- `Home.jsx` en FASE 3: mostraba el Hero junto a la pantalla provisional. La FASE 4 reemplaza esa presentación provisional por las secciones completas y conserva la comprobación técnica solo en desarrollo.
- `PagePlaceholder.jsx`: admite `headingLevel={2}` para que Inicio conserve su título provisional sin duplicar el h1 del Hero. Las demás páginas siguen usando h1.
- `AppRouter.jsx`: monta Footer en el layout público, adapta el ancho de Inicio para el banner y mantiene el enfoque del contenido al navegar. Footer aparece también en las páginas provisionales y en 404.

Los componentes utilizan las variables existentes, Poppins e Inter y utilidades responsive de Tailwind CSS 4. No se cambiaron dependencias, archivo de bloqueo, configuración Vite/Tailwind ni estilos globales.

### Imagen del Hero

Generada con la herramienta integrada imagegen y copiada al proyecto en `src/assets/neo-tokyo-city.png` (2172 × 724 px). No requiere claves ni servicios de generación durante la ejecución de la aplicación.

Prompt final utilizado:

> Use case: stylized-concept. Asset type: panoramic website hero background for OtakuZone Neo Tokyo. Create an original cinematic anime-inspired futuristic Japanese city at night, intricate dense Tokyo skyline, elevated rail and a few subtle Japanese architectural rooftops, atmospheric mist, wet streets reflecting cyan and electric violet neon. Wide panoramic 3:1 composition, 1920x640 if possible. Right half contains striking skyline and street perspective, left half quieter and darker with negative space for HTML heading overlay. Palette strictly midnight blue #0B1020, slate #222B45, electric violet #6366F1, cyan #22D3EE, cool white #F1F5F9. Elegant restrained light bloom, professional detailed digital environment illustration. No characters, no orange, red or gold lighting, no logos, no readable text, no watermark. Output a standalone background image, not a website mockup.

### Verificación de FASE 3

- `npm run dev`: servidor de desarrollo iniciado correctamente.
- Chrome: cinco rutas en escritorio y móvil, indicador activo en cian, navegación sin recarga y carga directa de cada ruta.
- Hero: imagen cargada, un único h1 por página y ambos botones con sus destinos correctos.
- Footer: enlaces internos y logotipo funcionales, contacto explícitamente ficticio y redes deshabilitadas.
- Menú móvil: apertura, cierre al navegar, Escape con recuperación de foco y cierre al cambiar a escritorio.
- Se conserva el contador de la FASE 1 y el regreso al inicio desde 404.
- Anchos 320, 375, 390, 768, 1024, 1280 y 1440 px: sin desbordamientos horizontales ni superposiciones del Header; título, descripción y botones permanecen dentro del Hero.
- Capturas de Home a 390, 768 y 1440 px revisadas visualmente.
- Sin errores de consola, de ejecución ni de carga de recursos en Chrome.
- `npm run build`: compilación de producción correcta tras resolver las importaciones de iconos no disponibles en esta versión de Lucide.

## Home definitivo — FASE 4

El Home ensambla las secciones en el orden solicitado:

1. Header y Navbar compartidos por el layout.
2. Hero de FASE 3, sin cambios en texto, imagen ni enlaces.
3. Cuatro animes populares, con puntuación de muestra y ficha demostrativa.
4. Cuatro novedades, con temporada ficticia e indicador de novedad.
5. Seis géneros: Acción, Aventura, Romance, Fantasía, Ciencia ficción y Comedia.
6. Cuatro productos de muestra con precio en soles y enlace a Tienda Otaku.
7. Planes Free y Premium, con beneficios propuestos y precios ficticios.
8. CTA de registro preparado.
9. Footer compartido, conservado sin duplicaciones.

`AnimeSection` se reutiliza para populares y novedades; `AnimeCard` permite consultar una ficha local en un diálogo nativo. El diálogo conserva el foco dentro de la ficha, se cierra con Escape o el botón de cierre y devuelve el foco al activador. `SectionHeading` comparte la jerarquía de las secciones. Todas las imágenes de tarjetas usan carga diferida, dimensiones reservadas y texto alternativo.

### Datos demostrativos

`src/data/homeData.js` centraliza los datos. Todas las obras, puntuaciones, temporadas, popularidad, productos y precios son ficticios y están identificados como muestras dentro de la interfaz.

- Obras: Distrito Cero, El jardín de cristal, Órbita 09, Café entre nubes, Archivo lunar e Isla de bruma.
- Las novedades reutilizan dos obras con una segunda temporada ficticia, además de dos títulos nuevos. No son noticias ni fechas reales de estreno.
- Productos: figura de mensajera (S/ 129.90), manga (S/ 39.90), polo Neo Tokyo (S/ 59.90) y llavero (S/ 19.90).
- Planes: Free (S/ 0.00/mes) y Premium (S/ 19.90/mes). Son precios de muestra, sin cobros. Ningún botón activa una suscripción.
- Imágenes: seis portadas y cuatro productos originales, generados con la herramienta integrada imagegen y almacenados en `src/assets/demo/`. Los prompts finales se registran en [src/assets/demo/README.md](src/assets/demo/README.md). No existen solicitudes a servicios de imágenes ni APIs durante la ejecución.

### Destinos y pendientes explícitos

- Hero y enlaces de catálogo: `/animes`.
- Géneros: `/animes`, sin aplicar filtros ficticios.
- Fichas de anime: diálogo local, sin crear rutas de detalle que no existen.
- Productos y planes: `/tienda`, todavía una presentación provisional. Su descripción se actualizó para explicar esta dependencia.
- Registro: `/registro` **no existe**. «Crear cuenta» es un botón deshabilitado con una nota visible. Para habilitarlo se requiere implementar y autorizar esa ruta en una fase posterior; no se envía al usuario a un 404.
- Redes, búsqueda y carrito siguen sin activarse, como en las fases previas.
- El contador técnico de FASE 1 se conserva en `DevelopmentCheck`, un panel plegable exclusivo de `import.meta.env.DEV`. El Home de producción muestra únicamente el contenido de la plataforma.

### Archivos conservados

Sin cambios: Header, Navbar, Hero, Footer, PagePlaceholder, App, main, estilos globales, configuración Vite/Tailwind, package.json, archivo de bloqueo, favicon y las páginas Animes, Favoritos, Mi Cuenta y NotFound. La imagen `src/assets/neo-tokyo-city.png` tampoco fue modificada.

Cambios en archivos existentes: `Home.jsx` ensambla el Home definitivo; `AppRouter.jsx` muestra la nota de páginas provisionales solo fuera de Inicio; `Tienda.jsx` aclara que catálogo y suscripciones aún no están disponibles; este README documenta la entrega.

### Validaciones de FASE 4

Comprobaciones ejecutadas en Chrome mediante el protocolo de depuración, sin instalar dependencias de pruebas:

- Orden de las siete secciones de contenido y cantidades de tarjetas: 4 populares, 4 novedades, 6 géneros, 4 productos y 2 planes.
- Un solo Header, Footer, main y h1 por página.
- Cinco rutas en escritorio y móvil, indicador activo en cian, carga directa y página 404 con regreso al inicio.
- Los 17 enlaces del contenido (Hero, secciones, categorías, productos y planes) navegan a rutas existentes sin recargar el documento.
- Los ocho botones de detalle abren la ficha correcta; comprobados foco, cierre con Escape/botón y restauración de foco, también bajo React StrictMode.
- Menú móvil: apertura, cierre al navegar, Escape y recuperación de foco, cierre al pasar a escritorio. Enlaces del Footer y acceso a Mi Cuenta conservados.
- Anchos 320, 375, 768, 1024 y 1440 px: sin scroll horizontal, recortes en tarjetas ni superposición de bloques del Header.
- Todas las imágenes locales cargan correctamente y se revisaron capturas de escritorio, tablet y móvil.
- CTA de registro deshabilitado, sin enlaces a rutas inventadas. Contador técnico comprobado en desarrollo.
- Sin errores de consola, ejecución ni carga de recursos.
- `npm run build`: correcto; producción generada en `dist/`.

## Alcance

La FASE 4 integra exclusivamente el frontend con datos locales. No incluye backend, MySQL, autenticación, APIs externas, CRUD, administración, reproducción de episodios, videojuegos, pagos ni carrito funcional. No se instalaron dependencias ni se modificó Tailwind CSS 4.

Cualquier fase posterior requiere nuevas indicaciones.

</details>
