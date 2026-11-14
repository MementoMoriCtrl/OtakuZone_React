import FormField from '../common/FormField.jsx'
import ActionMessage from '../common/ActionMessage.jsx'
import useValidatedForm from '../../hooks/useValidatedForm.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import useAuth from '../../hooks/useAuth.js'
import { validateLogin } from '../../domain/validation.js'

export default function LoginForm({ onSuccess }) {
  const auth = useAuth()
  const form = useValidatedForm({ email: '', password: '' }, validateLogin)
  const action = useAsyncAction()
  const login = async (values) => {
    if (await action.run(() => auth.login({ email: values.email.trim(), password: values.password }))) { form.reset({ email: '', password: '' }); onSuccess() }
  }
  return <section aria-labelledby="login-title" className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5 sm:p-7">
    <h2 id="login-title" className="font-heading text-xl font-semibold">Iniciar sesión</h2>
    <form noValidate onSubmit={(event) => form.submit(event, login)} onChange={action.reset} className="mt-6 space-y-5" aria-label="Iniciar sesión" aria-busy={action.loading}>
      <FormField label="Correo electrónico" {...form.field('email')} type="email" required autoComplete="username" maxLength={254} />
      <FormField label="Contraseña" {...form.field('password')} type="password" required autoComplete="current-password" maxLength={72} />
      <button type="submit" disabled={action.loading} className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">{action.loading ? 'Entrando…' : 'Iniciar sesión'}</button>
      <ActionMessage action={action} />
    </form>
  </section>
}
