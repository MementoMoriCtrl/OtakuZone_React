import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import MediaImage from '../common/MediaImage.jsx'
import useAuth from '../../hooks/useAuth.js'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import ActionMessage from '../common/ActionMessage.jsx'
import { addCartItem } from '../../services/commerce.js'
import { getProductDescription } from '../../data/productDescriptions.js'

const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

export default function ProductCard({ product, inStore = false }) {
  const { user } = useAuth()
  const action = useAsyncAction()
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-neo-white/10 bg-neo-slate/40 transition-colors hover:border-neo-violet/60 motion-reduce:transition-none">
      <div className="relative aspect-square overflow-hidden bg-neo-slate">
        <MediaImage src={product.image} alt={product.imageAlt} width="600" height="600" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" />
        <span className="absolute left-3 top-3 rounded-md border border-neo-white/15 bg-neo-midnight/85 px-2 py-1 text-[10px] font-medium tracking-wider text-neo-white/80">MUESTRA</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-neo-cyan">{product.category}</p>
        <h3 className="mb-5 mt-2 font-heading text-base font-semibold leading-relaxed">{product.name}</h3>
        <div className="mt-auto border-t border-neo-white/10 pt-4">
          <p className="text-xl font-semibold">{currency.format(product.price)}</p>
          <p className="mt-1 text-xs text-neo-white/55">Precio regular</p>
          {inStore && <><p className="mt-4 text-xs leading-relaxed text-neo-white/65">{getProductDescription(product)}</p><p className="mt-3 text-sm">{Number.isInteger(product.available) ? `Disponibles: ${product.available}` : 'Disponibilidad comercial no informada por este proveedor.'}</p>{user ? <button type="button" disabled={action.loading || !Number.isInteger(product.available) || product.available < 1} onClick={() => action.run(() => addCartItem(product.id), 'Producto agregado a tu carrito.')} className="mt-3 min-h-11 w-full rounded-lg bg-neo-violet px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-neo-cyan">Agregar al carrito</button> : <Link to="/cuenta" className="mt-3 inline-flex min-h-11 items-center text-sm text-neo-cyan">Inicia sesión para agregar</Link>}<ActionMessage action={action} /></>}
          <Link to={`/tienda/${product.id}`} aria-label={`Ver producto: ${product.name}, en Tienda Otaku`} className="mt-4 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-neo-violet/40 bg-neo-violet/10 px-3 py-2 text-sm font-medium transition-colors hover:border-neo-cyan/60 hover:text-neo-cyan focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">Ver producto<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
        </div>
      </div>
    </article>
  )
}
