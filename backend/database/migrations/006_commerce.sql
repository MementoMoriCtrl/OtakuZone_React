-- DDL versionado; no se alteran las migraciones anteriores.
ALTER TABLE pedidos
  ADD COLUMN carrito_origen_id BIGINT UNSIGNED NULL,
  ADD COLUMN clave_solicitud CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_pedidos_carrito (carrito_origen_id),
  ADD UNIQUE KEY uq_pedidos_solicitud (usuario_id, clave_solicitud),
  ADD CONSTRAINT fk_pedidos_carrito FOREIGN KEY (carrito_origen_id) REFERENCES carritos(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS historial_pedidos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pedido_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('pendiente','confirmado','cancelado','completado') NOT NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_historial_pedido_fecha (pedido_id, creado_en, id),
  CONSTRAINT fk_historial_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Los pedidos anteriores conservan su estado conocido; no se inventan transiciones.
INSERT INTO historial_pedidos (pedido_id, estado, creado_en)
SELECT p.id, p.estado, p.creado_en FROM pedidos p
WHERE NOT EXISTS (SELECT 1 FROM historial_pedidos h WHERE h.pedido_id = p.id);
