# Recuperación y auditoría de la FASE 7 — OtakuZone

Fecha: 13 de noviembre de 2026 (America/Lima).

## Dictamen

La sesión anterior dejó implementadas las capas de tienda, carrito, pedidos y suscripciones, sus pantallas, servicios y migración comercial. La migración 006 está aplicada en MySQL. La FASE 7 permanece **sin commit** y no puede declararse completamente validada con esta auditoría: los flujos comerciales con escritura y el navegador no se ejecutaron nuevamente.

No se implementaron funcionalidades, no se cambiaron archivos existentes, no se ejecutaron migraciones ni escrituras de datos. Se creó únicamente este informe; el build generó los artefactos locales de `dist/`. No se avanzó a FASE 8.

## Estado recuperado de Git

Últimos commits:

| Commit | Descripción |
| --- | --- |
| dc564da | Fase6_autenticacion_seguridad |
| 1f17302 | Fase5_Integracion_validacion_MySQL |
| 01aece8 | Fase4_ backend_Node.js_yExpress |
| 0087261 | Fase3_Interactividad_Avanzada |
| b43c76c | Fase2_Integracion_apis |
| 496f53b | Fase1_Auditoria_Consolidacion_Frontend |

Al iniciar: 22 archivos rastreados modificados y 19 archivos sin seguimiento. Ningún archivo preparado para commit. `git diff --stat` de archivos rastreados: 101 inserciones y 30 eliminaciones; no incluye archivos nuevos. No se hicieron commits, resets ni operaciones de limpieza.

Modificaciones previas: manifest de migraciones, ejemplo de permisos SQL, package del backend, app/server, consultas y repositorio de catálogo, comprobación de esquema, servicio/validador de catálogo, auditoría de autenticación de navegador, App/router, servicios auth/otakuzone, Home/Tienda/MiCuenta y componentes de cuenta/producto/suscripción/header.

Archivos nuevos recuperados: `TIENDA_FASE_7.md`, migración 006, `backend/scripts/verify-commerce.js`, controlador/rutas/servicio/repositorio/validador y SQL de comercio, `scripts/audit-commerce-browser.mjs`, ShopNavigation, hook/context/provider de suscripción y páginas Producto/Carrito/Pedidos/Suscripciones, junto con `src/services/commerce.js`.

## Criterios de clasificación

- **COMPLETADA Y VALIDADA**: comprobada en esta sesión dentro del alcance expresamente indicado; no implica validación visual si solo hubo lectura SQL o pruebas de API con fixture.
- **IMPLEMENTADA PERO NO VALIDADA**: código y conexiones entre capas presentes, sin ejecutar nuevamente el flujo completo.
- **PARCIALMENTE IMPLEMENTADA**: falta parte del comportamiento descrito.
- **NO IMPLEMENTADA**: no se encontró implementación.

No se identificó una funcionalidad solicitada completamente ausente. La revisión estática no garantiza ausencia de errores en ejecución.

## A. Productos e inventario

| Funcionalidad | Clasificación | Evidencia y alcance |
| --- | --- | --- |
| Listado | COMPLETADA Y VALIDADA | Repositorio MySQL real devuelve 12 productos; prueba HTTP de catálogo pasa con fixture. Pantalla Tienda compila; no validada visualmente. |
| Detalles | COMPLETADA Y VALIDADA | Lectura real de un producto por ID coincide con el listado; prueba HTTP de detalle pasa con fixture. Página Producto presente. |
| Categorías | COMPLETADA Y VALIDADA | Repositorio real devuelve cinco categorías; suite HTTP valida catálogo demostrativo. Filtro de Tienda presente. |
| Disponibilidad | COMPLETADA Y VALIDADA | Los 12 productos tienen disponibilidad entera no negativa; SQL usa inventario real. No se probó consumo concurrente. |
| Persistencia MySQL | COMPLETADA Y VALIDADA | Lecturas reales y esquema existente comprobados. No se insertaron ni actualizaron productos para probar persistencia nueva. |

