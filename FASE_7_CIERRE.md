# Cierre de FASE 7 — OtakuZone

Fecha: 13 de noviembre de 2026 (America/Lima).

## Estado final

**FASE 7 CERRADA en su alcance académico, con validación HTTP/MySQL y navegador ejecutada. Sin commit.** No se avanzó a FASE 8 ni se añadieron funcionalidades de producto. Se conservaron los archivos funcionales recuperados y las seis migraciones/checksums.

Este informe complementa `RECUPERACION_FASE_7.md`: sus pendientes de validación comercial quedan resueltos por las ejecuciones descritas aquí. Los resultados históricos de `TIENDA_FASE_7.md` no se reutilizaron como evidencia de esta ejecución.

## 1. Aislamiento comprobado antes de escribir fixtures

Se utilizó MySQL 8.0.46 en el servidor local, con **otra base y otra cuenta**; no otro proceso MySQL. El preparador `backend/scripts/close-phase7.js` obtiene las credenciales administrativas de las variables de entorno (cargadas desde el `.env` local existente, sin imprimirlas). Comprobó el esquema origen en modo lectura y los seis SHA-256 contra `schema_migrations`.

Se crearon bases con nombre aleatorio `otakuzone_f7_test_<12 hex>` mediante CREATE DATABASE sin IF NOT EXISTS. Se copió el DDL de las 16 tablas existentes mediante SHOW CREATE TABLE; **no se ejecutó el migrador ni ningún archivo de migración**. Solo se copiaron filas de roles, categorías, productos, inventario, planes, promociones y ledger. No se copiaron usuarios, hashes, sesiones, carritos, pedidos ni historial de suscripciones de desarrollo.

La cuenta temporal `ozf7_<12 hex>` recibió exclusivamente SELECT/INSERT/UPDATE/DELETE sobre su base. La contraseña y el secreto JWT se generaron en memoria y se pasaron al backend y pruebas como variables de entorno; no se guardaron en archivos. Las pruebas no recibieron credenciales administrativas. El preparador mantuvo su conexión administrativa solo para aprovisionamiento/limpieza, sin escrituras a tablas de desarrollo.

`test-isolation.js` verifica NODE_ENV=test, nombre exacto TEST_DB_NAME/DB_NAME, diferencia con DEVELOPMENT_DB_NAME, patrón de cuenta, DATABASE(), CURRENT_USER(), permisos y rechazo real al intentar leer usuarios de desarrollo. Se ejecutó antes de fixtures y de sus bloques de limpieza. Tres configuraciones inseguras (desarrollo, root y nombre discrepante) fueron rechazadas antes de conectar.

API aislada: `127.0.0.1:4407`; Vite aislado: `127.0.0.1:5177`, con CORS y ambas URLs frontend dirigidas a esa API. El preparador comprueba puertos libres; Vite usa strictPort. Chrome usó un perfil temporal nuevo, sin sesiones del usuario.

La ejecución final utilizó `otakuzone_f7_test_86178b3c3ec4`. Los scripts limpiaron únicamente sus UUID técnicos; después se detuvieron ambos servidores y se eliminaron la base y cuenta exactas creadas por el preparador. Una consulta administrativa posterior confirmó **cero bases `otakuzone_f7_test_%` y cero cuentas `ozf7_%`**. Las ejecuciones anteriores también completaron su limpieza. Los perfiles temporales de Chrome permanecen fuera del repositorio; no deben añadirse a Git.

## 2. Funcionalidades y clasificación

