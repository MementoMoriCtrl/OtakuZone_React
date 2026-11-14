import useAdminList from '../../hooks/useAdminList.js'
import { useState } from 'react'
import { adminOrder,adminWrite } from '../../services/admin.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import ActionMessage from '../common/ActionMessage.jsx'
import { Collection,Record,buttonClass } from './AdminShared.jsx'
export default function OrderManager(){const resource=useAdminList('orders'),action=useAsyncAction();const [detail,setDetail]=useState(null)
  const open=id=>action.run(async()=>setDetail(await adminOrder(id)))
  const change=status=>action.run(async()=>{await adminWrite(`orders/${detail.id}/status`,'PATCH',{status,expectedStatus:detail.status});setDetail(await adminOrder(detail.id));resource.retry()},'Estado de pedido actualizado.')
  return <div className="space-y-6"><p className="text-sm text-neo-white/70">Confirmado → completado o cancelado; pendiente → cancelado. Los estados finales no se reabren. Cancelar un pedido confirmado restituye su inventario una sola vez.</p><ActionMessage action={action}/>{detail&&<section className="space-y-4 rounded-xl border border-neo-cyan/40 bg-neo-slate/40 p-5" aria-label="Detalle administrativo del pedido"><h2 className="font-heading text-xl">Pedido #{detail.id} · {detail.status}</h2><p>{detail.customer} · {detail.email}</p>{detail.items.map(p=><p key={p.productId}>{p.name} · {p.quantity} × S/ {p.price} = S/ {p.subtotal}</p>)}<p>Envío: S/ {detail.shipping}</p><p>Total: S/ {detail.total}</p><div className="flex flex-wrap gap-3">{detail.allowedTransitions.map(s=><button key={s} className={buttonClass} disabled={action.loading} onClick={()=>change(s)}>Marcar {s}</button>)}<button className={buttonClass} onClick={()=>setDetail(null)}>Cerrar detalle</button></div><ol className="space-y-2 text-sm">{detail.history.map((h,i)=><li key={i}>{h.status} · {new Date(h.createdAt).toLocaleString('es-PE')}</li>)}</ol></section>}<Collection resource={resource}>{o=><Record key={o.id} title={`Pedido #${o.id}`}><p>{o.customer} · {o.email}</p><p>{o.status} · S/ {o.total}</p><button className={buttonClass} disabled={action.loading} onClick={()=>open(o.id)}>Ver pedido</button></Record>}</Collection></div>
}
