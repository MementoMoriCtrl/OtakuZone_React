-- FASE 9: PROPUESTA PARA EJECUCION MANUAL. NO ejecutada por Codex.
-- MySQL 8.0.46, esquema otakuzone_db con las siete migraciones YA aplicadas.
-- Ejecutar con un operador autorizado para CREATE USER y para conceder estos
-- permisos. No usar la cuenta de mantenimiento ni la de runtime para bootstrap.
-- Antes: comprobar que AMBOS nombres estan libres en todos sus hosts y revisar
-- los roles obligatorios del servidor. No adoptar una cuenta existente.
-- Revisado con @@partial_revokes=0. Se escapa el guion bajo del nombre de base
-- en el GRANT de esquema para que no actue como comodin. Si cambia esa opcion,
-- detenerse y revisar la representacion; NO cambiar variables globales aqui.
-- Usar el cliente en batch SIN --force: cualquier error debe detener el archivo.
-- CREATE USER no es idempotente deliberadamente: no cambia cuentas existentes
-- ni rota sus claves. Los GRANT son repetibles tras revisar SHOW GRANTS.
-- RANDOM PASSWORD devuelve las claves SOLO al operador en su consola privada.
-- No redirigir esa salida a logs, Git, capturas ni al chat.

CREATE USER 'otakuzone_runtime'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
CREATE USER 'otakuzone_maintenance'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;

-- RUNTIME: consultas de catalogo, autenticacion, comercio y ADMIN existentes.
-- SELECT de usuarios es necesario para bcrypt; la API no devuelve el hash.
GRANT SELECT ON otakuzone_db.roles TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.usuarios TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.auth_sesiones TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.productos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.categorias TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.inventario TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.promociones TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.carritos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.detalles_carrito TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.pedidos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.detalles_pedido TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.historial_pedidos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.suscripciones TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.historial_suscripciones TO 'otakuzone_runtime'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.movimientos_inventario TO 'otakuzone_runtime'@'127.0.0.1';

-- Registro y perfil: rol_id se inserta al registrar CLIENTE desde el servicio;
-- NO se concede UPDATE de rol_id, estado, email ni password_hash.
GRANT INSERT (rol_id,nombre,email,password_hash,estado), UPDATE (nombre,presentacion)
  ON otakuzone_db.usuarios TO 'otakuzone_runtime'@'127.0.0.1';
-- Login/logout: el codigo revoca sesiones; no necesita DELETE de sesiones.
GRANT INSERT (id,usuario_id,expira_en), UPDATE (revocada_en)
  ON otakuzone_db.auth_sesiones TO 'otakuzone_runtime'@'127.0.0.1';

-- ADMIN: alta/edicion/baja logica; sin DELETE de productos o categorias.
GRANT INSERT (id,categoria_id,nombre,descripcion,precio,image_key,alt_imagen,activo),
  UPDATE (nombre,categoria_id,descripcion,precio,image_key,alt_imagen,activo)
  ON otakuzone_db.productos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (id,nombre,activa), UPDATE (nombre,activa)
  ON otakuzone_db.categorias TO 'otakuzone_runtime'@'127.0.0.1';
-- Alta ADMIN usa la reserva por defecto 0; ajustes/compras/cancelacion solo
-- modifican cantidad_total, nunca columnas generadas ni cantidad_reservada.
GRANT INSERT (producto_id,cantidad_total), UPDATE (cantidad_total)
  ON otakuzone_db.inventario TO 'otakuzone_runtime'@'127.0.0.1';

-- Carrito: la unica eliminacion fisica expuesta elimina lineas propias.
GRANT INSERT (usuario_id), UPDATE (estado)
  ON otakuzone_db.carritos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (carrito_id,producto_id,cantidad), UPDATE (cantidad), DELETE
  ON otakuzone_db.detalles_carrito TO 'otakuzone_runtime'@'127.0.0.1';
-- Checkout y estados ADMIN: historiales/snapshots se agregan, no se borran.
GRANT INSERT (usuario_id,estado,carrito_origen_id,clave_solicitud), UPDATE (estado)
  ON otakuzone_db.pedidos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (pedido_id,producto_id,nombre_producto,precio_unitario,cantidad)
  ON otakuzone_db.detalles_pedido TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (pedido_id,estado)
  ON otakuzone_db.historial_pedidos TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (usuario_id,suscripcion_id,estado,fecha_inicio,precio_contratado),
  UPDATE (estado,fecha_fin)
  ON otakuzone_db.historial_suscripciones TO 'otakuzone_runtime'@'127.0.0.1';
GRANT INSERT (producto_id,actor_id,pedido_id,delta,cantidad_anterior,cantidad_nueva,motivo)
  ON otakuzone_db.movimientos_inventario TO 'otakuzone_runtime'@'127.0.0.1';

-- MANTENIMIENTO: identidad separada, sin acceso global ni GRANT OPTION.
-- DML: conciliacion autorizada, promocion manual de roles y limpieza de fixtures
-- en la base prevista. DDL: versiones FUTURAS revisadas; no repetir 001-007.
-- No se incluye DROP: cualquier eliminacion de esquema requiere otra revision.
-- Esta cuenta NO puede crear usuarios ni las bases aleatorias del ejecutor QA.
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES
  ON `otakuzone\_db`.* TO 'otakuzone_maintenance'@'127.0.0.1';

-- Ningun GRANT ON *.*, GRANT OPTION, CREATE USER, FILE, PROCESS, SUPER,
-- SYSTEM_VARIABLES_ADMIN o PROXY. Runtime tampoco tiene DDL ni acceso a roles
-- para escritura, schema_migrations o favoritos (la UI usa favoritos locales).
-- Verificar cuentas, roles efectivos y permisos ANTES de cambiar backend/.env.
SHOW GRANTS FOR 'otakuzone_runtime'@'127.0.0.1';
SHOW GRANTS FOR 'otakuzone_maintenance'@'127.0.0.1';
