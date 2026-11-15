import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import ProfileForm from './ProfileForm.jsx'
import ActionMessage from '../common/ActionMessage.jsx'
import ShopNavigation from '../common/ShopNavigation.jsx'

export default function SessionAccount() {
  const auth = useAuth()
  const action = useAsyncAction()
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neo-cyan/25 bg-neo-slate/30 p-5"><p className="min-w-0 break-words text-sm">Sesión activa: <strong>{auth.user.name}</strong></p><button type="button" disabled={action.loading} onClick={() => action.run(auth.logout)} className="min-h-11 cursor-pointer rounded-lg border border-neo-cyan/40 px-4 py-2 text-sm text-neo-cyan disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-neo-cyan">Cerrar sesión</button></div>
    <ActionMessage action={action} />
    <ProfileForm key={auth.user.id} />
    <ShopNavigation />
    <div className="flex flex-wrap gap-4"><Link to="/favoritos" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-neo-cyan focus-visible:outline-2 focus-visible:outline-neo-cyan">Ver mis favoritos</Link>{auth.user.role === 'ADMIN' && <Link to="/admin" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-neo-cyan focus-visible:outline-2 focus-visible:outline-neo-cyan">Administración</Link>}</div>
  </div>
}
