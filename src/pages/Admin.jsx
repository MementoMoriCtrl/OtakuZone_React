import useResource from '../hooks/useResource.js'
import { getAdminOverview } from '../services/auth.js'
import ResourceState from '../components/common/ResourceState.jsx'
export default function Admin() {
  const resource = useResource(getAdminOverview)
  return <div className="space-y-8"><div><p className="text-xs text-neo-cyan">ACCESO ADMIN</p><h1 className="mt-3 font-heading text-3xl font-semibold">Administración</h1></div><ResourceState resource={resource} />{resource.data && <dl className="grid gap-4 sm:grid-cols-3">{[['Usuarios', resource.data.users], ['Productos', resource.data.products], ['Sesiones activas', resource.data.sessions]].map(([name, value]) => <div key={name} className="rounded-xl border border-neo-violet/30 bg-neo-slate/40 p-6"><dt className="text-sm text-neo-white/70">{name}</dt><dd className="mt-2 text-3xl text-neo-cyan">{value}</dd></div>)}</dl>}</div>
}
