import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import useResource from '../../hooks/useResource.js'
import { getCatalogDetails } from '../../services/animeCatalog.js'
import ResourceState from '../common/ResourceState.jsx'
import FavoriteButton from '../common/FavoriteButton.jsx'
import MediaImage from '../common/MediaImage.jsx'

export default function AnimeDetailsDialog({ anime, onClose }) {
  const dialog = useRef(null)
  const loader = useCallback((options) => getCatalogDetails(anime, options), [anime])
  const resource = useResource(loader)
  const details = resource.data

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  const closeOnBackdrop = (event) => {
    if (event.target !== event.currentTarget) return
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
      event.currentTarget.close()
    }
  }

  return (
    <dialog ref={dialog} onClose={() => { if (!dialog.current?.open) onClose() }} onClick={closeOnBackdrop} aria-labelledby="anime-dialog-title" aria-describedby="anime-dialog-note" className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-neo-violet/50 bg-neo-midnight p-6 text-neo-white shadow-2xl backdrop:bg-neo-midnight/85 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold tracking-wider text-neo-cyan">{anime.source === 'demo' ? 'EJEMPLO · OBRA FICTICIA' : anime.source === 'jikan' ? 'FICHA GUARDADA' : 'FICHA DE ANIME'}</p>
        <button type="button" autoFocus onClick={() => dialog.current.close()} aria-label="Cerrar detalles" className="-mr-2 -mt-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neo-white/70 hover:bg-neo-slate focus-visible:outline-2 focus-visible:outline-neo-cyan"><X aria-hidden="true" className="size-5" /></button>
      </div>
      <h2 id="anime-dialog-title" className="mt-3 font-heading text-2xl font-semibold">{anime.title}</h2>
      <div className="mt-4"><FavoriteButton anime={anime} /></div>
      <div className="mt-6"><ResourceState resource={resource} /></div>
      {details && <>
        {details.banner && <MediaImage src={details.banner} alt={`Banner de ${details.title}`} loading="lazy" className="mt-4 w-full rounded-lg object-cover" />}
        <p className="mt-3 text-sm text-neo-cyan">{details.genre}</p>
        <p className="mt-2 text-sm text-neo-white/65">{details.season} · Puntuación: {details.score?.toFixed(1) ?? 'No disponible'}</p>
        <p className="mt-2 text-sm text-neo-white/65">{details.status} · Episodios: {details.episodes ?? 'No disponibles'}</p>
        <p className="mt-6 whitespace-pre-line leading-relaxed text-neo-white/85">{anime.source === 'demo' ? `${details.title} es una obra ficticia del catálogo de ejemplo. Sus puntuaciones y estados son orientativos; las ilustraciones pueden repetirse.` : details.description}</p>
        {details.format && <p className="mt-3 text-sm text-neo-white/65">Formato: {details.format}{details.startDate?.year ? ` · Inicio: ${[details.startDate.year,details.startDate.month,details.startDate.day].filter(v=>v!=null).join('-')}` : ''}</p>}
        {!!details.characters?.length && <section className="mt-6"><h3 className="font-heading font-semibold">Personajes principales</h3><ul className="mt-3 grid grid-cols-2 gap-3">{details.characters.map(c=><li key={c.id} className="min-w-0 text-sm">{c.image&&<MediaImage src={c.image} alt={c.name} loading="lazy" className="mb-2 h-24 rounded object-cover"/>}{c.name}</li>)}</ul></section>}
        {!!details.related?.length && <section className="mt-6"><h3 className="font-heading font-semibold">Animes y temporadas relacionados</h3><ul className="mt-3 space-y-2 text-sm">{details.related.map(r=><li key={`${r.relation}:${r.id}`}>{r.title} · {r.relation}{r.year?` · ${r.season??''} ${r.year}`:''}</li>)}</ul></section>}
      </>}
      <p id="anime-dialog-note" className="mt-6 rounded-lg border border-neo-violet/30 bg-neo-slate/40 p-4 text-sm leading-relaxed text-neo-white/65">{anime.source === 'demo' ? 'Esta obra es ficticia y forma parte del catálogo de ejemplo. Su información e ilustraciones son orientativas.' : anime.source === 'jikan' ? 'Esta ficha se guardó anteriormente y su información puede estar desactualizada.' : 'La sinopsis puede estar en inglés.'} OtakuZone no ofrece reproducción de episodios.</p>
    </dialog>
  )
}
