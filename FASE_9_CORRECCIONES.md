# OtakuZone — correcciones y validación final de FASE 9

Fecha: 14 de noviembre de 2026, America/Lima.

## Dictamen y clasificación

| Asunto | Estado | Resultado de esta continuación |
| --- | --- | --- |
| Separación MySQL y aprovisionamiento mínimo | **PREPARADO PARA EJECUCIÓN MANUAL** | SQL revisado contra las consultas existentes y pasos de operador preparados. No ejecutado. |
| Sustitución efectiva de root en runtime | **PENDIENTE DE REVISIÓN** | Debe aprobarse y ejecutarse manualmente el aprovisionamiento, editar la configuración local y comprobar la cuenta efectiva. El backend todavía usa root. |
| Integración real con Jikan | **PENDIENTE POR CONECTIVIDAD** | Las nuevas consultas no recibieron respuesta HTTP, directamente ni mediante el proxy existente. No se declara aprobada. |
| Regresión local solicitada | **RESUELTO Y VALIDADO** | 18 pruebas frontend y 18 backend aprobadas, lint y build correctos. |

La revisión y preparación están terminadas. **La FASE 9 no puede declararse completamente cerrada** mientras no se ejecute y valide el cambio de runtime y no se compruebe Jikan desde una red con conectividad. Se mantienen los resultados locales previos documentados en `CALIDAD_FASE_9.md`, sin convertirlos en una aprobación externa o productiva.

No se modificaron componentes, lógica comercial, backend/.env, secretos, cuentas reales, datos de desarrollo ni las siete migraciones. No se ejecutaron GRANT, CREATE USER, ALTER USER, REVOKE, migraciones o pruebas comerciales de escritura. No se hizo commit ni se avanzó a FASE 10.

## 1. Hallazgo MySQL comprobado

Inspección de `.env` mediante parseo en memoria, sin imprimir DB_PASSWORD/JWT_SECRET. Se compararon los campos no secretos del archivo con la configuración efectiva del pool y con SELECT CURRENT_USER()/USER()/DATABASE().

| Dato no secreto | Resultado observado |
| --- | --- |
| DB_HOST / DB_PORT | 127.0.0.1 / 3306 |
| DB_NAME | otakuzone_db |
| DB_USER del archivo y del pool | root |
| CURRENT_USER() y USER() | root@localhost |
| Versión | MySQL 8.0.46 |
| TLS del pool local | DB_SSL=false |
| Roles obligatorios / activar todos al conectar | Vacío / 0 |
| partial_revokes | 0 |

El servidor identifica la cuenta como `root@localhost`, aunque el host configurado en el cliente sea 127.0.0.1. Debe comprobarse siempre CURRENT_USER(), no deducir la cuenta efectiva solo a partir del archivo.

El pool usa credenciales de entorno, consultas execute parametrizadas, `multipleStatements:false`, DECIMAL como cadenas y zona UTC. Con DB_SSL=true habilita TLS con `rejectUnauthorized:true`. No necesita privilegios globales para transacciones, commit/rollback ni consultas parametrizadas. La configuración local no constituye una validación de TLS productivo.

### Privilegios efectivos actuales

SHOW GRANTS FOR CURRENT_USER confirmó sobre `*.*`, con GRANT OPTION:

```text
SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, SHUTDOWN,
PROCESS, FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER,
CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE,
REPLICATION SLAVE, REPLICATION CLIENT,
CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE,
CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE
```

También confirmó estos privilegios dinámicos globales con GRANT OPTION:

```text
APPLICATION_PASSWORD_ADMIN, AUDIT_ABORT_EXEMPT, AUDIT_ADMIN,
AUTHENTICATION_POLICY_ADMIN, BACKUP_ADMIN, BINLOG_ADMIN,
BINLOG_ENCRYPTION_ADMIN, CLONE_ADMIN, CONNECTION_ADMIN,
ENCRYPTION_KEY_ADMIN, FIREWALL_EXEMPT, FLUSH_OPTIMIZER_COSTS,
FLUSH_STATUS, FLUSH_TABLES, FLUSH_USER_RESOURCES,
GROUP_REPLICATION_ADMIN, GROUP_REPLICATION_STREAM,
INNODB_REDO_LOG_ARCHIVE, INNODB_REDO_LOG_ENABLE,
PASSWORDLESS_USER_ADMIN, PERSIST_RO_VARIABLES_ADMIN,
REPLICATION_APPLIER, REPLICATION_SLAVE_ADMIN,
RESOURCE_GROUP_ADMIN, RESOURCE_GROUP_USER, ROLE_ADMIN,
SENSITIVE_VARIABLES_OBSERVER, SERVICE_CONNECTION_ADMIN,
SESSION_VARIABLES_ADMIN, SET_USER_ID, SHOW_ROUTINE, SYSTEM_USER,
SYSTEM_VARIABLES_ADMIN, TABLE_ENCRYPTION_ADMIN,
TELEMETRY_LOG_ADMIN, XA_RECOVER_ADMIN
```

