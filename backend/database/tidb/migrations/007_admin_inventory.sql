-- Auditoría de inventario; no modifica filas ni migraciones anteriores.
CREATE TABLE movimientos_inventario (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  producto_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  pedido_id BIGINT UNSIGNED NULL,
  delta INT NOT NULL,
  cantidad_anterior INT NOT NULL,
  cantidad_nueva INT NOT NULL,
  motivo VARCHAR(300) NOT NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_movimientos_producto (producto_id, id),
  CONSTRAINT fk_movimiento_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_movimiento_actor FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_movimiento_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE RESTRICT,
  CONSTRAINT ck_movimiento_cantidades CHECK (cantidad_anterior >= 0 AND cantidad_nueva >= 0 AND cantidad_nueva - cantidad_anterior = delta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
