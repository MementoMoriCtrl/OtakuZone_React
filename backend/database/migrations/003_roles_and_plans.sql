-- No se crean usuarios, contraseñas ni suscripciones de usuarios.
INSERT INTO roles (codigo, nombre) VALUES
  ('cliente', 'Cliente'), ('administrador', 'Administrador')
ON DUPLICATE KEY UPDATE codigo = codigo;

INSERT INTO suscripciones (codigo, nombre, precio_mensual) VALUES
  ('free', 'Free demostrativo', 0.00), ('premium', 'Premium demostrativo', 19.90)
ON DUPLICATE KEY UPDATE codigo = codigo;
