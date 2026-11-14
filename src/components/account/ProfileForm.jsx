import FormField from '../common/FormField.jsx'
import useAuth from '../../hooks/useAuth.js'
import useValidatedForm from '../../hooks/useValidatedForm.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import { validateProfile } from '../../domain/validation.js'
import ActionMessage from '../common/ActionMessage.jsx'

export default function ProfileForm() {
  const auth = useAuth()
  const form = useValidatedForm({ name: auth.user.name, email: auth.user.email, bio: auth.user.bio }, validateProfile)
  const action = useAsyncAction()
  const save = (values) => action.run(() => auth.updateProfile({ name: values.name.trim(), bio: values.bio }), 'Perfil actualizado.')
  return <section aria-labelledby="profile-title" className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5 sm:p-7">
    <h2 id="profile-title" className="font-heading text-xl font-semibold">Datos del perfil</h2>
    <form noValidate onChange={action.reset} onSubmit={(event) => form.submit(event, save)} className="mt-6 space-y-5" aria-label="Perfil" aria-busy={action.loading}>
      <FormField label="Nombre de perfil" {...form.field('name')} required autoComplete="name" maxLength={60} />
      <FormField label="Correo electrónico" name="email" value={auth.user.email} readOnly type="email" hint="El correo no se puede cambiar desde este formulario." />
      <FormField label="Presentación" {...form.field('bio')} multiline maxLength={300} hint={`${form.values.bio.length}/300 caracteres. Opcional.`} />
      <button type="submit" disabled={action.loading} className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">{action.loading ? 'Guardando…' : 'Guardar perfil'}</button>
      <ActionMessage action={action} />
    </form>
  </section>
}