Además: `PROXY ON ''@'' ... WITH GRANT OPTION`. Son facultades muy superiores al runtime: abarcan otras bases, DDL, cuentas, concesión de permisos y administración del servidor. Una exposición de esas credenciales tendría alcance superior a OtakuZone.

## 2. Separación propuesta

| Identidad propuesta | Uso y alcance |
| --- | --- |
| otakuzone_runtime@127.0.0.1 | Pool de Express. Lecturas de autenticación/catálogo/comercio/ADMIN y escrituras por columna necesarias. Sin DDL, GRANT OPTION, privilegios globales ni modificación de roles existentes. |
| otakuzone_maintenance@127.0.0.1 | Operador autorizado; comprobación de esquema, DML de mantenimiento y futuras ampliaciones revisadas únicamente en otakuzone_db. Fuera de la configuración runtime. |
| Operador de aprovisionamiento existente | Crear las dos cuentas y conceder sus permisos. No forma parte del pool ni se sustituye/elimina en esta tarea. |

La consulta de mysql.user confirmó que los dos nombres propuestos no existen en ningún host en este momento. Debe repetirse esa comprobación justo antes de ejecutar el SQL; no es una reserva del nombre.

### Permisos necesarios del runtime

Revisados contra `authSql.js`, `catalogSql.js`, `commerceSql.js`, `adminRepository.js`, `commerceRepository.js`, `authRepository.js` y el arranque de `server.js`:

| Tablas | Lectura / escritura requerida |
| --- | --- |
| roles | SELECT para obtener CLIENTE/ADMIN. Sin escritura. |
| usuarios | SELECT, incluyendo hash para bcrypt en el servidor; INSERT de registro; UPDATE solo nombre/presentacion. No UPDATE de rol_id, password_hash, email o estado. |
| auth_sesiones | SELECT; INSERT de sesión; UPDATE solo revocada_en. Logout revoca: no necesita DELETE. |
| productos / categorias | SELECT; INSERT y UPDATE de campos usados por ADMIN. Bajas lógicas, sin DELETE ni DDL. |
| inventario | SELECT; INSERT de producto_id/cantidad_total; UPDATE solo cantidad_total. Sin modificar la columna generada ni reservas. |
| promociones / suscripciones | SELECT únicamente. El cambio Free/Premium modifica historial del usuario, no el catálogo de planes. |
| carritos | SELECT; INSERT usuario_id; UPDATE estado. Sin DELETE de cabeceras. |
| detalles_carrito | SELECT; INSERT de línea; UPDATE cantidad; DELETE para quitar productos. |
| pedidos | SELECT; INSERT de cabecera comercial; UPDATE solo estado por ADMIN. |
| detalles_pedido / historial_pedidos | SELECT e INSERT de snapshots/eventos. Sin UPDATE/DELETE. |
| historial_suscripciones | SELECT; INSERT de periodo; UPDATE estado/fecha_fin. |
| movimientos_inventario | SELECT e INSERT de auditoría. Sin UPDATE/DELETE. |

La inserción de rol_id es necesaria para registrar usuarios con el rol CLIENTE que selecciona el servicio; no permite actualizar roles de cuentas existentes. La autorización ADMIN/CLIENTE por operación continúa en el middleware de Express: ambas clases de usuario comparten el pool de aplicación.

No se otorgan permisos runtime a `favoritos` porque la interfaz usa almacenamiento local, ni a `schema_migrations` porque HTTP no lee ni escribe el ledger. Tampoco se concede DELETE de sesiones, cabeceras, pedidos, usuarios o productos. Esto reduce permisos que estaban presentes en el ejemplo anterior.

