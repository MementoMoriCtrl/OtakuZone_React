import RegistrationForm from '../components/account/RegistrationForm.jsx'
import LoginForm from '../components/account/LoginForm.jsx'
import SessionAccount from '../components/account/SessionAccount.jsx'
import useAuth from '../hooks/useAuth.js'
import { useLocation, useNavigate } from 'react-router-dom'

export default function MiCuenta() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const entered = () => navigate(['/perfil', '/admin'].includes(location.state?.from) ? location.state.from : '/perfil', { replace: true })
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">TU ESPACIO OTAKUZONE</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Mi Cuenta<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Accede a tu perfil o crea una cuenta.</p></div>
    {auth.loading ? <p role="status" className="text-sm text-neo-cyan">Comprobando sesión…</p> : <>
      {auth.error && <div role="alert" className="rounded-lg border border-neo-violet/40 p-4 text-sm"><p>{auth.error}</p><button type="button" onClick={auth.refresh} className="mt-3 min-h-11 cursor-pointer rounded-lg bg-neo-violet px-4 py-2 focus-visible:outline-2 focus-visible:outline-neo-cyan">Reintentar</button></div>}
      {auth.user ? <SessionAccount /> : <div className="grid items-start gap-6 lg:grid-cols-2"><LoginForm onSuccess={entered} /><RegistrationForm onSuccess={entered} /></div>}
    </>}
  </div>
}
