CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rol_id SMALLINT UNSIGNED NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  email VARCHAR(254) COLLATE utf8mb4_0900_as_ci NOT NULL,
  presentacion VARCHAR(300) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) DEFAULT NULL,
  estado ENUM('demostrativo','activo','inactivo') NOT NULL DEFAULT 'inactivo',
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usuarios_email (email),
  KEY ix_usuarios_rol (rol_id),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_usuarios_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) BETWEEN 2 AND 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_categorias_activa CHECK (activa IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS productos (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  categoria_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(2000) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  image_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  alt_imagen VARCHAR(300) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_productos_categoria_activo (categoria_id, activo),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_productos_precio CHECK (precio >= 0),
  CONSTRAINT ck_productos_activo CHECK (activo IN (0,1)),
  CONSTRAINT ck_productos_image CHECK (image_key IN ('figura','manga','polo','llavero'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inventario (
  producto_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  cantidad_total INT NOT NULL DEFAULT 0,
  cantidad_reservada INT NOT NULL DEFAULT 0,
  cantidad_disponible INT GENERATED ALWAYS AS (cantidad_total - cantidad_reservada) STORED,
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_inventario_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_inventario_reserva CHECK (cantidad_total >= 0 AND cantidad_reservada >= 0 AND cantidad_reservada <= cantidad_total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS favoritos (
  usuario_id BIGINT UNSIGNED NOT NULL,
  jikan_anime_id INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (usuario_id, jikan_anime_id),
  CONSTRAINT fk_favoritos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_favoritos_jikan CHECK (jikan_anime_id > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS carritos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('activo','convertido','abandonado') NOT NULL DEFAULT 'activo',
  usuario_activo_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN estado = 'activo' THEN usuario_id ELSE NULL END) STORED,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_carritos_usuario_activo (usuario_activo_id),
  KEY ix_carritos_usuario_estado (usuario_id, estado),
  CONSTRAINT fk_carritos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS detalles_carrito (
  carrito_id BIGINT UNSIGNED NOT NULL,
  producto_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  PRIMARY KEY (carrito_id, producto_id),
  KEY ix_detalles_carrito_producto (producto_id),
  CONSTRAINT fk_detalles_carrito_carrito FOREIGN KEY (carrito_id) REFERENCES carritos(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_detalles_carrito_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_detalles_carrito_cantidad CHECK (cantidad BETWEEN 1 AND 9999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pedidos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('pendiente','confirmado','cancelado','completado') NOT NULL DEFAULT 'pendiente',
  moneda CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PEN',
  costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_pedidos_usuario_fecha (usuario_id, creado_en),
  KEY ix_pedidos_estado_fecha (estado, creado_en),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_pedidos_moneda CHECK (moneda = 'PEN'),
  CONSTRAINT ck_pedidos_envio CHECK (costo_envio >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS detalles_pedido (
  pedido_id BIGINT UNSIGNED NOT NULL,
  producto_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre_producto VARCHAR(150) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (precio_unitario * cantidad) STORED,
  PRIMARY KEY (pedido_id, producto_id),
  KEY ix_detalles_pedido_producto (producto_id),
  CONSTRAINT fk_detalles_pedido_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_detalles_pedido_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_detalles_pedido_precio CHECK (precio_unitario >= 0),
  CONSTRAINT ck_detalles_pedido_cantidad CHECK (cantidad BETWEEN 1 AND 9999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS suscripciones (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  precio_mensual DECIMAL(10,2) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_suscripciones_codigo (codigo),
  CONSTRAINT ck_suscripciones_precio CHECK (precio_mensual >= 0),
  CONSTRAINT ck_suscripciones_activa CHECK (activa IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS historial_suscripciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  suscripcion_id SMALLINT UNSIGNED NOT NULL,
  estado ENUM('activa','finalizada','cancelada') NOT NULL,
  fecha_inicio DATETIME(3) NOT NULL,
  fecha_fin DATETIME(3) DEFAULT NULL,
  precio_contratado DECIMAL(10,2) NOT NULL,
  usuario_activo_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN estado = 'activa' THEN usuario_id ELSE NULL END) STORED,
  UNIQUE KEY uq_historial_suscripcion_activa (usuario_activo_id),
  KEY ix_historial_usuario_fecha (usuario_id, fecha_inicio),
  KEY ix_historial_plan (suscripcion_id),
  CONSTRAINT fk_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_historial_plan FOREIGN KEY (suscripcion_id) REFERENCES suscripciones(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_historial_fechas CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio),
  CONSTRAINT ck_historial_precio CHECK (precio_contratado >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS promociones (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  descripcion VARCHAR(2000) NOT NULL,
  destino VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_promociones_destino CHECK (destino IN ('/animes','/tienda')),
  CONSTRAINT ck_promociones_activa CHECK (activa IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
