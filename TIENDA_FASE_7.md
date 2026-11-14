# OtakuZone — Fase 7: tienda, carrito, pedidos y suscripciones

## Arquitectura e inspección

Se revisaron las cinco migraciones previas, usuarios/roles, autenticación con cookies y CSRF, pool/transacciones, catálogo MySQL y fixture JSON, servicios React, ProductCard, SubscriptionCard y rutas existentes. No se añaden dependencias ni un segundo login. No se mueve el frontend, no se modifican las migraciones 001–005 y no se avanza a Fase 8.

Se reutilizan productos, categorías, inventario, carritos/detalles, pedidos/detalles y planes/historial. La migración **006_commerce.sql** incorpora:

- `pedidos.carrito_origen_id`: FK y UNIQUE; un carrito solo puede originar un pedido.
- `pedidos.clave_solicitud`: UUID, UNIQUE junto con usuario; permite repetir una solicitud sin volver a descontar stock.
- `historial_pedidos`: eventos de estado, FK protegida e índice por pedido/fecha. Los pedidos anteriores reciben solamente su estado conocido, sin inventar transiciones.

Los campos nuevos permiten NULL en pedidos históricos. No se duplican usuarios, roles, precios actuales ni suscripciones activas. El total del pedido sigue derivándose de sus detalles DECIMAL y envío. El esquema comprobado es **MySQL 8.0.46, 16 tablas InnoDB, 15 FK, 19 CHECK y seis migraciones**.

SQL estático en `backend/src/db/commerceSql.js`, consultas y transacciones en `repositories/commerceRepository.js`, servicio, controlador, validadores y rutas separados. Los servicios frontend usan la misma cookie y CSRF de `services/auth.js`; no guardan tokens sensibles en localStorage. No hay endpoints nuevos de administración de productos ni cambios de privilegios.

## Iniciar y reproducir

Desde la raíz, con Node/npm y MySQL ya configurados:

```sh
npm ci
npm --prefix backend ci
npm --prefix backend run auth:secret
npm --prefix backend run db:migrate
npm --prefix backend run db:check
npm --prefix backend run dev
```

Configurar solo localmente `backend/.env`: acceso DB existente, `DB_NAME=otakuzone_db`, `AUTH_ENABLED=true`, `CATALOG_SOURCE=mysql`. No sobrescribir el archivo ni publicar sus valores. El script de secreto conserva el existente. `.env` está ignorado por Git; `.env.example` no contiene secretos. Permisos mínimos ampliados como ejemplo manual en `backend/database/provisioning/application-user.example.sql`; las migraciones/pruebas requieren mantenimiento, no se conceden esos permisos desde HTTP.

En otra terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

- Frontend: http://127.0.0.1:5173
- API y autenticación: http://127.0.0.1:4000/api/v1
- `VITE_OTAKUZONE_API_URL` y `VITE_AUTH_API_URL`, si existen, deben apuntar a esa API para este flujo.
- JSON Server permanece opcional con `npm run api` en http://127.0.0.1:3001. Es un catálogo simulado alternativo, no un backend de compra. Sin disponibilidad MySQL en su DTO no se habilita agregar desde ese proveedor; no se presupone stock.
- Jikan se conserva separado, sin cambios ni afirmación de disponibilidad externa nueva.

Después de cambiar el esquema/código, reiniciar Express; Vite debe reiniciarse si cambian variables. No ejecutar varios servidores en el mismo puerto. Las migraciones ya aplicadas se omiten por checksum. MySQL DDL no tiene rollback: ante un fallo parcial de ALTER, inspeccionar el esquema y reparar con mantenimiento antes de repetir; no editar una migración ya aplicada ni borrar tablas automáticamente.

## API

Se mantienen `/health`, `/products`, `/products/:id`, `/categories`, `/categories/:id`, `/promotions` y toda la API de autenticación. Los productos MySQL incluyen `available` como entero. Catálogo admite `q`, `categoryId` y `order=default|price-asc|price-desc|name`; parámetros desconocidos/repetidos se rechazan. La tienda filtra y ordena los registros cargados sin nuevas peticiones por pulsación; detalle vuelve a consultar la API y el catálogo de productos no conserva caché de datos terminados.

