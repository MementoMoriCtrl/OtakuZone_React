# OtakuZone — FASE 8: panel administrativo

Fecha de cierre: 14 de noviembre de 2026, America/Lima.

## Resultado

Panel privado implementado y validado en `/admin`, con seis módulos Neo Tokyo y autorización ADMIN en backend y frontend. Reutiliza las cookies, sesiones, CSRF y roles de la FASE 6. No hay otro login, roles nuevos ni endpoints para autoasignarse privilegios. No se avanzó a FASE 9 ni se hizo commit.

Base del trabajo: commit `3a96342` (FASE 7). Las migraciones 001–006 permanecen intactas. La única ampliación de esquema es **007_admin_inventory.sql**, probada primero en una base aislada y aplicada después en desarrollo sin cambiar filas anteriores. El ledger registra la versión nueva; no se ejecutó SQL de migraciones anteriores.

## Funcionalidades

| Módulo | Implementación y validación |
| --- | --- |
| Dashboard | Usuarios totales, productos totales, productos activos con disponibilidad ≤5, pedidos totales, pedidos pendientes y periodos de suscripción activos. Consultas SQL reales; cada indicador contrastado con SQL independiente durante la prueba. Incluye Free y Premium entre las suscripciones activas. |
| Productos | Alta con inventario inicial, consulta paginada con todos los datos de edición, actualización, desactivación y reactivación mediante edición. Validación de nombre, categoría activa, precio de dos decimales, descripción, imagen del catálogo e inventario. No elimina pedidos ni referencias históricas. |
| Categorías | Alta, consulta, edición y activación/desactivación. No hay borrado físico; desactivar oculta también los productos relacionados del catálogo público sin romper sus FK. |
| Inventario | Consulta total/reservado/disponible, ajuste con motivo obligatorio, detección de edición obsoleta y rechazo si queda por debajo de reservas. Movimiento con responsable, delta, cantidades anterior/nueva, pedido opcional y fecha. |
| Pedidos | Listado global, datos del cliente (nombre, email, ID), detalles, total SQL e historial. Cambios de estado restringidos, protección frente a estado obsoleto y cancelación transaccional con reposición única. |
| Usuarios | Listado paginado con nombre, email, estado, fecha y rol ADMIN/CLIENTE. Sin contraseñas ni hashes. Roles de solo lectura; no se expone ninguna operación de cambio de rol. |
| Interfaz | Navegación entre módulos, formularios con etiquetas, carga/error/vacío/éxito, paginación y tarjetas adaptables. Se conserva el acceso a Administración desde la cuenta ADMIN. |

Listas: `?page=1`, páginas de 50 registros con `hasMore`; el servidor limita y valida el número de página. Los identificadores son estables: crear requiere un slug único; editar no cambia el identificador. Las imágenes reutilizan los cuatro recursos ya existentes, sin incorporar subida de archivos.

## Arquitectura y permisos

- Backend: `routes/admin.js` → `controllers/adminController.js` → `services/adminService.js` → `repositories/adminRepository.js`, con validadores en `validators/admin.js`.
- Router montado en `app.js`. Todo el prefijo nuevo `/admin` exige `authenticate` y `authorize('ADMIN')`, incluso para rutas administrativas inexistentes. Sin sesión devuelve 401; CLIENTE recibe 403 antes de ejecutar la operación o validar su cuerpo.
- POST/PUT/PATCH/DELETE exigen origen permitido, JSON y CSRF ligado a la sesión. Los cuerpos Zod son estrictos; no admiten role, precio encubierto ni campos adicionales.
- El endpoint anterior `/admin/overview` conserva su protección y comportamiento de FASE 6 por compatibilidad. El dashboard nuevo usa `/admin/dashboard`.
- Frontend: `/admin` y `/admin/:section` se encuentran dentro de `RequireAuth role="ADMIN"`. Backend no confía en esa protección visual.
- React: `Admin.jsx`, componentes separados en `src/components/admin/`, `useAdminList.js` y `services/admin.js`. Se reutilizan AuthProvider, accountRequest, ResourceState, ActionMessage y useAsyncAction.
- No existe PATCH de usuarios/roles. La actualización de perfil anterior también rechaza role. El procedimiento de mantenimiento existente `backend/scripts/promote-admin.js` sigue siendo exclusivo del operador con acceso autorizado a MySQL; no se ejecutó sobre usuarios reales durante esta fase.

## API

