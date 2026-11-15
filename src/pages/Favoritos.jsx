import { Link } from 'react-router-dom'
import AnimeCollection from '../components/home/AnimeCollection.jsx'
import useFavorites from '../hooks/useFavorites.js'

export default function Favoritos() {
  const { items } = useFavorites()
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">TU SELECCIÓN PERSONAL</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Favoritos<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Tus favoritos se guardan en este navegador y no se sincronizan con tu cuenta. Algunas fichas guardadas anteriormente pueden contener información desactualizada.</p></div>
    <p role="status" className="text-sm text-neo-cyan">{items.length} {items.length === 1 ? 'favorito guardado' : 'favoritos guardados'}</p>
    {items.length ? <AnimeCollection anime={items} /> : <div className="rounded-xl border border-neo-violet/30 bg-neo-slate/30 p-6"><p>Aún no tienes favoritos. Guarda un anime desde el catálogo o su ficha.</p><Link to="/animes" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-neo-violet px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-neo-cyan">Explorar animes</Link></div>}
  </div>
}