| Funcionalidad | Estado | Evidencia ejecutada |
| --- | --- | --- |
| Productos: listado/detalle/categorías/orden/disponibilidad | COMPLETADA Y VALIDADA | HTTP con repositorio MySQL y catálogo visible, búsqueda, filtro, orden y detalle en Chrome. |
| Carrito: agregar/incrementar | COMPLETADA Y VALIDADA | HTTP incrementa a dos unidades; navegador agrega producto. |
| Carrito: modificar cantidades | COMPLETADA Y VALIDADA | PATCH cambia total; formulario del navegador actualiza a dos unidades. |
| Carrito: eliminar | COMPLETADA Y VALIDADA | DELETE deja total 0.00; Quitar en navegador deja estado vacío y permite nueva adición. |
| Carrito: subtotal/total | COMPLETADA Y VALIDADA | 2 × 12.35 = 24.70; rechazo de precio enviado por cliente. |
| Carrito: inexistentes/cantidades/stock | COMPLETADA Y VALIDADA | 404 inexistente; 400 para 0, negativos, fracciones, >99; 409 si supera stock. |
| Carrito: persistencia/propietario | COMPLETADA Y VALIDADA | Consulta SQL de dos unidades, navegación completa conserva carrito; otro usuario recibe su propio carrito vacío. |
| Pedidos: crear/detalles/importes/estado/historial | COMPLETADA Y VALIDADA | POST confirmado; dos líneas, evento confirmado y total SQL 38.55; historial/detalle HTTP y navegador. |
| Pedidos: validación de entradas/stock | COMPLETADA Y VALIDADA | Total manipulado rechazado; cartId ajeno/convertido y stock insuficiente devuelven 409. Productos/cantidades se validan en carrito y stock se revalida en checkout. |
| Pedidos: transacción/rollback | COMPLETADA Y VALIDADA | Fallo intermedio real revierte cabecera, detalles, historial y stock, y conserva carrito. |
| Pedidos: duplicados/concurrencia | COMPLETADA Y VALIDADA | Mismo UUID concurrente: 201/200, mismo pedido; otro UUID sobre carrito convertido: 409; última unidad: un 201 y un 409. |
| Pedidos: propiedad/permisos | COMPLETADA Y VALIDADA | Usuario ajeno recibe 404; no aparece pedido en su historial; no puede confirmar carrito ajeno. Estado y dueño permanecen intactos tras intento PATCH. |
| Suscripciones: planes Free/Premium | COMPLETADA Y VALIDADA | GET planes; Free inicial, Premium y retorno a Free en HTTP y Chrome. |
| Suscripciones: activación/estado/persistencia | COMPLETADA Y VALIDADA | Recarga conserva Premium, SQL confirma un periodo activo; repetir Premium no duplica historial. |
| Suscripciones: entradas inválidas | COMPLETADA Y VALIDADA | Rechaza código no admitido, precio y userId inyectados y falta de CSRF; repositorio rechaza usuario ausente con 401 y plan ausente con 404. |
| Seguridad comercial | COMPLETADA Y VALIDADA | Sin sesión: 401; CSRF: 403; cliente en admin/overview: 403; aislamiento SQL deniega acceso a desarrollo. |
| UI: carga/error/vacío/éxito/responsive | COMPLETADA Y VALIDADA | Petición pausada muestra Cargando; bloqueo de red muestra error y Reintentar recupera; compra/planes exitosos; seis rutas a cuatro anchos. |
| Cambiar estados administrativamente/cancelar/reembolsar | NO IMPLEMENTADA | Fuera del alcance documentado; PATCH de pedido no es una operación expuesta. |
| Pagos/envíos reales y checkout invitado | NO IMPLEMENTADA | Fuera del alcance académico de FASE 7. |

No queda una funcionalidad del alcance comercial solicitado clasificada como IMPLEMENTADA, PERO NO VALIDADA o PARCIALMENTE IMPLEMENTADA. Esto no certifica producción ni cobertura exhaustiva de todas las ramas.

## 3. Endpoints y tablas

Prefijo `/api/v1`:

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | /products, /products/:id, /categories, /categories/:id | Público |
| GET | /cart | Autenticado; puede crear carrito vacío |
| POST | /cart/items | Sesión + origen permitido + CSRF |
| PATCH / DELETE | /cart/items/:id | Sesión + origen permitido + CSRF |
| POST | /orders | Sesión + origen permitido + CSRF; 201 nuevo / 200 repetido |
| GET | /orders, /orders/:id | Autenticado, datos del propietario |
| GET | /plans | Público |
| GET | /subscription | Autenticado; puede inicializar Free |
| PATCH | /subscription | Sesión + origen permitido + CSRF |