La cuenta de mantenimiento recibe SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/REFERENCES solo sobre `otakuzone_db.*`. Permite comprobación completa del esquema, conciliación autorizada, operaciones del CLI de mantenimiento y versiones futuras revisadas. No recibe DROP, privilegios globales, CREATE USER ni GRANT OPTION. Si una operación futura exige otro permiso, deberá revisarse entonces.

Con partial_revokes=0, los guiones bajos en concesiones de esquema pueden actuar como comodines. El SQL utiliza ``ON `otakuzone\_db`.*`` para limitar mantenimiento al nombre literal; las concesiones runtime son de tabla, no patrones de esquema. Si cambia esa configuración, detenerse y revisar la representación sin cambiar variables globales automáticamente. Referencia técnica: [MySQL 8.0, GRANT](https://dev.mysql.com/doc/refman/8.0/en/grant.html).

El helper de mantenimiento `createProductWithInventory` puede insertar cantidad_reservada; no es el alta HTTP de ADMIN y debe ejecutarse con mantenimiento. El alta HTTP usa la reserva por defecto cero y queda cubierta por el runtime propuesto.

El preparador QA crea bases aleatorias y cuentas temporales: **no puede utilizar estas credenciales limitadas a otakuzone_db**. Requiere un operador de bootstrap separado, o una instancia de pruebas preparada para ello; no se deben ampliar los permisos del runtime para hacerlo funcionar.

## 3. Script preparado y revisión estática

Archivo nuevo: [separate-users.reviewed.sql](backend/database/provisioning/separate-users.reviewed.sql).

- Crea únicamente las dos identidades nuevas, restringidas al host local indicado; no modifica ni elimina cuentas existentes.
- Usa IDENTIFIED BY RANDOM PASSWORD, sin contraseñas literales. La salida futura con las claves generadas es solo para la consola privada del operador; no debe compartirse ni guardarse en logs/versionado.
- Runtime: concesiones por tabla y escritura por columna. Mantenimiento: solo el esquema indicado.
- Sin ON *.*, GRANT OPTION, privilegios globales, PROXY, ALTER USER, REVOKE o DROP USER.
- Revisión estática ejecutada: 28 GRANT, dos CREATE USER, ninguna contraseña literal ni concesión global. **No se probó ejecutando el SQL ni con una cuenta runtime nueva**, conforme a la orden de detenerse antes de cambiar cuentas.

Los GRANT son idempotentes como concesiones, pero no eliminan permisos previos. Por ello **no se usa CREATE USER IF NOT EXISTS** para adoptar identidades desconocidas: CREATE USER falla si ya existe la cuenta. Se debe ejecutar en batch sin --force, deteniéndose ante errores. No hay rotaciones, revocaciones ni reparaciones automáticas. Si una ejecución futura queda parcial, el operador debe revisar sus cuentas y SHOW GRANTS antes de continuar; no borrar/recrear por rutina.

El archivo previo `application-user.example.sql` queda intacto como antecedente; para esta propuesta debe revisarse y ejecutarse exclusivamente el nuevo script.

## 4. Procedimiento manual del operador — no ejecutado

Los siguientes pasos requieren revisión y ejecución humana. **Aquí se detuvo toda modificación de cuentas y credenciales.**

1. Abrir una consola privada con el cliente MySQL instalado; el password se solicita de manera interactiva, nunca como argumento:

```powershell
& 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe' --no-defaults --protocol=TCP --host=127.0.0.1 --user=root --password
```

2. Comprobar identidades libres, roles globales obligatorios y versión. Si aparecen filas para los nombres propuestos, detenerse y revisar; no adoptar esas cuentas ni revocarles permisos automáticamente:

```sql
SELECT CURRENT_USER(), VERSION(), @@mandatory_roles, @@activate_all_roles_on_login, @@partial_revokes;
SELECT User, Host FROM mysql.user
WHERE User IN ('otakuzone_runtime','otakuzone_maintenance');
```

3. Salir de esa sesión y ejecutar el script revisado desde la raíz del repositorio en **batch sin --force**. El cliente instalado confirma que batch desactiva historial y que force continúa tras errores; no usar force. No redirigir la salida con las claves a archivos:

```powershell
Get-Content -LiteralPath 'backend/database/provisioning/separate-users.reviewed.sql' -Raw |
  & 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe' --no-defaults --protocol=TCP --host=127.0.0.1 --user=root --password --batch --default-character-set=utf8mb4
```

Guardar las claves generadas en el gestor privado del operador. Si falla alguna instrucción, detenerse y revisar; no repetir todo el archivo indiscriminadamente. El script no ejecuta migraciones ni datos de negocio.

4. Comprobar SHOW GRANTS de las dos cuentas (el script ya los consulta). Conectar como runtime con --password y comprobar la cuenta que MySQL realmente empareja y sus roles:

```powershell
& 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe' --no-defaults --protocol=TCP --host=127.0.0.1 --user=otakuzone_runtime --password otakuzone_db
```

```sql
SELECT CURRENT_USER(), DATABASE(), CURRENT_ROLE();
SHOW GRANTS FOR CURRENT_USER;
SELECT id FROM productos LIMIT 1;
SELECT id FROM auth_sesiones LIMIT 0;
SELECT rol_id FROM usuarios LIMIT 0;
-- Deben denegarse: lectura fuera de las tablas concedidas y columnas de escritura excluidas.
SELECT version FROM schema_migrations LIMIT 0;
SELECT User FROM mysql.user LIMIT 0;
-- Cero filas: verifica el privilegio sin cambiar datos.
UPDATE usuarios SET rol_id=rol_id WHERE 1=0;
```

Las dos últimas lecturas y el UPDATE deben rechazarse por privilegios. Si no ocurre, revisar roles/herencia y concesiones antes de configurar el backend. No usar CREATE/DROP/INSERT de prueba sobre datos de desarrollo.

5. Tras aprobación, **editar manualmente** backend/.env: conservar DB_HOST=127.0.0.1, DB_PORT=3306 y DB_NAME=otakuzone_db; cambiar DB_USER a otakuzone_runtime y DB_PASSWORD a su nueva clave privada. No copiar la clave a este documento/chat. Conservar JWT_SECRET y las demás opciones. No hubo edición automática de ese archivo.

6. Guardar las credenciales de mantenimiento por separado, por ejemplo en backend/.env.maintenance (ignorado por `.env.*`), creado manualmente y protegido por permisos locales. Nunca cargar ese archivo al iniciar Express. En una terminal sin variables DB_* antiguas exportadas, se puede usar para una comprobación de esquema de solo lectura:

```powershell
node --env-file=backend/.env.maintenance backend/scripts/check-db.js
```

`loadEnvironment` no sobrescribe variables ya cargadas. El runtime deliberadamente no ve todas las tablas/ledger que necesita el chequeo completo; no añadirle permisos para ejecutar ese CLI.

7. Reiniciar Express con su .env de runtime. Verificar la identidad efectiva y el arranque; conservar el procedimiento de vuelta atrás bajo control del operador. El éxito definitivo requiere además validar los permisos nuevos de registro/carrito/compra/ADMIN en **un entorno aislado configurado para esas cuentas**, sin usar datos reales. En esta continuación no se ejecutó ese aprovisionamiento ni esa validación de escrituras.

## 5. Revisión y nueva prueba de Jikan

No se modificó la integración. Base por defecto: `https://api.jikan.moe/v4`, configurable mediante VITE_JIKAN_API_URL. No se encontraron archivos activos `.env`, `.env.local`, `.env.development` o `.env.development.local` del frontend que la sustituyeran en el checkout inspeccionado.

| Función existente | Endpoint y parámetros | Estado actual |
| --- | --- | --- |
| Populares | /top/anime?filter=bypopularity&limit=4&sfw=true | PENDIENTE POR CONECTIVIDAD |
| Temporada | /seasons/now?limit=4&sfw=true | PENDIENTE POR CONECTIVIDAD |
| Géneros | /genres/anime?filter=genres | PENDIENTE POR CONECTIVIDAD |
| Búsqueda | /anime: page, limit=12, sfw=true, q, genres, status, order_by y sort | PENDIENTE POR CONECTIVIDAD |
| Detalle | /anime/:id/full, ID numérico positivo | PENDIENTE POR CONECTIVIDAD |

Búsqueda: popularidad ascendente o puntuación descendente; título limitado a 150 caracteres; género numérico y estados de la lista permitida. Revisión de `jikan.js`, `http.js` y `domain/catalog.js`: JSON/DTO validados, deduplicación por ID, máximo dos intentos de transporte, timeout de 15 segundos por petición y cola de inicios de 1.1 segundos. Reintenta conexión, 429 y 5xx de forma acotada; respeta Retry-After y no reintenta automáticamente esperas superiores a diez segundos. La caché completada dura 60 segundos y las solicitudes pendientes se comparten/cancelan por consumidor. El debounce UI es de 450 ms. No es un límite total de 15 segundos para toda la operación: cola/reintento pueden prolongarla.

La UI conserva carga/error/Reintentar y el acceso explícito a Demo local; demo está identificado como ficticio y no es un fallback exitoso oculto. Esa conducta ya se ejecutó en la auditoría anterior; aquí se revisó el código sin repetir el recorrido completo del navegador.

### Resultados nuevos, no destructivos

GET a **https://api.jikan.moe/v4**, con plazo de 12 segundos y sin desactivar TLS:

| Ejecución | Resultado |
| --- | --- |
| Node directo dentro del sandbox | TypeError, causa UND_ERR_CONNECT_TIMEOUT; sin respuesta HTTP. |
| Node directo fuera del sandbox | TypeError, causa UND_ERR_CONNECT_TIMEOUT; sin respuesta HTTP. |
| Node fuera del sandbox con --use-env-proxy | TypeError, causa UND_ERR_CONNECT_TIMEOUT; sin respuesta HTTP. |

Existen HTTP_PROXY/HTTPS_PROXY/NO_PROXY en el entorno; se revisó su presencia sin imprimir los valores. El proxy configurado no incluye usuario/contraseña en su URL. La prueba --use-env-proxy utiliza la configuración existente, incluidas sus exclusiones; no se afirmó que una respuesta hubiese atravesado correctamente el proxy. No se cambiaron sus valores, certificados ni TLS.

No existe una respuesta HTTP que permita validar el camino exitoso. No se repitieron cinco llamadas de dominio tras el fallo inicial, ni Chrome, ni flujos comerciales de escritura. Por ello **no se validaron de nuevo populares, temporada, géneros, búsqueda, detalle o su consumo exitoso en React simultáneo con Express/MySQL**. Los estados exitosos no se inventan; tampoco se afirma que Jikan esté caído globalmente.

### Condiciones para repetir

Disponer de DNS y salida HTTPS funcional hacia api.jikan.moe y una configuración de proxy permitida que realmente pueda alcanzar el destino; mantener certificados válidos. Comprobar primero respuesta HTTP. La raíz /v4 puede no ser un endpoint de datos: un eventual 404 probaría transporte, no la validez de populares o búsqueda.

Después, usar los servicios/guiones existentes para los cinco endpoints, respetar rate limiting y abrir React con Jikan como fuente. Verificar resultados reales, detalle y favoritos, así como catálogo Express/MySQL simultáneo. No usar demo para acreditar ese éxito. Si el entorno sigue sin salida, conservar esta clasificación y el error observado.

## 6. Regresión ejecutada en esta continuación

| Comando | Resultado real |
| --- | --- |
| npm test | 18/18 aprobadas |
| npm --prefix backend test | 18/18 aprobadas |
| npm run lint | Aprobado, sin diagnósticos |
| npm run build | Aprobado: Vite 8.3.8, 2179 módulos, dist generado |

Se ejecutaron fuera del sandbox con autorización nativa, porque Node había requerido ese contexto para crear procesos de prueba. Las suites usan dobles y servidores HTTP temporales; no escriben en MySQL de desarrollo. No se repitieron quality:verify, verify-commerce, verify-admin, migraciones ni aprovisionamiento. Compilar produjo únicamente los artefactos locales ignorados de dist.

## 7. Archivos y límites finales

Añadidos exclusivamente en esta continuación:

- `backend/database/provisioning/separate-users.reviewed.sql`: propuesta manual revisada, sin ejecución ni contraseña real.
- `FASE_9_CORRECCIONES.md`: este informe.

El resto de cambios visibles en Git ya pertenecían a la FASE 9 anterior y se conservaron. No se editaron sus componentes, scripts comerciales ni configuración. El SQL previo de ejemplo permanece intacto; `git diff` de migraciones no muestra modificaciones y el índice no tiene archivos preparados.

La preparación de permisos no equivale a su aplicación o validación con una identidad nueva. El riesgo de root sigue vigente hasta la actuación manual del operador. Jikan mantiene el pendiente externo. El informe histórico CALIDAD_FASE_9.md conserva su evidencia; este documento registra la revisión adicional sin reescribir los resultados pasados.

**Detenido antes de crear/cambiar cuentas o credenciales. Sin commit y sin FASE 10.**
