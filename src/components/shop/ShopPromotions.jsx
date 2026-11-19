import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import SectionHeading from '../common/SectionHeading.jsx'
import ResourceState from '../common/ResourceState.jsx'

export default function ShopPromotions({ resource }) {
  const seen = new Set()
  const items = (resource.data ?? []).filter(item => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.description !== 'string' || !item.description.trim()
      || !['/animes', '/tienda'].includes(item.to)) return false
    seen.add(item.id)
    return true
  })
  return <section aria-labelledby="shop-promotions-title" aria-busy={resource.loading}>
    <SectionHeading id="shop-promotions-title" eyebrow="EXPLORA OTAKUZONE" title="Promociones" />
    <ResourceState resource={resource} empty={!items.length} emptyMessage="No hay promociones disponibles por ahora." />
    {!resource.loading && !resource.error && <div className="grid gap-4 md:grid-cols-2">
      {items.map(item => <article key={item.id} className="flex min-w-0 flex-col rounded-xl border border-neo-violet/40 bg-linear-to-br from-neo-violet/10 to-neo-slate/40 p-5 sm:p-6">
        <h3 className="wrap-break-word font-heading text-lg font-semibold text-neo-white">{item.title}</h3>
        <p className="mt-3 wrap-break-word text-sm leading-relaxed text-neo-white/70">{item.description}</p>
        <Link to={item.to} aria-label={`Explorar: ${item.title}`} className="mt-5 inline-flex min-h-11 items-center justify-between gap-3 rounded-lg border border-neo-cyan/30 px-4 py-2 text-sm font-medium text-neo-cyan transition-colors hover:border-neo-cyan hover:bg-neo-cyan/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">
          {item.to === '/animes' ? 'Explorar animes' : 'Explorar tienda'}<ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </article>)}
    </div>}
  </section>
}
