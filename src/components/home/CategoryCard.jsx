import { ArrowUpRight, Compass, Heart, Laugh, Orbit, Sparkles, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'

const icons = { swords: Swords, compass: Compass, heart: Heart, sparkles: Sparkles, orbit: Orbit, laugh: Laugh }

export default function CategoryCard({ category }) {
  const Icon = icons[category.icon] ?? Sparkles
  return (
    <Link to={`/animes?genre=${encodeURIComponent(category.id)}`} aria-label={`Explorar ${category.name} en el catálogo`} className="group flex min-w-0 items-center gap-4 rounded-xl border border-neo-violet/20 bg-linear-to-br from-neo-slate/70 to-neo-midnight p-5 transition-colors hover:border-neo-cyan/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-neo-violet/25 bg-neo-violet/15 text-neo-cyan"><Icon aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0 flex-1"><h3 className="font-heading text-base font-semibold">{category.name}</h3><p className="mt-1 text-xs leading-relaxed text-neo-white/60">{category.description}</p></div>
      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-neo-white/45 group-hover:text-neo-cyan" />
    </Link>
  )
}
