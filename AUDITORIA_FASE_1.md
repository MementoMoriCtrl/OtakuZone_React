# OtakuZone — Auditoría y consolidación del frontend

Fecha: 13 de noviembre de 2026. Alcance: consolidación del frontend existente; no se inicia la Fase 2 de esta solicitud. Las menciones históricas a fases 1–4 en el README describen entregas anteriores.

## Estructura real inspeccionada

```text
public/favicon.svg
src/
  assets/
    neo-tokyo-city.png
    demo/                   # 10 PNG locales y README con sus prompts
  components/
    common/                 # DevelopmentCheck, PagePlaceholder, SectionHeading
    home/                   # Hero, AnimeSection, AnimeCard, AnimeDetailsDialog,
                            # CategoryCard, ProductCard, SubscriptionCard, CTASection
    layout/                 # Header, Navbar, Footer
  data/homeData.js           # Animes, géneros, productos y planes ficticios
  pages/                    # Home, Animes, Tienda, Favoritos, MiCuenta, NotFound
  routes/AppRouter.jsx      # BrowserRouter, layout público y seis destinos
  App.jsx
  main.jsx                  # StrictMode y fuentes locales
  index.css                 # Tailwind 4 y tokens Neo Tokyo
scripts/audit-browser.mjs    # Añadido en esta auditoría; sin dependencias nuevas
index.html
vite.config.js
.oxlintrc.json
.gitignore
package.json
package-lock.json
README.md
```

También existen `node_modules/`, `.git/` y `dist/` generado. Se inspeccionaron todos los módulos de `src`, la documentación de assets, el HTML, las configuraciones y los manifiestos. No se encontraron instrucciones AGENTS.md aplicables en el proyecto ni en los directorios superiores consultados.

Vite usa `@vitejs/plugin-react` y `@tailwindcss/vite`. Tailwind se importa mediante `@import 'tailwindcss'` y se configura con `@theme`: la ausencia de `tailwind.config.js` y PostCSS es coherente con esta configuración de Tailwind 4.

## Dependencias reales

Versiones obtenidas con `npm ls --depth=0` y contrastadas con las entradas del archivo de bloqueo. Los rangos de package.json permiten estas versiones; no se migró ni se instaló nada.

| Dependencia | Instalada y bloqueada |
| --- | --- |
| react / react-dom | 19.3.1 / 19.3.1 |
| react-router-dom | 7.18.5 |
| lucide-react | 1.72.0 |
| @fontsource/inter / @fontsource/poppins | 5.3.0 / 5.3.0 |
| vite | 8.3.8 |
| @vitejs/plugin-react | 6.3.0 |
| tailwindcss / @tailwindcss/vite | 4.3.5 / 4.3.5 |
| oxlint | 1.93.0 |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 |

Entorno ejecutado: Node.js v24.16.0 y npm 11.13.0. Scripts originales: `dev`, `build`, `lint`, `preview`. No existía script `test` ni una suite de pruebas propia. `package.json` y `package-lock.json` se conservan sin cambios.

## Problemas detectados y correcciones

1. **Cierre accidental de las fichas.** El manejador consideraba cualquier clic cuyo destino fuera `<dialog>` como un clic exterior. Esto incluye su padding interior. La prueba con coordenadas reales reprodujo el cierre incorrecto. `AnimeDetailsDialog` ahora comprueba los límites del rectángulo antes de cerrar; los clics interiores mantienen la ficha abierta. Se conserva el cierre exterior, Escape, botón y el comportamiento nativo de foco.
2. **Advertencia de pureza en Footer.** `npm run lint` señalaba `new Date()` dentro del render. El año se calcula al cargar el módulo, fuera del render. Se mantiene el año dinámico al cargar la aplicación y se elimina la advertencia.
3. **Validaciones no reproducibles desde el repositorio.** El README describía pruebas de entregas anteriores, pero no había scripts para repetirlas. Se añadió `scripts/audit-browser.mjs`, que utiliza el protocolo de depuración de un Chrome/Edge instalado y las APIs de Node, sin instalar bibliotecas. Incluye la regresión del padding del diálogo.

No se encontraron imports innecesarios, componentes que requirieran dividirse, duplicaciones que justificaran una refactorización ni errores de navegación en el alcance comprobado. No se modificaron componentes correctos, datos, rutas, estilos ni imágenes.

