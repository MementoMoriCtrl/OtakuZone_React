import { ArrowUpRight, Star } from 'lucide-react'

export default function AnimeCard({ anime, isNew = false, onDetails }) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-neo-white/10 bg-neo-slate/40 transition-colors hover:border-neo-violet/60 motion-reduce:transition-none">
      <div className="relative aspect-[3/4] overflow-hidden bg-neo-slate">
        <img src={anime.image} alt={anime.imageAlt} width="600" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-neo-midnight/85 to-transparent" />
        {isNew && <span className="absolute left-3 top-3 rounded-md border border-neo-cyan/40 bg-neo-midnight/90 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-neo-cyan">NOVEDAD · DEMO</span>}
        <span aria-label={`Puntuación de muestra: ${anime.score} de 10`} className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-md bg-neo-midnight/90 px-2 py-1 text-xs font-semibold text-neo-cyan"><Star aria-hidden="true" className="size-3.5" />{anime.score.toFixed(1)}<span className="text-neo-white/55">/10</span></span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs leading-relaxed text-neo-cyan">{anime.genre}</p>
        <h3 className="mt-2 font-heading text-lg font-semibold leading-snug">{anime.title}</h3>
        <p className="mt-2 text-xs text-neo-white/55">{anime.season}</p>
        <p className="mb-5 mt-3 text-sm leading-relaxed text-neo-white/70">{anime.description}</p>
        <button type="button" onClick={() => onDetails(anime)} aria-label={`Consultar detalles de ${anime.title}, ${anime.season}`} className="mt-auto inline-flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border-t border-neo-white/10 pt-3 text-left text-sm font-medium text-neo-white transition-colors hover:text-neo-cyan focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">Consultar detalles<ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-neo-cyan" /></button>
      </div>
    </article>
  )
}
