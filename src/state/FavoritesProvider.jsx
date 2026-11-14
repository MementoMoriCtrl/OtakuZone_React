import { useEffect, useState, useSyncExternalStore } from 'react'
import FavoritesContext from './FavoritesContext.js'
import { FAVORITES_KEY } from '../services/localRepository.js'
import { createFavoritesStore } from '../services/favoritesStore.js'

export default function FavoritesProvider({ children }) {
  const [store] = useState(() => createFavoritesStore())
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== FAVORITES_KEY && event.key !== null) return
      store.reload()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [store])
  return <FavoritesContext value={{ items: state.items, toggle: store.toggle }}>
    {state.error && <p role="alert" className="border-b border-neo-violet/40 bg-neo-slate p-4 text-center text-sm">Favoritos: {state.error}</p>}
    <p role="status" className="sr-only">{state.announcement}</p>
    {children}
  </FavoritesContext>
}
