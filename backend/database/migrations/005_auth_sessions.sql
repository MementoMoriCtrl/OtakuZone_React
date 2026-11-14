-- Solo sesiones revocables. Reutiliza usuarios/roles de Fase 5 sin duplicarlos.
CREATE TABLE IF NOT EXISTS auth_sesiones (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  creada_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_en DATETIME(3) NOT NULL,
  revocada_en DATETIME(3) DEFAULT NULL,
  KEY ix_auth_sesiones_usuario (usuario_id),
  KEY ix_auth_sesiones_expiracion (expira_en),
  CONSTRAINT fk_auth_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_auth_sesiones_expiracion CHECK (expira_en > creada_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