Archivos: `backend/src/db/catalogSql.js`, `repositories/mysqlCatalogRepository.js`, `services/catalogService.js`, `controllers/catalogController.js`, `routes/index.js`, `validators/catalog.js`; `src/services/otakuzone.js`, `src/pages/Tienda.jsx`, `Producto.jsx`, `src/components/home/ProductCard.jsx`.

Tablas: `productos`, `categorias`, `inventario`. `cantidad_disponible` es una columna generada: total menos reservado, con CHECK que protege cantidades. El catálogo filtra productos/categorías activos. La tarjeta deshabilita agregar cuando no hay disponibilidad informada o stock.

Endpoints bajo `/api/v1`: `GET /products`, `GET /products/:id`, `GET /categories`, `GET /categories/:id`. Búsqueda/categoría/orden admitidos por validadores y servicio; Tienda también filtra y ordena en memoria.

## B. Carrito

Todas las filas siguientes: **IMPLEMENTADA PERO NO VALIDADA** en su flujo funcional completo.

| Funcionalidad | Endpoint | Implementación recuperada |
| --- | --- | --- |
| Agregar | POST /cart/items | Agrega o incrementa; recibe productId y quantity. |
| Eliminar | DELETE /cart/items/:id | Elimina línea por ID de producto del carrito propio. |
| Modificar cantidades | PATCH /cart/items/:id | Establece entero 1–99; verifica línea existente. |
| Subtotal y total | GET /cart | SQL DECIMAL, envío simulado 0.00; no acepta importes del navegador. |
| Validar existencias | POST/PATCH anteriores | Valida producto/categoría activos y disponibilidad; máximo 50 productos distintos. No reserva stock. |
| Usuario autenticado | Todas las anteriores | ID derivado de sesión; bloqueo de usuario y carrito propio. Mutaciones exigen CSRF y origen permitido. |

Tablas: `usuarios`, `carritos`, `detalles_carrito`, `productos`, `categorias`, `inventario`. Se verificó mediante SHOW CREATE TABLE la restricción UNIQUE que permite un carrito activo por usuario.

Archivos comunes de comercio: `backend/src/controllers/commerceController.js`, `routes/commerce.js`, `services/commerceService.js`, `repositories/commerceRepository.js`, `db/commerceSql.js`, `validators/commerce.js`; montaje en `app.js` y comprobaciones iniciales en `server.js`.

Frontend: `src/services/commerce.js`, `src/services/auth.js`, `src/pages/Carrito.jsx`, ProductCard, ShopNavigation y rutas protegidas en AppRouter. La pantalla permite actualizar, quitar, consultar importes y confirmar.

Precaución comprobada en código: **GET /cart crea un carrito si falta**. No se llamó en esta auditoría.

## C. Pedidos

| Funcionalidad | Clasificación | Evidencia estática y límites |
| --- | --- | --- |
| Crear pedido | IMPLEMENTADA PERO NO VALIDADA | POST /orders: recibe cartId y UUID; crea cabecera, snapshots, consume inventario y convierte carrito. |
| Historial | IMPLEMENTADA PERO NO VALIDADA | GET /orders: últimos 100 pedidos propios. |
| Detalles | IMPLEMENTADA PERO NO VALIDADA | GET /orders/:id: líneas, importes e historial; filtra propietario. |
| Estados | IMPLEMENTADA PERO NO VALIDADA | Checkout registra confirmado; consulta y UI muestran estado/historial. ENUM admite pendiente/confirmado/cancelado/completado. |
| Transacciones MySQL | IMPLEMENTADA PERO NO VALIDADA | withTransaction engloba checkout y rollback; bloqueos FOR UPDATE en orden de producto. Pruebas unitarias del helper pasan con dobles, no prueban checkout real. |
| Evitar duplicados | IMPLEMENTADA PERO NO VALIDADA | Misma clave devuelve pedido anterior; conflictos devuelven 409. UNIQUE real por carrito y por usuario/clave confirmado por SHOW CREATE TABLE. Falta revalidar concurrencia. |

