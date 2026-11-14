# OtakuZone — Estado de Fase 5

Fecha: 13/11/2026. **Fase 5 validada contra MySQL real 8.0.46.** La base otakuzone_db está creada, las cuatro migraciones están aplicadas y Express está utilizando MySQL como fuente del catálogo.

## Auditoría y modelo

Se inspeccionaron los endpoints actuales, servicios, DTO, repositorio demostrativo, validadores, configuración, pruebas y `mock/db.json` antes de escribir tablas. Se mantiene el frontend y todo el API existente de Express.

El [modelo ER](backend/database/MODELO.md) contempla roles, usuarios, categorías, productos, inventario, favoritos, carritos, detalles de carrito, pedidos, detalles de pedido, suscripciones e historial de suscripciones. Se conserva promociones porque el Home ya la necesita. Una tabla técnica registra versiones de migración: **13 tablas de negocio y una de metadata**.

Jikan no se copia íntegramente: favoritos solo guarda usuario y jikan_anime_id. Las obras demo del navegador no se convierten en IDs reales. Pedidos y suscripciones guardan únicamente snapshots monetarios/históricos necesarios, no copias completas de entidades externas. Los usuarios y tablas transaccionales no tienen cuentas predeterminadas en las semillas.

## Implementación

- SQL versionado en `backend/database/migrations/`, con base otakuzone_db, InnoDB, utf8mb4, PK/FK, UNIQUE/CHECK, índices y datos demostrativos.
- DECIMAL para precios, envío, precio contratado y subtotales; cantidades físicas enteras. Subtotal de pedido y stock disponible son calculados. No se mantiene un total de pedido independiente de sus líneas.
- Unicidad de carrito y suscripción activa por usuario con índices sobre columnas generadas. La FK de carrito usa RESTRICT para respetar las restricciones de MySQL sobre columnas base de generadas almacenadas. Su DDL y la unicidad se comprobaron ahora ejecutando SQL en el servidor real.
- Migrador con bloqueo, comprobación de versión, checksums SHA-256 normalizados a LF, protección frente a esquemas existentes no administrados y semillas transaccionales. Sin DROP ni desactivación de FK. DDL puede quedar aplicado parcialmente por los commits implícitos de MySQL; se documenta inspección/reanudación.
- mysql2 **3.24.6** instalado exclusivamente en backend, con pool acotado, timeouts, cierre, DECIMAL como string y múltiples sentencias deshabilitadas en runtime.
- Consultas estáticas separadas, execute con parámetros y repositorio MySQL con el mismo contrato del catálogo. La conversión numérica de precio se limita al DTO requerido por el frontend.
- Operación interna de producto+inventario que usa una misma conexión y begin/commit/rollback. Fallos de rollback destruyen la conexión. Sin endpoint público de escritura ni autenticación improvisada.
- Selector explícito `CATALOG_SOURCE=demo|mysql`. No hay fallback automático: el modo MySQL debe conectar antes de iniciar el servidor. El modo demo conserva el frontend mientras se prepara el acceso real y nunca se presenta como conexión MySQL.

Guía de configuración, permisos y reproducción: [backend/database/README.md](backend/database/README.md).

## Acceso local y protección de secretos

Se estableció conexión autenticada con el servicio local mediante mysql2 usando backend/.env. SELECT VERSION() devolvió **8.0.46**. Las consultas de información del esquema confirmaron **14 tablas InnoDB, 12 FK, 18 CHECK aplicados (ENFORCED=YES), seis columnas monetarias DECIMAL con escala 2 y cuatro versiones registradas**.

La contraseña fue configurada por el usuario directamente en backend/.env; no se mostró ni se copió al chat, código, logs o documentación. El archivo sigue ignorado por Git y no está versionado. Solo se modificó allí CATALOG_SOURCE=mysql, conservando las credenciales sin mostrarlas. La cuenta temporal autorizada para desarrollo no fue creada ni alterada por los scripts. `.env.example` conserva usuario de ejemplo y contraseña vacía.

El bloqueo previo por contraseña vacía quedó resuelto. Se ejecutaron 001_create_database.sql, 002_relational_schema.sql, 003_roles_and_plans.sql y 004_demo_catalog.sql. Una segunda ejecución omitió las cuatro versiones y verificó sus checksums, sin duplicar datos ni reiniciar inventario. No fue necesario corregir ninguna migración tras aplicarla: todos los comandos SQL de la ejecución autenticada finalizaron correctamente.

**No se usaron dobles de conexión ni respuestas HTTP falsas para estos resultados.** Los productos y usuarios técnicos son datos de prueba identificados, pero sus inserciones, restricciones, consultas y transacciones ocurrieron realmente en MySQL. Esto se distingue de las pruebas unitarias que sí usan dobles explícitos.

## Validaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| `npm --prefix backend test` | 14 correctas: 8 HTTP/configuración existentes y 6 pruebas unitarias de contratos MySQL/transacciones |
| `npm test` del frontend | 17 correctas |
| `npm run lint` | Sin advertencias de código |
| `npm run build` del frontend | Correcto |
| `npm --prefix backend run check:http` | 21 solicitudes HTTP reales correctas con Express leyendo MySQL |
| Servicio y versión autenticada | Conexión real; MySQL 8.0.46 |
| `db:migrate` | Cuatro versiones aplicadas; repetición con cuatro SKIP y checksums correctos |
| `db:check` | 14 tablas InnoDB, 12 FK, 18 CHECK activos, seis campos DECIMAL y cuatro migraciones |
| `db:verify` | Inserciones, consultas, actualizaciones, eliminación controlada, restricciones y transacciones reales correctas |
| `db:verify:http` | Inserción SQL visible en Express, precio actualizado visible en HTTP y 404 después de eliminar la fila |
| Chrome / React | 12 productos, 5 categorías y 2 promociones desde Express/MySQL; filtros, vacío, favoritos, cuenta y responsive pasan |
| `.env` ignorado | Comprobado con git check-ignore |

Las 14 pruebas de backend incluyen dobles unitarios y servidores HTTP con fixture: por sí solas no prueban MySQL. La validación del motor la proporcionan los comandos db:* ejecutados realmente. Las 21 solicitudes de check:http de esta continuación se hicieron contra el proceso activo iniciado con CATALOG_SOURCE=mysql.

### Persistencia, relaciones y transacciones comprobadas

- Alta de producto+inventario confirmada con COMMIT y consulta posterior desde el pool.
- Actualización de reservas y cantidad disponible generada; rechazo de reserva superior al total.
- Rechazo de precio negativo, categoría inexistente y borrado de producto referenciado por inventario.
- Fallo intencional en la segunda inserción de producto+inventario: la primera inserción también desaparece por ROLLBACK.
- Correo único, incluida comparación sin distinguir mayúsculas; favorito único por usuario/Jikan, ID de Jikan positivo y rechazo de usuario inexistente.
- Como máximo un carrito activo por usuario; línea única por producto y cantidad positiva; eliminación en cascada de sus detalles.
- Envío/precio unitario no negativos, moneda PEN y subtotal exacto DECIMAL (10.25 × 3 = 30.75).
- Precio histórico del pedido conservado al cambiar el precio del producto; usuarios con pedidos protegidos contra borrado.
- Una suscripción activa por usuario y fecha final posterior al inicio; transición a finalizada permite otro periodo activo.
- Eliminación controlada de dependencias y usuario técnico; CASCADE de favoritos y rollback de todo el escenario transaccional. El cambio temporal de precio también se revirtió.
- Limpieza final confirmada: **12 productos, 12 inventarios, cero usuarios, pedidos, carritos e historiales de suscripción**. Ningún producto verify-* o http-verify-* quedó en la base. Los contadores AUTO_INCREMENT pueden avanzar por estas pruebas sin que queden filas.

El comando db:verify:http es una comprobación adicional contra el servidor activo: crea una fila que no existe en mock/db.json, exige que GET /products/:id la devuelva, cambia su precio mediante SQL y exige ver el nuevo importe por HTTP. Tras la limpieza exige 404. Por eso no se confunde un API funcionando con fixture con el API conectado realmente a MySQL.

## Repetir las validaciones

1. Mantener las credenciales solo en `backend/.env`, sin enviarlas al chat. Si la contraseña contiene `#` o espacios, usar la sintaxis entre comillas de dotenv. No cambiar credenciales de otras aplicaciones.
2. Ejecutar desde la raíz:

```sh
npm --prefix backend run db:migrate
npm --prefix backend run db:check
npm --prefix backend run db:verify
```

3. Las verificaciones reales utilizan registros técnicos propios que se revierten/eliminan. No ejecutar la prueba de escrituras en producción; el script la rechaza con NODE_ENV=production.
4. CATALOG_SOURCE=mysql ya está configurado localmente. Para iniciar de nuevo el backend usar `npm --prefix backend start` o `npm --prefix backend run dev`.
5. Con Express y Vite activos, ejecutar:

```sh
npm --prefix backend run check:http
npm --prefix backend run db:verify:http
node scripts/audit-backend-browser.mjs
```

6. Repetir db:migrate es seguro para comprobar que omite versiones aplicadas sin duplicar semillas. No editar los archivos SQL ya aplicados: los siguientes cambios requieren una nueva migración.

La documentación incluye creación de una cuenta de aplicación de mínimo privilegio mediante contraseña generada por el propio servidor, como ejemplo manual no ejecutado; no se modifica la cuenta de desarrollo existente. Las migraciones/verificaciones necesitan una cuenta de mantenimiento; la API de consulta solo necesita SELECT sobre productos/categorías/promociones.

No se implementó autenticación, checkout, cobros ni sincronización remota de favoritos/perfil. Jikan y JSON Server no se modificaron. No se avanzó a la Fase 6.
