const fields = 'CAST(u.id AS CHAR) AS id, u.nombre AS name, u.email, u.presentacion AS bio, r.codigo AS roleCode'
export const authSql = Object.freeze({
  byEmail: `SELECT ${fields}, u.password_hash AS passwordHash, u.estado AS state FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.email = ?`,
  byId: `SELECT ${fields} FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ? AND u.estado = 'activo'`,
  clientRole: 'SELECT id FROM roles WHERE codigo = ?',
  register: "INSERT INTO usuarios (rol_id, nombre, email, password_hash, estado) VALUES (?, ?, ?, ?, 'activo')",
  insertSession: 'INSERT INTO auth_sesiones (id, usuario_id, expira_en) VALUES (?, ?, ?)',
  session: `SELECT ${fields}, s.expira_en AS expiresAt FROM auth_sesiones s JOIN usuarios u ON u.id = s.usuario_id JOIN roles r ON r.id = u.rol_id WHERE s.id = ? AND s.usuario_id = ? AND s.revocada_en IS NULL AND s.expira_en > UTC_TIMESTAMP(3) AND u.estado = 'activo'`,
  revoke: 'UPDATE auth_sesiones SET revocada_en = UTC_TIMESTAMP(3) WHERE id = ? AND usuario_id = ? AND revocada_en IS NULL',
  profile: 'UPDATE usuarios SET nombre = ?, presentacion = ? WHERE id = ? AND estado = ?',
  overview: 'SELECT (SELECT COUNT(*) FROM usuarios) AS users, (SELECT COUNT(*) FROM productos) AS products, (SELECT COUNT(*) FROM auth_sesiones WHERE revocada_en IS NULL AND expira_en > UTC_TIMESTAMP(3)) AS sessions',
})
