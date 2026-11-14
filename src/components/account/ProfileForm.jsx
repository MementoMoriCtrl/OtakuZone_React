import { useState } from 'react'
import FormField from '../common/FormField.jsx'
import { saveProfile } from '../../services/localRepository.js'

export default function ProfileForm({ form, loadError }) {
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(loadError)
  const save = (values) => {
    const failure = saveProfile(values)
    setError(failure)
    setSaved(failure ? null : { values, message: 'Perfil demostrativo guardado en este navegador. No se ha enviado a un servidor.' })
  }
  return <section aria-labelledby="profile-title" className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5 sm:p-7">
    <h2 id="profile-title" className="font-heading text-xl font-semibold">Perfil local</h2>
    <p className="mt-3 text-sm leading-relaxed text-neo-white/70">Datos básicos provisionales de este navegador. No son una cuenta autenticada.</p>
    <form noValidate onChange={() => setSaved(null)} onSubmit={(event) => form.submit(event, save)} className="mt-6 space-y-5" aria-label="Perfil local">
      <FormField label="Nombre de perfil" {...form.field('name')} required autoComplete="name" maxLength={60} />
      <FormField label="Correo del perfil" {...form.field('email')} type="email" required autoComplete="email" maxLength={254} />
      <FormField label="Presentación" {...form.field('bio')} multiline maxLength={300} hint={`${form.values.bio.length}/300 caracteres. Opcional.`} />
      <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Guardar perfil</button>
      {error && <p role="alert" className="rounded-lg border border-neo-violet/40 p-4 text-sm leading-relaxed">{error}</p>}
      {saved?.values === form.values && <p role="status" className="rounded-lg border border-neo-cyan/30 p-4 text-sm leading-relaxed text-neo-cyan">{saved.message}</p>}
    </form>
  </section>
}
