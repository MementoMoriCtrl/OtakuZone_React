import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import useResource from '../hooks/useResource.js'
import ResourceState from '../components/common/ResourceState.jsx'
import ShopNavigation from '../components/common/ShopNavigation.jsx'
import { getOrders, getOrder, money } from '../services/commerce.js'

export default function Pedidos() {
  const { id } = useParams()
  const loader = useCallback((options) => id ? getOrder(id, options) : getOrders(options), [id])
  const resource = useResource(loader)
  const data = resource.data
  return <div className="space-y-6"><h1 className="font-heading text-3xl font-semibold">{id ? `Pedido #${id}` : 'Mis pedidos'}</h1><ShopNavigation /><p className="text-sm text-neo-white/70">Historial académico de pedidos simulados, sin cobros ni envíos reales. Se muestran hasta 100 pedidos recientes.</p><ResourceState resource={resource} empty={Array.isArray(data) && !data.length} emptyMessage="Todavía no tienes pedidos." />
    {data && !resource.loading && !resource.error && (id ? <section className="space-y-4 rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-5"><p>Estado: <strong>{data.status}</strong></p>{data.items.map((item) => <div key={item.productId} className="border-b border-neo-white/10 py-3"><h2 className="font-semibold">{item.name}</h2><p className="text-sm">{item.quantity} × {money(item.price)} · {money(item.subtotal)}</p></div>)}<p>Subtotal: {money(data.subtotal)} · Envío: {money(data.shipping)}</p><p className="text-xl font-semibold">Total: {money(data.total)}</p><h2 className="pt-3 font-heading font-semibold">Historial de estados</h2><ol className="space-y-2 text-sm">{data.history.map((event, index) => <li key={index}>{event.status} · {new Date(event.createdAt).toLocaleString('es-PE')}</li>)}</ol></section> : <div className="space-y-4">{data.map((order) => <article key={order.id} className="rounded-xl border border-neo-violet/30 p-5"><Link to={`/pedidos/${order.id}`} className="inline-flex min-h-11 items-center font-semibold text-neo-cyan">Pedido #{order.id}</Link><p>{order.status} · {money(order.total)}</p><p className="mt-2 text-sm text-neo-white/65">{new Date(order.createdAt).toLocaleString('es-PE')}</p></article>)}</div>)}
  </div>
}
