import useResource from '../hooks/useResource.js'
import { NavLink,useParams } from 'react-router-dom'
import { adminDashboard } from '../services/admin.js'
import ResourceState from '../components/common/ResourceState.jsx'
import ProductManager from '../components/admin/ProductManager.jsx'
import CategoryManager from '../components/admin/CategoryManager.jsx'
import InventoryManager from '../components/admin/InventoryManager.jsx'
import OrderManager from '../components/admin/OrderManager.jsx'
import UserManager from '../components/admin/UserManager.jsx'
const sections=[['','Resumen'],['productos','Productos'],['categorias','Categorías'],['inventario','Inventario'],['pedidos','Pedidos'],['usuarios','Usuarios']]
const modules={productos:ProductManager,categorias:CategoryManager,inventario:InventoryManager,pedidos:OrderManager,usuarios:UserManager}
export default function Admin() {
  const {section=''}=useParams()
  const resource = useResource(adminDashboard)
  const Module=modules[section]
  return <div className="space-y-8"><header className="rounded-2xl border border-neo-violet/40 bg-neo-slate/30 p-5 sm:p-8"><p className="text-xs tracking-widest text-neo-cyan">NEO TOKYO · CONTROL CENTRAL</p><h1 className="mt-3 font-heading text-3xl font-semibold">Administración{section?` · ${sections.find(([s])=>s===section)?.[1]??'Sección desconocida'}`:''}</h1><p className="mt-3 text-sm text-neo-white/65">Gestión privada de OtakuZone · Solo administradores</p></header><nav aria-label="Administración" className="flex flex-wrap gap-2">{sections.map(([path,label])=><NavLink key={path} end to={`/admin${path?'/'+path:''}`} className={({isActive})=>`min-h-11 rounded-lg border px-4 py-3 text-sm ${isActive?'border-neo-cyan/60 bg-neo-cyan/10 text-neo-cyan':'border-neo-violet/30 text-neo-white/75 hover:border-neo-cyan/50'}`}>{label}</NavLink>)}</nav>{Module?<Module key={section}/>:section?<p role="alert">La sección solicitada no existe.</p>:<><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-xl">Estado de la plataforma</h2><button onClick={resource.retry} className="min-h-11 rounded-lg border border-neo-cyan/40 px-4 text-sm text-neo-cyan">Actualizar indicadores</button></div><ResourceState resource={resource}/>{resource.data&&<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Usuarios',resource.data.users],['Productos',resource.data.products],['Bajo inventario (≤5)',resource.data.lowStock],['Pedidos registrados',resource.data.orders],['Pedidos pendientes',resource.data.pendingOrders],['Suscripciones activas',resource.data.activeSubscriptions]].map(([label,value])=><div key={label} className="rounded-xl border border-neo-violet/30 bg-neo-slate/40 p-6"><dt className="text-sm text-neo-white/70">{label}</dt><dd className="mt-3 text-4xl font-semibold text-neo-cyan">{value}</dd></div>)}</dl>}<p className="text-xs text-neo-white/55">Bajo inventario: productos activos con cinco unidades disponibles o menos.</p></>}</div>
}