Prefijo `/api/v1`. **Todos requieren ADMIN**; las escrituras, además, CSRF y origen permitido.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | /admin/dashboard | Seis indicadores reales |
| GET | /admin/products?page=1 | Productos, estado, descripción e inventario |
| POST | /admin/products | Crear producto e inventario auditado |
| PUT | /admin/products/:id | Editar datos y estado del producto |
| DELETE | /admin/products/:id | Desactivar, sin borrado físico; cuerpo `{}` |
| GET | /admin/categories?page=1 | Categorías y cantidad de productos relacionados |
| POST | /admin/categories | Crear categoría |
| PUT | /admin/categories/:id | Cambiar nombre y estado |
| GET | /admin/inventory?page=1 | Existencias y reservas |
| PATCH | /admin/inventory/:id | Ajuste de cantidad con control de edición obsoleta |
| GET | /admin/movements?page=1 | Auditoría de inventario, más reciente primero |
| GET | /admin/orders?page=1 | Pedidos globales e información del cliente |
| GET | /admin/orders/:id | Detalle, historial y transiciones ofrecidas |
| PATCH | /admin/orders/:id/status | Transición de estado válida |
| GET | /admin/users?page=1 | Usuarios sin secretos; sin mutaciones de rol |

Ejemplo de producto nuevo:

```json
{
  "id": "manga-ejemplo",
  "name": "Manga de ejemplo",
  "categoryId": "mangas",
  "price": 29.90,
  "description": "Producto demostrativo",
  "imageKey": "manga",
  "imageAlt": "Ilustración del manga",
  "active": true,
  "quantity": 10
}
```

PUT usa los mismos campos, excepto id y quantity; para cambiar existencias se usa Inventario. Categoría nueva: `{ "id": "coleccion", "name": "Colección", "active": true }`; PUT omite id. Desactivar categoría se realiza con active=false.

Ajuste de existencias:

```json
{ "quantity": 12, "expectedQuantity": 10, "reason": "Reposición de inventario" }
```

Cambio de pedido:

```json
{ "status": "cancelado", "expectedStatus": "confirmado" }
```

Validación: 400; sin sesión: 401; CLIENTE/CSRF: 403; registro inexistente: 404; duplicado, relación inválida, transición inválida o edición obsoleta: 409. No se devuelve SQL, trazas, cookies ni hashes.

## Pedidos e integridad

| Estado actual | Destinos permitidos |
| --- | --- |
| pendiente | cancelado |
| confirmado | completado, cancelado |
| cancelado | Ninguno |
| completado | Ninguno |

El checkout existente ya crea pedidos confirmados y consume stock. Un pedido pendiente histórico no se confirma desde este panel: no se presume que haya consumido inventario. Cancelar un pendiente no restituye stock. Los pedidos confirmados anteriores sin carrito de origen verificable no se cancelan automáticamente: devuelven 409 y requieren conciliación del operador. Pueden completarse.

Las transiciones bloquean la cabecera con FOR UPDATE y comparan expectedStatus. La cancelación confirmada bloquea inventarios por ID estable, restituye cada cantidad, registra los movimientos, actualiza el estado y agrega historial en una transacción. Repetir o competir con otra transición no restituye dos veces: el estado anterior ya no coincide. No se reabren estados finales ni se admite un estado arbitrario enviado por React.

Se preservan snapshots de pedidos y las relaciones con productos/categorías. Los importes del detalle administrativo se calculan en MySQL con DECIMAL, igual que en el flujo comercial.

## Migración y movimientos

Nueva tabla `movimientos_inventario`: producto_id, actor_id, pedido_id opcional, delta, cantidad_anterior, cantidad_nueva, motivo y creado_en. FK RESTRICT a productos/usuarios/pedidos; CHECK de cantidades y diferencia; índice por producto/id. La API solo consulta o agrega movimientos, no los modifica ni elimina.

Registra desde esta fase: alta administrativa, ajuste administrativo, consumo del checkout y restitución por cancelación. **No se fabricó un historial de operaciones anteriores a 007**. Si falla el registro del movimiento, se revierte también la operación de inventario.

`backend/scripts/apply-admin-schema.js` verifica todos los checksums del manifest, las seis versiones previas y la ausencia de un DDL parcial. Usa el bloqueo de migraciones existente y ejecuta únicamente 007, luego registra su checksum. Si ya está aplicada y coincide, la omite. MySQL DDL no tiene rollback ordinario: si se interrumpe entre CREATE TABLE y ledger, el script se detiene para inspección manual.

