export function validateProfile(values) {
  const errors = {}
  const name = String(values.name ?? '').trim()
  const email = String(values.email ?? '').trim()
  if (name.length < 2 || name.length > 60) errors.name = 'Escribe un nombre de entre 2 y 60 caracteres.'
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Escribe un correo válido, por ejemplo nombre@dominio.com.'
  if (String(values.bio ?? '').length > 300) errors.bio = 'La presentación debe tener como máximo 300 caracteres.'
  return errors
}

export function validateRegistration(values) {
  const errors = validateProfile(values)
  const password = values.password ?? ''
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Usa entre 8 y 128 caracteres, con al menos una letra y un número.'
  if (!values.confirmPassword || values.confirmPassword !== password) errors.confirmPassword = 'Las contraseñas deben coincidir.'
  return errors
}
