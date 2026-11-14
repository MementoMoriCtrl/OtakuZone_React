import { useState } from 'react'
import FormField from '../common/FormField.jsx'
import useValidatedForm from '../../hooks/useValidatedForm.js'
import { validateRegistration } from '../../domain/validation.js'

const initialValues = { name: '', email: '', password: '', confirmPassword: '' }
export default function RegistrationForm({ onValid }) {
  const form = useValidatedForm(initialValues, validateRegistration)
  const [success, setSuccess] = useState('')
  const register = (values) => {
    onValid({ name: values.name.trim(), email: values.email.trim() })
    form.reset({ ...values, password: '', confirmPassword: '' })
    setSuccess('Registro demostrativo validado. No se creó una cuenta real. Nombre y correo están preparados en el perfil; pulsa Guardar perfil para conservarlos localmente.')
  }
  return <section aria-labelledby="registration-title" className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5 sm:p-7">
    <h2 id="registration-title" className="font-heading text-xl font-semibold">Registro demostrativo</h2>
    <p className="mt-3 text-sm leading-relaxed text-neo-white/70">Solo valida el formulario en este dispositivo. No hay autenticación, envío de correos ni registro en un servidor. Usa una contraseña de prueba; no se guarda ni se transmite.</p>
    <form noValidate onChange={() => setSuccess('')} onSubmit={(event) => form.submit(event, register)} className="mt-6 space-y-5" aria-label="Registro demostrativo">
      <FormField label="Nombre" {...form.field('name')} required autoComplete="name" maxLength={60} />
      <FormField label="Correo electrónico" {...form.field('email')} type="email" required autoComplete="email" maxLength={254} />
      <FormField label="Contraseña de prueba" {...form.field('password')} type="password" required autoComplete="new-password" maxLength={128} hint="De 8 a 128 caracteres, al menos una letra y un número." />
      <FormField label="Confirmar contraseña" {...form.field('confirmPassword')} type="password" required autoComplete="new-password" maxLength={128} />
      <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Validar registro demo</button>
      {success && <p role="status" className="rounded-lg border border-neo-cyan/30 p-4 text-sm leading-relaxed text-neo-cyan">{success}</p>}
    </form>
  </section>
}