Estado local comprobado: **MySQL 8.0.46, 17 tablas InnoDB, 18 FK, 20 CHECK y siete migraciones**. Las filas de desarrollo existentes no se actualizaron ni eliminaron. La tabla nueva seguía con cero movimientos al cerrar las pruebas, que se hicieron fuera de desarrollo.

El ejemplo de permisos mínimos en `backend/database/provisioning/application-user.example.sql` se amplió para las tablas administrativas, sin conceder UPDATE de rol_id ni escritura a roles. Es un ejemplo manual para el operador; no se ejecutaron esos GRANT sobre cuentas existentes.

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| HTTP administrativo con MySQL real aislado | **72 solicitudes aprobadas** por ejecución final; incluye la matriz de autorización de todas las rutas nuevas. |
| Regresión comercial con MySQL aislado | **62 solicitudes aprobadas**, incluidos idempotencia, última unidad concurrente, snapshots y rollback tras escrituras. |
| `npm test` | **18/18 aprobadas**. |
| `npm --prefix backend test` | **18/18 aprobadas**. |
| `npm run lint` | Aprobado, sin diagnósticos finales. |
| `npm run build` | Aprobado, Vite 8.3.8. |
| `git diff --check` | Aprobado; solo avisos Git de normalización LF/CRLF. |
| `npm --prefix backend run db:check` | Aprobado en desarrollo tras aplicar solo 007; siete versiones. |
| Chrome comercial | Aprobado: regresión de carrito/compra/planes y responsive. |
| Chrome administrativo final | Aprobado: ADMIN, rechazo CLIENTE, CRUD/desactivación, inventario, pedido/cancelación, usuarios y responsive. |

No se suman las solicitudes de repeticiones ni se inventa un recuento HTTP del navegador. Las suites de 18 pruebas son regresión general; la cobertura administrativa de integración está en verify-admin.js y en Chrome.

Casos administrativos comprobados:

- Cada endpoint nuevo rechaza sin sesión (401) y con CLIENTE (403), incluyendo escrituras y detalle de pedido.
- ADMIN crea categoría/producto, consulta, actualiza y desactiva; el catálogo público deja de devolver un producto desactivado o de categoría inactiva.
- Duplicado: 409. Nombre vacío, precio negativo/con fracciones de céntimo, stock negativo y campo role inyectado: 400. Categoría inexistente: 409.
- Inventario: ajuste correcto y movimiento persistido; expectedQuantity obsoleto: 409; cantidad menor a reservas: 409.
- Una FK de actor inexistente hace fallar el movimiento dentro de un ajuste real: se comprueba que también revierte la cantidad de inventario.
- Pedido real creado por CLIENTE: ADMIN ve su cliente/detalles, cancela y restituye stock. Repetir la cancelación: 409 sin segundo incremento. Completar y luego cancelar: 409. Cancelación histórica no conciliable: 409.
- Usuarios: respuesta sin password/passwordHash/password_hash; intento de endpoint de cambio de rol: 404. Perfil de CLIENTE con role: 400. CSRF incorrecto en baja: 403.
- Los seis indicadores coinciden con consultas SQL independientes. Movimientos incluyen alta, ajuste, compra y devolución; el ajuste fallido no deja movimiento.

## Navegador y evidencias

Chrome headless real mediante CDP, perfil temporal independiente y servidores en 4407/5177 conectados a MySQL aislado.

El guion registra una cuenta CLIENTE, comprueba `/admin` denegado y eleva exclusivamente esa cuenta técnica mediante la conexión SQL de pruebas. Después recarga la sesión de FASE 6 y valida dashboard, alta de categoría, alta/edición/desactivación de producto, ajuste con motivo, consulta SQL de existencias, compra, consulta administrativa de cliente y cancelación con restitución SQL. Usuarios no ofrece un formulario de cambio de rol.

Se comprobaron seis módulos a **320, 390, 768 y 1440 px**, sin desbordamiento horizontal. La ejecución final no registró excepciones ni console.error de aplicación.

- [Dashboard ADMIN a 1440 px](docs/evidencias/fase8/admin-dashboard.png).
- [Productos ADMIN a 390 px](docs/evidencias/fase8/admin-productos-movil.png).

Las cifras de las capturas proceden de la base técnica de esa ejecución, no representan datos de usuarios reales de desarrollo.

## Aislamiento y limpieza

