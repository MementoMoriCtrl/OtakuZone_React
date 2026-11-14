-- EJEMPLO MANUAL para un administrador, fuera del ejecutor de migraciones.
-- MySQL >= 8.0.18: genera una contraseña nueva en el servidor. El resultado
-- debe guardarse solo localmente; no copiarlo a Git, logs o al chat.
-- No se ejecuta automáticamente ni modifica la cuenta de desarrollo existente.
CREATE USER 'otakuzone_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
GRANT SELECT ON otakuzone_db.productos TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.categorias TO 'otakuzone_app'@'127.0.0.1';
GRANT SELECT ON otakuzone_db.promociones TO 'otakuzone_app'@'127.0.0.1';