Tablas: `pedidos`, `detalles_pedido`, `historial_pedidos`, además de carrito/inventario/usuarios. Archivos: capas comunes anteriores y `backend/src/db/transaction.js`, migración 006; `src/pages/Pedidos.jsx`, Carrito y servicio commerce. React conserva la clave del intento en memoria durante reintentos del checkout.

No existe endpoint de transición administrativa, cancelación ni devolución: **NO IMPLEMENTADA** esa capacidad adicional. La documentación anterior la excluye de FASE 7. Si “estados” exige editar estados además de registrarlos/consultarlos, ese requisito ampliado es **PARCIALMENTE IMPLEMENTADO**; no se añadió durante esta auditoría.

## D. Suscripciones

| Funcionalidad | Clasificación | Evidencia y límite |
| --- | --- | --- |
| Plan Free | IMPLEMENTADA PERO NO VALIDADA | Plan activo real a 0.00; inicialización/asignación del usuario no ejecutada. |
| Plan Premium | IMPLEMENTADA PERO NO VALIDADA | Plan activo real a 19.90; no se activó para usuarios. |
| Activación demostrativa | IMPLEMENTADA PERO NO VALIDADA | PATCH /subscription acepta free/premium; finaliza periodo anterior y crea otro en transacción; mismo plan evita otro periodo. |
| Persistencia MySQL | IMPLEMENTADA PERO NO VALIDADA | Tablas y planes presentes; UNIQUE real limita a una suscripción activa por usuario. No se comprobó un cambio y posterior recarga. |

Endpoints: `GET /plans` público; `GET /subscription` y `PATCH /subscription` autenticados. Tablas: `suscripciones`, `historial_suscripciones`, `usuarios`. Las lecturas SQL de los dos planes sí quedaron validadas.

Archivos: capas comunes de comercio, `src/pages/Suscripciones.jsx`, `src/state/SubscriptionProvider.jsx`, `SubscriptionContext.js`, `src/hooks/useSubscription.js`, `src/components/home/SubscriptionCard.jsx`, App, Home y Header. Premium oculta promociones simuladas, muestra insignia y zona demostrativa; no cobra ni concede rol ADMIN.

Precaución comprobada: **GET /subscription inicializa FREE si falta**. Abrir la aplicación con sesión también puede invocarlo mediante SubscriptionProvider. No se ejecutó ese flujo.

## Migraciones y esquema: comprobación sin modificar

`npm --prefix backend run db:check` pasó: MySQL **8.0.46**, **16 tablas InnoDB**, **15 FK**, **19 CHECK**, **6 migraciones**. Se consultaron `schema_migrations` e information_schema y se inspeccionó SHOW CREATE TABLE de pedidos, carritos, inventario e historiales comerciales.

Se calculó SHA-256 de cada archivo con la misma normalización BOM/CRLF del migrador y se comparó con el ledger: **001–006 aplicadas y seis checksums coincidentes**. Las migraciones 001–005 no tienen diferencias respecto a Git HEAD. No hay migraciones pendientes en el manifest actual.

006 agrega carrito_origen_id, clave_solicitud, claves UNIQUE y FK en pedidos; crea historial_pedidos y completa el estado conocido de pedidos anteriores. **No repetir 006 ni ejecutar db:migrate como parte de la recuperación**: su ALTER no es repetible directamente y MySQL DDL no tiene rollback ordinario.

`schemaCheck.js` valida existencia, recuentos y tipos; el chequeo adicional de esta auditoría verificó checksums y restricciones comerciales concretas. No se inspeccionaron datos personales ni detalles de pedidos reales.

## Pruebas y documentación