| Método / ruta bajo /api/v1 | Acceso y resultado |
| --- | --- |
| GET /cart | Autenticado; carrito propio activo, líneas y totales |
| POST /cart/items | Autenticado + CSRF; `{productId,quantity}` agrega/incrementa |
| PATCH /cart/items/:id | Autenticado + CSRF; `{quantity}` establece cantidad |
| DELETE /cart/items/:id | Autenticado + CSRF; cuerpo `{}`; elimina línea propia |
| POST /orders | Autenticado + CSRF; `{cartId,idempotencyKey}`; 201 nuevo / 200 repetido |
| GET /orders | Autenticado; hasta 100 pedidos propios recientes |
| GET /orders/:id | Autenticado; detalle, snapshots, total e historial propios |
| GET /plans | Público; planes demostrativos desde MySQL |
| GET /subscription | Autenticado; plan actual e historial; inicializa FREE si no existe |
| PATCH /subscription | Autenticado + CSRF; `{code:"free"}` o `{code:"premium"}` |

Ejemplos de cuerpos (los valores de identificadores se obtienen de la API):

```json
{"productId":"figura-mensajera","quantity":2}
```

```json
{"cartId":"123","idempotencyKey":"64b2edcb-2055-4ecb-a050-7c5593f3dd39"}
```

No reutilizar ese UUID de ejemplo para compras distintas: generar uno por intento lógico. El frontend conserva la misma clave en memoria al reintentar el mismo checkout. Tras perder una respuesta, el historial permite consultar el pedido confirmado; el UNIQUE por carrito impide duplicarlo incluso con otra clave. Una clave usada para otro carrito devuelve 409.

Las escrituras requieren `Origin: http://127.0.0.1:5173`, `Content-Type: application/json`, cookie de sesión y `X-OtakuZone-CSRF` de la sesión actual. El navegador usa `credentials: include`. CORS incorpora DELETE y conserva orígenes exactos, credenciales y controles CSRF; no se exponen cookies o JWT en JSON. No copiar valores reales de sesión a ejemplos/logs.

Respuesta parcial de carrito: `{"success":true,"data":{"id":"123","currency":"PEN","items":[],"subtotal":"0.00","shipping":"0.00","total":"0.00","demonstrative":true}}`. Los importes de operaciones comerciales son cadenas DECIMAL de dos decimales; React solo les da formato para presentar soles. El total nunca se calcula usando importes del navegador. Errores: 400 validación, 401 sesión, 403 CSRF/permisos, 404 detalle inexistente o ajeno, 409 stock/carrito/conflicto, 429 límite y 500 genérico ante fallo interno con rollback. No se acepta usuario, precio, envío ni total en los cuerpos comerciales.

## Consistencia comercial

El carrito es exclusivamente de usuario autenticado; no hay carrito invitado ni sincronización implícita. GET crea el carrito propio si falta. Máximo 50 productos distintos y cantidades enteras 1–99. Agregar/actualizar comprueba producto/categoría activos e inventario disponible, pero **no reserva** unidades. Quitar permite retirar productos que hayan quedado inactivos.

Las escrituras comerciales bloquean la fila del usuario para serializar su carrito y sus cambios de plan. Checkout bloquea productos/inventarios en orden estable por ID, vuelve a validar disponibilidad, inserta cabecera y snapshots con precios SQL actuales, descuenta inventario con condición de stock, registra estado confirmado y convierte el carrito en una misma transacción. El stock reservado existente se respeta. Cualquier fallo revierte todo. Los bloqueos de compradores concurrentes impiden vender más que la cantidad disponible; MySQL puede abortar una transacción por deadlock y el usuario puede reintentar con la misma clave. No hay reintento ciego tras un commit ambiguo.

Los importes usan DECIMAL y SUM de MySQL; envío simulado cero. Un cambio de precio del catálogo se refleja al confirmar; el pedido histórico conserva nombre/precio unitario aunque cambie el producto. Una actualización de precio no exige aceptar un importe anterior enviado por el cliente. Las lecturas de pedidos usan transacciones y UTC para una vista consistente de detalle/historial. Ninguna ruta recibe `usuario_id`: siempre se deriva de la sesión y las consultas filtran por propietario; un pedido ajeno responde 404.

Esta fase confirma pedidos académicos y registra su estado/historial. Conserva los estados existentes pendiente/confirmado/cancelado/completado; no permite a clientes modificar estados ni proporciona todavía operaciones administrativas de transición, cancelación o devolución. El mantenimiento administrativo corresponde a la fase posterior.

## Planes y componentes

Planes existentes `free` y `premium`, sin nuevas filas duplicadas ni pagos. El primer acceso autenticado a la suscripción registra FREE. Cambiar de plan finaliza el periodo activo y crea otro con el precio demostrativo del catálogo, dentro de una transacción. Repetir el plan actual no crea historial adicional. La restricción existente permite solo un periodo activo por usuario. No hay renovación/cobro automático ni vencimiento comercial.

