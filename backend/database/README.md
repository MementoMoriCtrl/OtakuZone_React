# MySQL — operación de Fase 5

Modelo y diagrama ER: [MODELO.md](MODELO.md). Objetivo: MySQL 8.0.16+; recomendado 8.0.46/8.4. No se sustituye por MariaDB/SQLite. Los CHECK deben estar aplicados, no meramente aceptados por un servidor antiguo.

## Configuración local

El backend carga `backend/.env`, ignorado por Git. Configurar localmente DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD conforme a `backend/.env.example`. Nunca copiar la contraseña al chat, código, capturas o documentación. DB_NAME para estas migraciones es **otakuzone_db**. El `.env.example` solo tiene un nombre de cuenta de ejemplo y contraseña vacía.

La cuenta administrativa local autorizada se usa temporalmente para crear el esquema y comprobarlo. No se crea ni se altera esa cuenta mediante el proyecto. El backend puede mantenerse con `CATALOG_SOURCE=demo` mientras se prepara MySQL, pero los comandos db:* siempre intentan MySQL real y fallan si falta acceso; no simulan éxito.

Desde la raíz:

```sh
npm --prefix backend ci
npm --prefix backend run db:migrate
npm --prefix backend run db:check
npm --prefix backend run db:verify
```

`db:migrate` crea otakuzone_db si no existe, comprueba versión, obtiene un lock de migraciones y registra SHA-256 del SQL normalizado a LF (sin BOM), evitando diferencias falsas por CRLF en Windows. Rechaza una base con tablas previas sin schema_migrations; no adopta esquemas desconocidos ni borra tablas. Repetir el comando no reinserta filas ni reinicia inventario. Cambiar una migración ya aplicada produce error: crear un archivo/version posterior.

## Scripts y transacciones de migración

| Archivo | Propósito |
| --- | --- |
| migrations/001_create_database.sql | Base utf8mb4, sin DROP |
| bootstrap/ledger.sql | Infraestructura schema_migrations |
| migrations/002_relational_schema.sql | 13 tablas de negocio, FK, CHECK e índices |
| migrations/003_roles_and_plans.sql | Roles/planes, sin usuarios ni credenciales |
| migrations/004_demo_catalog.sql | 12 productos, 5 categorías, 12 inventarios y 2 promociones de muestra |
| migrations/manifest.json | Orden y carácter transaccional de cada versión |

El DDL de MySQL implica commits y el archivo completo no es una transacción reversible. Si falla parcialmente, revisar el error y las tablas creadas, corregir y volver a ejecutar: CREATE TABLE IF NOT EXISTS permite reanudar, pero no corrige una tabla existente con definición distinta. Nunca se deshabilitan las FK ni se ejecuta DROP automático. En una base no vacía realizar respaldo antes de cualquier nueva migración.

Las semillas de las versiones 003/004 y su registro de versión se confirman en una misma transacción; un fallo revierte sus inserciones. Las semillas no sobrescriben registros existentes ni ponen de nuevo el stock en 25 si ya cambió. Ese stock es de demostración, no disponibilidad comercial real. Los usuarios y las tablas transaccionales quedan vacíos inicialmente.

El ejecutor administrativo habilita múltiples sentencias solo para archivos SQL versionados del repositorio. El pool de la aplicación tiene multipleStatements desactivado y usa execute con parámetros. El nombre de la base no se concatena a SQL: el bootstrap está destinado explícitamente a otakuzone_db y rechaza otro nombre.

## Activar MySQL en Express

Después de migrar/comprobar, poner **solo localmente** en backend/.env:

```dotenv
CATALOG_SOURCE=mysql
```

Reiniciar el backend:

```sh
npm --prefix backend run dev
```

El inicio prueba una conexión real antes de escuchar. Si MySQL falla, no cambia silenciosamente a demo. Se conservan todos los endpoints existentes: /api/v1/health, /products, /products/:id, /categories, /categories/:id y /promotions. Health sigue siendo liveness, no un diagnóstico público de credenciales. Las pérdidas de conexión durante consultas generan error seguro (503 cuando se reconoce indisponibilidad); no se exponen trazas SQL.

El frontend no necesita moverse ni cambiar su servicio: sigue usando Express en 4000/api/v1. No se modifica Jikan ni JSON Server. El origen de datos comerciales sigue siendo demostrativo aunque el almacenamiento sea MySQL; `meta.source: "demo"` describe esos datos, no una conexión simulada.

## Pool, repositorios y operación atómica