| Comprobación ejecutada | Resultado actual |
| --- | --- |
| npm test | 18/18 pasan. |
| npm --prefix backend test | 18/18 pasan. |
| npm run lint | Pasa, salida sin diagnósticos. No existe script lint separado del backend. |
| npm run build | Pasa, Vite 8.3.8; genera dist/. Backend no declara build: ejecuta JavaScript directamente. |
| db:check | Pasa con MySQL real, valores anteriores. |
| Lecturas adicionales SQL/repositorio | Checksums, restricciones, 12 productos, cinco categorías, detalle coincidente, disponibilidad y dos planes comprobados. |

Primer intento de ambas suites bloqueado por `spawn EPERM` del sandbox, antes de ejecutar las pruebas. Se repitieron fuera del sandbox con autorización de la herramienta y ambas pasaron. El fallo inicial no demuestra un defecto de aplicación.

Cobertura existente: `tests/interactivity.test.mjs`, `services.test.mjs`, `storeContract.test.mjs`; `backend/tests/auth-unit.test.js`, `database-unit.test.js`, `http.test.js`. Cubren regresión de servicios, formularios/favoritos, autenticación unitaria, catálogo HTTP con fixture y helper transaccional con dobles. **No equivalen a validar comercio MySQL ni sus pantallas.**

Se inspeccionaron los scripts comerciales: `backend/scripts/verify-commerce.js` contiene aserciones de carrito, totales, propiedad, CSRF, rollback tras escrituras, snapshots, idempotencia, carrera por última unidad y planes. `scripts/audit-commerce-browser.mjs` contiene recorrido de navegador, persistencia SQL, cambios de plan y comprobaciones de tamaños de pantalla. Ambos crean y eliminan registros: **no ejecutados**.

Tampoco se ejecutaron db:verify, db:verify:http, auth:verify ni audit-auth-browser, por sus escrituras; ni auth:secret, instalaciones o aprovisionamiento. `check:http` presupone catálogo demo y no se utilizó como validación de MySQL. `healthController.js` solo devuelve salud genérica: un 200 no acredita esquema ni comercio.

Documentación revisada: `TIENDA_FASE_7.md`, manifiesto/SQL de migraciones y scripts/configuraciones asociados; inventariados README general/backend/base, MODELO y documentos de fases previas. TIENDA_FASE_7 afirma resultados anteriores (52 solicitudes comerciales, 35 de autenticación y Chrome, entre otros). Son **antecedentes documentados**, no resultados reproducidos aquí ni prueba de finalización actual. Su receta de migración no debe ejecutarse ciegamente: ya están aplicadas las seis versiones.

## Tareas pendientes precisas para cerrar FASE 7

1. Preservar los 41 archivos de trabajo recuperados, incluidos los 19 sin seguimiento, antes de cualquier limpieza o reinstalación; revisar y preparar después un commit de FASE 7. Esta auditoría no hizo commit.
2. Preparar un entorno MySQL de pruebas separado y compatible con los scripts existentes. Revisar primero sus permisos, guardas, referencias al nombre de base y limpieza; no apuntarlos a datos reales.
3. Ejecutar allí commerce:verify y verificar sus aserciones reales: agregar/quitar/cantidades/totales, stock, identidad/CSRF, pedido/historial/detalle, rollback intermedio, snapshot, reintentos duplicados y dos compradores concurrentes.
4. Revalidar en ese entorno Free inicial, Premium, repetición del plan y regreso a Free, unicidad del periodo activo y persistencia tras recargar/cambiar sesión.
5. Ejecutar auditoría de navegador aislada para login/redirecciones, filtros/detalle, carrito/pedido/historial, errores/reintentos, insignia/promociones y pantallas adaptables. No usar una sesión real para esta comprobación.
6. Registrar resultados nuevos con su alcance y corregir únicamente fallos reproducidos en una tarea posterior. Actualizar el estado de las filas pendientes de validación y contrastar con TIENDA_FASE_7.

No hay evidencia actual que justifique rehacer la FASE 7. Queda principalmente **validación comercial aislada y consolidación en Git**. Pagos/envíos reales, checkout invitado, administración de estados y paginación más allá de 100 registros están fuera del alcance documentado; no son funcionalidades a incorporar durante esta recuperación.