Tablas comerciales: `productos`, `categorias`, `inventario`, `carritos`, `detalles_carrito`, `pedidos`, `detalles_pedido`, `historial_pedidos`, `suscripciones`, `historial_suscripciones`. Soporte: `usuarios`, `roles`, `auth_sesiones`, `promociones`, `schema_migrations`. `favoritos` permanece en el esquema; la interfaz anterior mantiene favoritos locales.

Se validaron 16 tablas InnoDB, 15 FK, 19 CHECK y seis versiones. UNIQUE por carrito de origen y por usuario/clave impide pedidos duplicados; índices generados limitan a un carrito y un periodo de suscripción activos por usuario.

## 4. Pruebas realmente ejecutadas

| Ejecución | Resultado |
| --- | --- |
| `node backend/scripts/close-phase7.js` (ejecución final) | PASS: aislamiento, **62 solicitudes HTTP comerciales**, SQL, Chrome, limpieza de fixtures y eliminación de base/cuenta. |
| `npm test` | **18/18 PASS**. |
| `npm --prefix backend test` | **18/18 PASS**. |
| `npm run lint` | PASS; repetido después de las últimas aserciones. |
| `npm run build` | PASS, Vite 8.3.8. No cambió código frontend tras el build. |
| `git diff --check` | PASS; advertencias de normalización LF/CRLF de archivos previos, sin errores de whitespace. |
| Pruebas negativas de la guarda | Tres configuraciones inseguras rechazadas sin conexión. |
| Revisión de secretos y exclusiones | 180 archivos candidatos revisados antes de crear este informe; ningún patrón sospechoso de clave privada, JWT literal o secreto largo de entorno. .env y dist ignorados; índice vacío. |

Los 62 requests pertenecen a la ejecución HTTP final; no incluyen la navegación ni se sumaron las ejecuciones previas. Las 36 pruebas generales cubren regresión de catálogo/servicios, autenticación unitaria, validadores, favoritos y helper transaccional. No se ejecutaron auth:verify ni db:verify; no se afirma una nueva validación completa de toda la aplicación o de APIs externas.

## 5. Transacciones, persistencia y seguridad

Se redujo el stock de un producto técnico después de agregarlo: checkout devolvió 409, no creó pedido ni consumió otro producto y conservó las líneas del carrito. Después se inyectó una excepción de aplicación al insertar historial, **tras ejecutar SQL real de cabecera, detalles y consumo de stock**. El 500 genérico fue esperado. Se comprobaron stock restaurado, cero pedidos/detalles/eventos y mismo carrito. La inyección existe solo en el pool de pruebas; no se modificaron servicios ni tablas para producir el fallo.

La compra posterior confirmó y descontó stock. Tras cambiar el precio técnico, los detalles históricos mantuvieron el snapshot anterior. Las dos carreras concurrentes confirmaron idempotencia y ausencia de sobreventa para la última unidad. Son escenarios ejecutados, no una prueba de carga prolongada.

La propiedad se deriva de la sesión. El intento de consultar pedido ajeno devolvió 404 y de modificarlo mediante PATCH devolvió 404 porque no existe esa ruta; una consulta SQL confirmó dueño y estado originales. El usuario cliente no accedió a admin/overview (403). Usuario inexistente y plan inexistente se verificaron directamente en repositorio porque la API no permite seleccionar usuario arbitrario ni acepta códigos fuera de Free/Premium.

## 6. Evidencia de navegador

Chrome headless real mediante CDP, con perfil independiente y backend MySQL aislado:

- Redirección de carrito a cuenta y registro con autenticación existente.
- Carga observada pausando `/cart` con Fetch; reanudación correcta.
- Error real de red bloqueando `/cart`, mensaje de error y recuperación con Reintentar.
- Catálogo, orden descendente, categoría, búsqueda vacía y búsqueda de producto técnico.
- Agregar, modificar, eliminar, volver a agregar y persistir carrito; SQL verifica dos unidades.
- Pedido confirmado de 24.70, stock de cinco a tres, historial y detalle con historial de estados.
- Free inicial, activar Premium, recarga conserva Premium, insignia y promociones ocultas; volver a Free restaura promociones.
- Seis rutas (`/tienda`, detalle, `/carrito`, `/pedidos`, detalle de pedido, `/suscripciones`) a 320/390/768/1440 px sin desbordamiento horizontal; sin excepciones ni console.error de aplicación.

