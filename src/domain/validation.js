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
  if (password.length < 8 || new TextEncoder().encode(password).length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Usa al menos 8 caracteres, una letra y un número; máximo 72 bytes.'
  if (!values.confirmPassword || values.confirmPassword !== password) errors.confirmPassword = 'Las contraseñas deben coincidir.'
  return errors
}

export function validateLogin(values) {
  const errors = {}
  if (validateProfile({ name: 'Cuenta', email: values.email }).email) errors.email = 'Escribe un correo electrónico válido.'
  if (!values.password || new TextEncoder().encode(values.password).length > 72) errors.password = 'Escribe tu contraseña (máximo 72 bytes).'
  return errors
}
