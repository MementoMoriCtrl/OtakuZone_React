import { favoritesReducer } from '../domain/favorites.js'
import { readFavorites, saveFavorites } from './localRepository.js'

// Adaptador local provisional. La UI solo depende de snapshot/subscribe/toggle;
// una futura persistencia remota puede reemplazar este almacén.
export function createFavoritesStore(storage) {
  const initial = readFavorites(storage)
  let state = { items: initial.data, announcement: '', error: initial.error }
  const listeners = new Set()
  const publish = () => listeners.forEach((listener) => listener())
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    toggle: (anime) => {
      const next = favoritesReducer(state, { type: 'toggle', anime })
      if (next === state) return
      state = { ...next, error: saveFavorites(next.items, storage) }
      publish()
    },
    reload: () => {
      const result = readFavorites(storage)
      state = result.error ? { ...state, error: result.error } : { items: result.data, announcement: '', error: '' }
      publish()
    },
  }
}