## Rutas y funcionalidad

| Ruta | Estado existente y verificación |
| --- | --- |
| `/` | Home con Hero, populares, novedades, géneros, productos, planes y CTA |
| `/animes` | Página provisional accesible y navegación activa |
| `/tienda` | Página provisional de productos y planes accesible |
| `/favoritos` | Página provisional accesible |
| `/cuenta` | Página provisional accesible desde menú e icono de usuario |
| `*` | 404 visual; comprobada con `/ruta-inexistente` y regreso a Inicio |

Las cinco rutas principales existen; las cuatro páginas secundarias todavía no son catálogos ni funcionalidades completas. Se mantienen sus destinos y su alcance real.

`NavLink` usa `end`, clases activas y `aria-current="page"`. Header/Footer comparten el layout, sin duplicarse. Los enlaces de Hero conducen a Animes y Tienda. Los géneros llevan al catálogo general, sin simular filtros. Productos y planes llevan a Tienda. El contacto del Footer es texto ficticio, no un buzón funcional. Búsqueda, carrito, redes y registro están explícitamente deshabilitados; no son enlaces rotos.

## Reutilización y Hooks

| Componente | Reutilización y props |
| --- | --- |
| AnimeSection | Populares y novedades; recibe identificador, textos, lista e indicador `isNew` |
| AnimeCard | Ocho tarjetas en ambas secciones; recibe `anime`, `isNew` y callback `onDetails` |
| SectionHeading | Cinco secciones: populares, novedades, géneros, tienda y planes; enlace opcional |
| Navbar | Escritorio y móvil; `mobile` y `onNavigate` ajustan presentación y cierre |
| PagePlaceholder | Cuatro páginas secundarias y 404; título, descripción, número, children y nivel de encabezado |
| ProductCard / CategoryCard / SubscriptionCard | Colecciones del Home mediante props de datos y claves estables |

Se supera el requisito de dos componentes usados en diferentes secciones. Home ya delega la presentación en componentes pequeños y concentra los datos demostrativos fuera del JSX.

- `useState`: apertura del menú, ficha seleccionada por sección y contador exclusivo de desarrollo. Las actualizaciones del contador y el toggle usan la forma funcional.
- `useEffect`: alta/baja de listeners de teclado y media query; apertura/cierre del diálogo nativo; título, foco y scroll al cambiar la ruta. Los listeners tienen limpieza.
- `useRef`: referencias al botón, al diálogo, al main y a la ruta anterior. `Header key={pathname}` reinicia el menú al cambiar de página; se conserva.
- Se mantiene StrictMode. La comprobación de `dialog.open` evita que un evento close de la limpieza inicial cierre una ficha reabierta durante el ciclo de efectos de desarrollo.

## Identidad y accesibilidad

Se conservan fondo `#0B1020`, superficies `#222B45`, violeta `#6366F1`, cian `#22D3EE` y texto `#F1F5F9`. Títulos Poppins y texto Inter, servidos localmente. No se añadieron colores de marca ni se reemplazaron imágenes.

Inspección de código: enlace de salto, main enfocable, encabezados por sección, etiquetas de botones, texto alternativo, iconos decorativos ocultos, foco visible y variantes de movimiento reducido. Pruebas de navegador: un h1/main/header/footer por página, foco al navegar, foco modal y devolución al activador. Esto no equivale a una auditoría completa con lectores de pantalla o de contraste de todos los estados.

## Arquitectura para integraciones futuras

La separación existente es suficiente para esta fase: rutas en `routes`, pantallas en `pages`, UI en `components` y muestras en `data/homeData.js`. Se conserva, sin crear capas vacías ni añadir estados de carga ficticios.

Cuando se autorice la integración, los clientes de Jikan, JSON Server o Express podrán vivir en una capa `services/`, con adaptadores que mantengan contratos de presentación como `id`, `title`, `genre`, `score`, `season`, `image`, `imageAlt` y `description`. La lista seguirá entrando por props y los estados de carga/error se gestionarán en páginas o Hooks específicos. Los identificadores de las muestras no deben confundirse con identificadores reales de Jikan. MySQL se conectará exclusivamente desde el backend; no se introducirán credenciales en el frontend. Estas son decisiones documentadas, no integraciones implementadas.

