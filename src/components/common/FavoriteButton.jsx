import { Heart } from 'lucide-react'
import useFavorites from '../../hooks/useFavorites.js'
import { favoriteKey } from '../../domain/favorites.js'

export default function FavoriteButton({ anime }) {
  const { items, toggle } = useFavorites()
  const saved = items.some((item) => favoriteKey(item) === favoriteKey(anime))
  return <button type="button" aria-pressed={saved} aria-label={`${saved ? 'Quitar' : 'Agregar'} ${anime.title} ${saved ? 'de' : 'a'} favoritos`} onClick={() => toggle(anime)} className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neo-cyan ${saved ? 'border-neo-cyan/60 bg-neo-cyan/10 text-neo-cyan' : 'border-neo-violet/40 text-neo-white/80 hover:border-neo-cyan/60'}`}><Heart aria-hidden="true" className={`size-4 shrink-0 ${saved ? 'fill-neo-cyan' : ''}`} />{saved ? 'En favoritos' : 'Guardar favorito'}</button>
}
