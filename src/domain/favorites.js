export const favoriteKey = (anime) => `${anime.source}:${anime.id}`

export function favoriteSnapshot(item) {
  if (!item || !['jikan', 'demo'].includes(item.source) || typeof item.title !== 'string' || !item.title.trim()) return null
  if (item.source === 'jikan' && (!Number.isInteger(item.id) || item.id <= 0)) return null
  if (item.source === 'demo' && (typeof item.id !== 'string' || !/^demo-\d+$/.test(item.id))) return null
  const string = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 5000) : fallback
  const image = typeof item.image === 'string' && (/^https?:\/\//i.test(item.image) || /^\/(?!\/)/.test(item.image)) ? item.image : null
  return {
    id: item.id, source: item.source, title: item.title.slice(0, 300), image,
    imageAlt: string(item.imageAlt, `Portada de ${item.title}`),
    genre: string(item.genre, 'Género no disponible'), genreIds: Array.isArray(item.genreIds) ? item.genreIds.filter(Number.isInteger) : [],
    score: Number.isFinite(item.score) && item.score > 0 && item.score <= 10 ? item.score : null,
    popularity: Number.isInteger(item.popularity) && item.popularity > 0 ? item.popularity : null,
    statusCode: string(item.statusCode), status: string(item.status), season: string(item.season),
    description: string(item.description, 'Sinopsis no disponible.'), episodes: Number.isInteger(item.episodes) ? item.episodes : null,
  }
}

export function sanitizeFavorites(items) {
  if (!Array.isArray(items)) throw new Error('El formato de favoritos no es válido.')
  return [...new Map(items.map(favoriteSnapshot).filter(Boolean).map((item) => [favoriteKey(item), item])).values()].slice(0, 200)
}

export function favoritesReducer(state, action) {
  if (action.type !== 'toggle') return state
  const item = favoriteSnapshot(action.anime)
  if (!item) return state
  const exists = state.items.some((saved) => favoriteKey(saved) === favoriteKey(item))
  if (!exists && state.items.length >= 200) return { ...state, announcement: 'Has alcanzado el límite provisional de 200 favoritos.' }
  return {
    items: exists ? state.items.filter((saved) => favoriteKey(saved) !== favoriteKey(item)) : [...state.items, item],
    announcement: `${exists ? 'Se quitó' : 'Se agregó'} ${item.title} ${exists ? 'de' : 'a'} favoritos.`,
  }
}