## Validaciones de esta auditoría

Los resultados históricos del README no se han utilizado como prueba de esta entrega. Se ejecutaron de nuevo:

- `npm ls --depth=0`: dependencias instaladas válidas y consistentes con el lockfile.
- `npm run build`: compilación correcta después de las correcciones.
- `npm run lint`: sin advertencias después de corregir Footer.
- `git diff --check`: sin errores de whitespace; Git advierte sobre su conversión habitual LF/CRLF en Windows.
- Navegador Chrome local sin ventana mediante CDP: **185 comprobaciones correctas** en la ejecución final sobre Vite en desarrollo, con React StrictMode.

Comprobaciones ejecutadas en navegador:

- Carga directa de las cinco rutas y 404 en 320, 375, 390, 768, 1024, 1280 y 1440 px. Un h1/main/header/footer por página, rutas activas y ausencia de desbordamiento horizontal.
- Navegación por las cinco rutas sin recargar el documento y foco en el main al cambiar de página.
- Los 21 enlaces de Hero, secciones, géneros, productos, planes y Footer llegan a sus destinos.
- Siete secciones principales y 14 artículos de Home (ocho animes, cuatro productos y dos planes).
- Ocho fichas con contenido correcto, foco inicial en el diálogo, cierre alternado por Escape/botón y devolución del foco. Regresión del clic en el padding y cierre mediante clic exterior comprobados después de la corrección.
- Menú móvil: apertura, cierre con Escape y foco en el activador, cierre al navegar a Tienda y al cambiar a escritorio.
- CTA de registro deshabilitado, contador de desarrollo interactivo, todas las imágenes decodificadas, familias Inter/Poppins aplicadas y regreso desde 404.
- Sin errores de consola de nivel error, excepciones de ejecución ni errores de recursos registrados por Chrome en esa ejecución. No se afirma una comprobación de todas las advertencias del navegador.

Revisión visual realizada: se abrieron e inspeccionaron las capturas de la parte superior de Home a 390, 768 y 1440 px. Header, título, imagen y botones del Hero mantienen composición legible, sin superposición ni recortes de texto. La comprobación del resto de la página a esos tamaños fue automatizada mediante DOM y dimensiones, no una inspección visual de cada tarjeta o estado.

La compilación de producción se generó, pero esta suite de navegador se ejecutó contra el servidor de desarrollo, no contra un despliegue. La primera ejecución del teclado necesitó ajustar el envío de Escape por CDP; ese fallo pertenecía al script, no a la aplicación. Una ejecución intermedia de capturas no terminó y se sustituyó por capturas del viewport con tiempo máximo por comando. Los resultados anteriores corresponden exclusivamente a la ejecución final completada.

### Repetir la comprobación en navegador

Con Node 24 y Chrome o Edge instalados, iniciar en una terminal:

```sh
npm run dev -- --host 127.0.0.1
```

En otra terminal:

```sh
node scripts/audit-browser.mjs
```

`CHROME_PATH` permite indicar otro ejecutable y `AUDIT_URL` otra dirección del servidor. El script abre su propio navegador sin ventana con un perfil temporal independiente y lo cierra al terminar. Guarda capturas temporales e imprime sus rutas. No controla el navegador personal del usuario.

## Riesgos y pendientes

- Assets PNG locales de aproximadamente 1.9–2.8 MB cada uno: coste de descarga relevante en móvil. Se conserva lazy loading en tarjetas y prioridad alta en Hero. No se optimizaron ni reemplazaron imágenes por restricción de alcance.
- Catálogo, tienda, favoritos, cuenta, registro, búsqueda, carrito y redes siguen pendientes según los mensajes existentes. Los precios y datos son ficticios; no hay compras ni autenticación.
- BrowserRouter requiere fallback a `index.html` en el alojamiento. La 404 es visual y no establece un código HTTP 404.
- No se verificaron otros motores de navegador, lectores de pantalla ni un alojamiento de producción. No hay pruebas unitarias de lógica de negocio porque esa lógica aún no existe.
- El año del Footer se actualiza al cargar el módulo; una pestaña que permanezca abierta al cambiar de año necesita recargarse para mostrar el nuevo año.
- No se implementaron Jikan, JSON Server, Express, MySQL ni backend. No se avanzó a la Fase 2.
