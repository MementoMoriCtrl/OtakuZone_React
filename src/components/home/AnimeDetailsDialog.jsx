import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function AnimeDetailsDialog({ anime, onClose }) {
  const dialog = useRef(null)

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
        <p className="text-xs font-semibold tracking-wider text-neo-cyan">FICHA DEMOSTRATIVA</p>
        <button type="button" autoFocus onClick={() => dialog.current.close()} aria-label="Cerrar detalles" className="-mr-2 -mt-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neo-white/70 hover:bg-neo-slate focus-visible:outline-2 focus-visible:outline-neo-cyan"><X aria-hidden="true" className="size-5" /></button>
      </div>
      <h2 id="anime-dialog-title" className="mt-3 font-heading text-2xl font-semibold">{anime.title}</h2>
      <p className="mt-3 text-sm text-neo-cyan">{anime.genre}</p>
      <p className="mt-2 text-sm text-neo-white/65">{anime.season} · Puntuación de muestra: {anime.score.toFixed(1)}/10</p>
      <p className="mt-6 leading-relaxed text-neo-white/85">{anime.description}</p>
      <p id="anime-dialog-note" className="mt-6 rounded-lg border border-neo-violet/30 bg-neo-slate/40 p-4 text-sm leading-relaxed text-neo-white/65">Obra ficticia creada para este proyecto académico. La imagen, la sinopsis, la temporada y la puntuación son datos de muestra. No hay episodios disponibles.</p>
    </dialog>
  )
}