FREE mantiene catálogo, favoritos y espacios promocionales simulados. PREMIUM conserva esos accesos, oculta los espacios promocionales de Home, muestra insignia y habilita una zona exclusiva de demostración en suscripciones. No altera precios, stock o privilegios. La insignia y preferencias se cargan de MySQL al recargar; no se confunden con el rol ADMIN.

Se reutilizan **ProductCard** en Home, tienda y detalle; **SubscriptionCard** en Home y suscripciones; **ResourceState**, **ActionMessage** y Hooks existentes. Se añade **ShopNavigation** para las pantallas de tienda y perfil, y **SubscriptionProvider** para el estado del plan sin duplicar login. Rutas nuevas `/tienda/:id`, `/carrito`, `/pedidos`, `/pedidos/:id`, `/suscripciones`; las originales permanecen. Carrito/pedidos requieren sesión. Los favoritos siguen locales al navegador, tal como se documentó en Fase 6.

## Resultados reales

| Validación ejecutada | Resultado |
| --- | --- |
| db:migrate y db:check | PASS: cinco versiones anteriores omitidas por checksum; 006 aplicada; MySQL 8.0.46, 16 tablas, 15 FK, 19 CHECK, seis versiones |
| npm --prefix backend run commerce:verify | PASS: **52 solicitudes HTTP reales** con MySQL; catálogo, búsqueda/categoría/orden, cantidades, totales, stock, carrito propio, pedidos/historial y suscripciones |
| Mismo script | PASS: rechazo de importes manipulados y cantidades inválidas, CSRF, usuario ajeno 404, cliente sin permisos ADMIN 403 |
| Mismo script | PASS: dos checkouts concurrentes idénticos devuelven 201/200 y el mismo pedido; segunda clave sobre carrito convertido 409; solo un comprador obtiene la última unidad (201/409) |
| Mismo script | PASS: precios actuales calculados en SQL y snapshots conservados tras modificar catálogo; rollback tras stock insuficiente y tras escrituras reales |
| npm --prefix backend run auth:verify | PASS: 35 solicitudes reales de regresión de autenticación/roles/CSRF/cookies/logout |
| npm --prefix backend run db:verify | PASS: persistencia, consultas, integridad, commit/rollback y eliminación controlada del esquema existente |
| npm --prefix backend run check:http | PASS: 21 comprobaciones HTTP del catálogo, validación, CORS y cabeceras |
| npm --prefix backend test / npm test | PASS: 18 backend y 18 frontend; incluyen fixtures/dobles unitarios explícitos |
| node scripts/audit-commerce-browser.mjs | PASS en Chrome real: redirección/login existente, filtros/orden, vacío/error/reintento, detalle, carrito persistido, pedido y stock comprobados también por SQL |
| Mismo navegador | PASS: historial, Free/Premium persistentes, insignia/promociones, seis pantallas a 320/390/768/1440 px y sin excepciones/console.error de aplicación |

La prueba de fallo intermedio usa una **inyección deliberada de error de aplicación**, solo en la instancia HTTP aislada de prueba, después de insertar pedido/detalles y descontar inventario mediante conexiones SQL reales. Comprueba que MySQL revierte esas escrituras. No simula una conexión exitosa ni provoca cambios de tablas compartidas para inducir el fallo. El 500 y el mensaje interno genérico de esa prueba son esperados.

Los scripts crean usuarios/productos UUID técnicos y limpian exclusivamente sus registros e historial, sin alterar el catálogo anterior. Un primer guion de Chrome falló por esperar la ruta privada antes de aceptar su redirección; se corrigió. Se reforzó la limpieza con bloqueo/transacción y se retiraron los registros exactos de aquella ejecución. El chequeo de catálogo, inicialmente interferido por un producto técnico concurrente (13 en vez de 12), se repitió sin esa interferencia y pasó. No ejecutar auditorías que exigen cantidades exactas al mismo tiempo que pruebas que insertan productos.

Las pruebas de escritura están prohibidas en producción. Si se termina forzosamente una prueba, revisar sus UUID exactos antes de limpiar; no borrar cuentas por patrón. Los AUTO_INCREMENT pueden avanzar aunque una transacción se revierta.

## Pendientes y alcance

No hay pagos, tarjetas, envíos reales, checkout de invitado, administración comercial, cancelaciones/reembolsos ni Fase 8. Hasta 100 pedidos y 100 periodos de suscripción se muestran por historial; paginación completa queda pendiente si el volumen crece. No se despliega HTTPS de producción aquí: se mantienen los requisitos de cookie Secure y secretos/CORS ya documentados en Fase 6. Jikan conserva su limitación externa anterior. El stock y los planes son académicos, con persistencia MySQL real.
