import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useResource from '../hooks/useResource.js'
import useAsyncAction from '../hooks/useAsyncAction.js'
import ResourceState from '../components/common/ResourceState.jsx'
import ActionMessage from '../components/common/ActionMessage.jsx'
import ShopNavigation from '../components/common/ShopNavigation.jsx'
import { getCart, setCartQuantity, removeCartItem, createOrder, money } from '../services/commerce.js'

export default function Carrito() {
  const resource = useResource(getCart)
  const action = useAsyncAction()
  const checkout = useRef(null)
  const navigate = useNavigate()
  const cart = resource.data
  const change = (operation) => action.run(async () => { await operation(); checkout.current = null; resource.retry() })
  const order = () => action.run(async () => {
    if (checkout.current?.cartId !== cart.id) checkout.current = { cartId: cart.id, key: crypto.randomUUID() }
    const result = await createOrder(cart.id, checkout.current.key)
    navigate(`/pedidos/${result.id}`)
  })
  return <div className="space-y-6"><h1 className="font-heading text-3xl font-semibold">Mi carrito</h1><ShopNavigation /><p className="text-sm text-neo-white/70">No se realizan cobros ni envíos reales. El carrito no reserva existencias; los precios y la disponibilidad se comprueban al confirmar. El importe de envío mostrado no corresponde a una entrega real.</p><ResourceState resource={resource} empty={cart?.items.length === 0} emptyMessage="Tu carrito está vacío. Agrega productos desde la tienda." /><ActionMessage action={action} />
    {cart && !resource.loading && !resource.error && <><div className="space-y-4">{cart.items.map((item) => <article key={item.productId} className="space-y-3 rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-4"><h2 className="font-heading font-semibold">{item.name}</h2><p className="text-sm">{money(item.price)} por unidad · Disponibles: {item.available}</p>{(!item.active || item.quantity > item.available) && <p role="status" className="text-sm text-neo-cyan">Producto no disponible en la cantidad elegida. Actualiza o elimina la línea.</p>}<form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const quantity = Number(new FormData(event.currentTarget).get('quantity')); change(() => setCartQuantity(item.productId, quantity)) }}><label className="text-sm">Cantidad<input key={`${item.productId}-${item.quantity}`} name="quantity" aria-label={`Cantidad de ${item.name}`} type="number" min="1" max="99" required defaultValue={item.quantity} className="ml-3 w-20 rounded border border-neo-violet/40 bg-neo-midnight p-2" /></label><button disabled={action.loading} className="min-h-11 rounded border border-neo-cyan/40 px-3 disabled:opacity-50">Actualizar</button><button type="button" disabled={action.loading} onClick={() => change(() => removeCartItem(item.productId))} className="min-h-11 rounded border border-neo-violet/40 px-3 disabled:opacity-50">Quitar</button></form><p>Subtotal: {money(item.subtotal)}</p></article>)}</div><div className="space-y-2 rounded-xl border border-neo-cyan/30 p-5"><p>Subtotal: {money(cart.subtotal)}</p><p>Envío: {money(cart.shipping)}</p><p className="text-xl font-semibold">Total: {money(cart.total)}</p><button type="button" disabled={!cart.items.length || action.loading} onClick={order} className="mt-3 min-h-12 rounded-lg bg-neo-violet px-5 py-3 font-semibold disabled:opacity-50">{action.loading ? 'Procesando…' : 'Confirmar pedido'}</button></div></>}
    <Link to="/tienda" className="inline-flex min-h-11 items-center text-neo-cyan">Seguir explorando productos</Link>
  </div>
}