Capturas guardadas y revisadas visualmente, con solo datos técnicos de prueba:

- [Pedido demostrativo](docs/evidencias/fase7/pedido-demostrativo.png).
- [Suscripciones a 390 px](docs/evidencias/fase7/suscripciones-movil.png).

Las capturas no son un registro de todas las pantallas y la prueba responsive no sustituye una auditoría completa de accesibilidad ni de todos los dispositivos.

## 7. Incidencias y resolución

1. El primer preparador calculó el directorio raíz un nivel por encima: MODULE_NOT_FOUND antes de ejecutar comercio. Se corrigió la ruta del preparador; su base y cuenta se eliminaron en finally. No afectó código del producto.
2. El primer intento de Chrome dentro del sandbox no inició. La repetición autorizada fuera del sandbox pasó. Las suites generales también requirieron repetición fuera del sandbox por spawn EPERM; aprobaron después.
3. Se observó un log de error interno durante rollback: es la excepción deliberada esperada por la prueba (500), no un fallo pendiente.
4. La primera ejecución completa aprobó 61 requests y navegador. Se añadieron comprobaciones de carga y rollback sin huérfanos; la ejecución final aprobó 62 requests y navegador.
5. No se detectaron fallos funcionales que exigieran modificar código de aplicación. Solo se preparó infraestructura de validación y se ampliaron aserciones.

## 8. Archivos de esta continuación y revisión para commit

Nuevos: `backend/scripts/close-phase7.js`, `backend/scripts/test-isolation.js`, este informe y las dos capturas en `docs/evidencias/fase7/`.

Actualizados: `backend/scripts/verify-commerce.js` y `scripts/audit-commerce-browser.mjs` (ambos ya existían sin seguimiento): aislamiento obligatorio, aserciones adicionales, puerto de API configurable y recorrido de eliminación/carga.

Los otros 22 archivos rastreados modificados y los demás nuevos de comercio proceden de la implementación recuperada. No se cambió `RECUPERACION_FASE_7.md`, código funcional ni migraciones SQL durante esta continuación. El manifest ya incluía 006 antes de empezar.

Para el futuro commit incluir la implementación recuperada de backend/frontend, migración 006 y manifest, permisos de ejemplo, scripts comerciales con guardas, preparador, documentación y capturas. Revisar asimismo el ajuste previo de audit-auth-browser. No incluir `.env`, perfiles Chrome, node_modules, dist, logs ni credenciales. Los ejemplos .env.example rastreados no contienen valores secretos. La búsqueda estática de patrones no garantiza detectar cualquier formato de secreto.

No se ejecutó git add ni commit. Ningún archivo está preparado en el índice.

## 9. Reproducir y límites

Con dependencias/MySQL ya instalados y variables DB_* de una cuenta local capaz de crear una base y cuenta temporales:

```sh
node backend/scripts/close-phase7.js
```

El script toma el esquema local ya migrado; si falta, no migra desarrollo. Requiere puertos 4407/5177 libres y Chrome/Edge disponible (CHROME_PATH opcional). Los scripts comerciales directos ahora rechazan la configuración de desarrollo: ejecutarlos mediante el preparador para obtener las variables y la cuenta aisladas. No copiar credenciales a comandos ni archivos versionados.

La limpieza depende de que el proceso alcance finally: tras un cierre forzoso del sistema, revisar los nombres exactos que el preparador imprimió antes de cualquier limpieza manual. No borrar bases o cuentas por patrón.

Se mantienen los límites existentes: pedidos y suscripciones académicos sin cobro, envío simulado, sin checkout invitado, sin transiciones administrativas/reembolsos, historial limitado a 100 y sin validación nueva de HTTPS productivo ni Jikan. Estos límites no impiden cerrar el alcance acordado de FASE 7. El siguiente paso es revisión humana de los cambios para un futuro commit; no se inició otra fase.