- config/database.js valida entorno sin reflejar valores secretos.
- db/pool.js crea mysql2/promise con cola acotada, límite de conexiones, timeout y cierre explícito.
- db/catalogSql.js contiene consultas estáticas. Los filtros y los identificadores son parámetros, no fragmentos SQL.
- repositories/mysqlCatalogRepository.js implementa el mismo contrato de catálogo que el repositorio demo. DECIMAL se conserva como string en el driver y solo se adapta al DTO numérico de precios requerido por la UI.
- services/productMaintenanceService.js valida una operación interna de alta de producto+inventario. No existe una ruta pública que permita escribir sin autenticación.
- db/transaction.js ejecuta begin/commit/rollback en una sola conexión; fija UTC para las escrituras relacionadas y libera la conexión. Si rollback falla, destruye la conexión en vez de devolverla al pool. No hay reintentos ciegos de transacciones con resultado de commit ambiguo.

No se implementa checkout, cobro, reservas automáticas por carrito, autenticación ni sincronización de favoritos de navegador. Los carritos/pedidos/historial se preparan y validan a nivel de esquema sin inventar una API autenticada de usuario.

## Comprobación real

`db:check` conecta, comprueba la versión, 14 tablas InnoDB (incluida metadata), FK/CHECK, tipos DECIMAL y cuatro migraciones. Requiere una cuenta de mantenimiento con visibilidad del esquema completo; una cuenta de aplicación limitada al catálogo no verá todas las tablas.

`db:verify` requiere permisos de mantenimiento y se prohíbe con NODE_ENV=production. Realiza consultas, inserciones, actualizaciones, restricciones UNIQUE/FK/CHECK, commit y rollback, comprobaciones de snapshots de pedidos y eliminación controlada. Usa identificadores aleatorios propios; el usuario/pedidos/carritos/historial técnicos se revierten, y los productos/inventarios temporales confirmados se eliminan al final. No modifica registros previos. Los contadores AUTO_INCREMENT pueden avanzar por las pruebas aunque los registros se reviertan. Si el proceso termina de forma forzada puede quedar un producto verify-*: inspeccionarlo y eliminar sus referencias de forma controlada, no borrar datos por patrón sin revisión.

Tras activar MySQL, con el backend y Vite activos:

```sh
npm --prefix backend run check:http
npm --prefix backend run db:verify:http
node scripts/audit-backend-browser.mjs
```

Esto comprueba los endpoints/DTO reales y su consumo en React, además de las pruebas de almacenamiento. `npm --prefix backend test` contiene pruebas HTTP con fixture y dobles unitarios de transacción; esos dobles no sustituyen db:check/db:verify ni demuestran conexión.

`db:verify:http` crea un producto/inventario temporal en MySQL y exige ver esa fila y su actualización por HTTP; al eliminarla exige 404. Esto prueba que Express no está devolviendo el JSON de demostración. Solo se permite fuera de producción y limpia sus propios registros. Resultados ejecutados: [MYSQL_FASE_5.md](../../MYSQL_FASE_5.md).

## Cuenta de aplicación y permisos

No usar una cuenta administrativa en producción. En una sesión administrativa local de MySQL 8.0.18+ puede ejecutarse manualmente `provisioning/application-user.example.sql`: CREATE USER genera una contraseña aleatoria en el propio servidor y los GRANT limitan el usuario a SELECT de las tres tablas que hoy expone el API. Guardar ese resultado únicamente en la configuración local, nunca en Git/logs/chat. El script no se ejecuta automáticamente. En MySQL 8.0.16/17 crear la cuenta con Workbench y contraseña definida localmente, y ejecutar solo los GRANT.

La cuenta de migración necesita permisos de creación de base/tablas, índices/restricciones y lectura/escritura sobre el esquema. La cuenta de verificación necesita SELECT/INSERT/UPDATE/DELETE sobre las tablas comprobadas; no necesita CREATE USER. La cuenta runtime de la API actual solo necesita SELECT de productos/categorías/promociones. La operación interna de mantenimiento necesita una cuenta autorizada para INSERT; no se expone a HTTP. Los permisos futuros se ampliarán según funcionalidades realmente implementadas, sin GRANT ALL por defecto.

Fuentes: [CHECK de MySQL](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html), [restricciones de FK y columnas generadas](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html), [mysql2](https://sidorares.github.io/node-mysql2/docs), [contraseñas aleatorias en MySQL](https://dev.mysql.com/doc/refman/8.0/en/password-management.html).

No se implementó autenticación ni se avanzó a la Fase 6.
