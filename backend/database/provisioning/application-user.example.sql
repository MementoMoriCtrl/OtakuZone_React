-- EJEMPLO MANUAL para un administrador, fuera del ejecutor de migraciones.
-- MySQL >= 8.0.18: genera una contraseña nueva en el servidor. El resultado
-- debe guardarse solo localmente; no copiarlo a Git, logs o al chat.
-- No se ejecuta automáticamente ni modifica la cuenta de desarrollo existente.
CREATE USER 'otakuzone_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
GRANT SELECT ON otakuzone_db.productos TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.categorias TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.promociones TO 'otakuzone_app'@'127.0.0.1';
-- Auth de Fase 6: no se concede UPDATE de rol_id/password_hash desde runtime.
GRANT SELECT ON otakuzone_db.roles TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.usuarios TO 'otakuzone_app'@'127.0.0.1';
GRANT INSERT (rol_id, nombre, email, password_hash, estado) ON otakuzone_db.usuarios TO 'otakuzone_app'@'127.0.0.1';
GRANT UPDATE (nombre, presentacion) ON otakuzone_db.usuarios TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT, DELETE ON otakuzone_db.auth_sesiones TO 'otakuzone_app'@'127.0.0.1';
GRANT UPDATE (revocada_en) ON otakuzone_db.auth_sesiones TO 'otakuzone_app'@'127.0.0.1';
-- Fase 7: operaciones comerciales propias, sin DDL ni administración del catálogo.
GRANT SELECT ON otakuzone_db.inventario TO 'otakuzone_app'@'127.0.0.1';
GRANT UPDATE (cantidad_total) ON otakuzone_db.inventario TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT ON otakuzone_db.carritos TO 'otakuzone_app'@'127.0.0.1';
GRANT UPDATE (estado) ON otakuzone_db.carritos TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON otakuzone_db.detalles_carrito TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT ON otakuzone_db.pedidos TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT ON otakuzone_db.detalles_pedido TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT ON otakuzone_db.historial_pedidos TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.suscripciones TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT, INSERT ON otakuzone_db.historial_suscripciones TO 'otakuzone_app'@'127.0.0.1';
GRANT UPDATE (estado,fecha_fin) ON otakuzone_db.historial_suscripciones TO 'otakuzone_app'@'127.0.0.1';