Se extendió el preparador de FASE 7: `--admin` añade la validación administrativa; `--admin-only` permite repetir solo esa parte. Crea una base única y una cuenta de pruebas con permisos CRUD **solo sobre esa base**, verifica DATABASE/CURRENT_USER/GRANT y comprueba que leer usuarios de desarrollo está denegado antes de escribir fixtures. Las credenciales y JWT técnicos se generan en memoria y se pasan por entorno; no se imprimen ni guardan en archivos.

Se copia esquema y catálogo, nunca usuarios, sesiones, pedidos ni historiales personales. Antes de aplicar 007 en desarrollo, el preparador la aplicó solo en la base vacía de pruebas. Tras aplicarla en desarrollo, la ejecución final copió las siete versiones y verificó checksums.

Última ejecución ADMIN aprobada: `otakuzone_f7_test_cb312a06dd7d` (el prefijo F7 identifica el preparador reutilizado). Se eliminaron la base y cuenta exactas creadas por esa invocación y se detuvieron los servidores. Consulta posterior: **cero bases temporales y cero cuentas temporales**. Nunca se limpiaron bases/cuentas por patrón. Los perfiles de Chrome están fuera del repositorio y no se incluyen en Git.

## Incidencias resueltas y límites

1. Las fixtures iniciales usaban el código SQL admin en vez del existente administrador: se corrigieron los guiones, conservando los roles originales y su representación pública ADMIN/CLIENTE.
2. La cuenta restringida de pruebas produjo una variante de error FK de MySQL: se amplió su traducción a 409; el rollback real quedó comprobado.
3. Lint detectó un hook exportado con componentes: se separó `useAdminList.js`; lint final sin advertencias.
4. El sandbox bloqueó procesos de pruebas/Chrome. Se repitieron fuera del sandbox mediante aprobación nativa; las ejecuciones finales aprobaron.
5. Una repetición dejó en blanco la navegación inicial; otra intentó rellenar antes de cargar el registro. Esas ejecuciones se marcaron fallidas y limpiaron su base. Se amplió la espera de navegación a 30 s y se esperó explícitamente el formulario. La repetición ADMIN final aprobó, incluida la desactivación UI añadida.

Límites deliberados: sin cambio de roles por HTTP, borrado físico, carga de imágenes, confirmación automática de pedidos históricos, reapertura de estados finales, pagos, reembolsos monetarios ni despliegue productivo. No es una prueba de carga prolongada ni una auditoría completa de accesibilidad. No se validaron APIs externas nuevas.

## Uso y reproducción

Backend y frontend conservan sus comandos habituales:

```sh
npm --prefix backend run dev
npm run dev
```

Entrar con una cuenta ADMIN existente y abrir `/admin`. No se crearon administradores reales durante esta tarea. Si una instalación nueva necesita un operador inicial, usar el procedimiento autorizado de FASE 6; la API no eleva roles.

En otra instalación con las seis migraciones previas aplicadas, antes de iniciar este backend:

```sh
npm --prefix backend run admin:schema
npm --prefix backend run db:check
```

Aquí 007 ya está aplicada. No editar los archivos SQL aplicados ni sus checksums. Usar credenciales de mantenimiento solo para el esquema y las apropiadas de runtime para la aplicación.

Prueba integral aislada (requiere MySQL local, permisos de crear base/cuenta temporal, Chrome/Edge y puertos 4407/5177 libres):

```sh
npm --prefix backend run admin:verify
```

Repetición exclusivamente administrativa:

```sh
node backend/scripts/close-phase7.js --admin --admin-only
```

Ante un cierre forzoso, inspeccionar los nombres exactos impresos antes de limpiar manualmente. No ejecutar verify-admin.js con una cuenta de desarrollo: su guarda lo rechaza.

## Archivos y Git

Nuevos: migración 007; scripts apply-admin-schema/verify-admin; capas backend admin; servicio/hook React admin; seis componentes administrativos; auditoría de navegador; este documento y dos capturas.

Actualizados: manifest y permisos de ejemplo; package del backend; app/server/schemaCheck; repositorio comercial (movimiento de compra); Admin y AppRouter; preparador aislado y limpiezas de pruebas comerciales; helper de navegador (espera de navegación).

No se instalaron dependencias, no se modificaron migraciones anteriores ni se asignaron roles a cuentas reales. Los secretos locales y dist están ignorados. No se ejecutó git add, commit ni publicación. La FASE 8 queda implementada y validada en el entorno local descrito.
