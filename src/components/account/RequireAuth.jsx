import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth.js'

export default function RequireAuth({ role }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading || auth.error) return <section><h1 className="font-heading text-3xl font-semibold">{role === 'ADMIN' ? 'Administración' : 'Mi perfil'}</h1>{auth.loading ? <p role="status" className="mt-4 text-neo-cyan">Comprobando sesión…</p> : <div role="alert" className="mt-4"><p>{auth.error}</p><button type="button" onClick={auth.refresh} className="mt-4 min-h-11 cursor-pointer rounded-lg bg-neo-violet px-4 py-2">Reintentar</button></div>}</section>
  if (!auth.user) return <Navigate to="/cuenta" replace state={{ from: location.pathname }} />
  if (role && auth.user.role !== role) return <section><h1 className="font-heading text-3xl font-semibold">Acceso restringido</h1><p role="alert" className="mt-4 text-sm">No tienes permisos para acceder a esta página.</p><Link to="/perfil" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-neo-violet px-4 py-2 text-sm">Volver a mi perfil</Link></section>
  return <Outlet />
}
