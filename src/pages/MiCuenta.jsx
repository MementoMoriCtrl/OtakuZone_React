import { useState } from 'react'
import RegistrationForm from '../components/account/RegistrationForm.jsx'
import ProfileForm from '../components/account/ProfileForm.jsx'
import { readProfile } from '../services/localRepository.js'
import useValidatedForm from '../hooks/useValidatedForm.js'
import { validateProfile } from '../domain/validation.js'

export default function MiCuenta() {
  const [initial] = useState(() => readProfile())
  const profileForm = useValidatedForm(initial.data, validateProfile)
  const prepareProfile = ({ name, email }) => profileForm.reset({ ...profileForm.values, name, email })
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">DEMOSTRACIÓN · SIN AUTENTICACIÓN</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Mi Cuenta<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Prueba el registro y prepara tu perfil básico. Solo el perfil validado se guarda localmente; las contraseñas nunca se persisten.</p></div>
    <div className="grid items-start gap-6 lg:grid-cols-2"><RegistrationForm onValid={prepareProfile} /><ProfileForm form={profileForm} loadError={initial.error} /></div>
  </div>
}
