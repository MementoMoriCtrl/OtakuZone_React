import FormField from '../common/FormField.jsx'
import useValidatedForm from '../../hooks/useValidatedForm.js'
import { validateRegistration } from '../../domain/validation.js'
import useAuth from '../../hooks/useAuth.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import ActionMessage from '../common/ActionMessage.jsx'

const initialValues = { name: '', email: '', password: '', confirmPassword: '' }
export default function RegistrationForm({ onSuccess }) {
  const form = useValidatedForm(initialValues, validateRegistration)
  const auth = useAuth()
  const action = useAsyncAction()
  const register = async (values) => {
    const ok = await action.run(() => auth.register({ name: values.name.trim(), email: values.email.trim(), password: values.password }))
    if (ok) { form.reset(initialValues); onSuccess() }
  }
  return <section aria-labelledby="registration-title" className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5 sm:p-7">
    <h2 id="registration-title" className="font-heading text-xl font-semibold">Crear cuenta</h2>
    <p className="mt-3 text-sm leading-relaxed text-neo-white/70">Regístrate para acceder a tu perfil de OtakuZone.</p>
    <form noValidate onChange={action.reset} onSubmit={(event) => form.submit(event, register)} className="mt-6 space-y-5" aria-label="Registro" aria-busy={action.loading}>
      <FormField label="Nombre" {...form.field('name')} required autoComplete="name" maxLength={60} />
      <FormField label="Correo electrónico" {...form.field('email')} type="email" required autoComplete="email" maxLength={254} />
      <FormField label="Contraseña" {...form.field('password')} type="password" required autoComplete="new-password" maxLength={72} hint="Al menos 8 caracteres, una letra y un número. Máximo 72 bytes; algunos caracteres ocupan más de uno." />
      <FormField label="Confirmar contraseña" {...form.field('confirmPassword')} type="password" required autoComplete="new-password" maxLength={72} />
      <button type="submit" disabled={action.loading} className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">{action.loading ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      <ActionMessage action={action} />
    </form>
  </section>
}
