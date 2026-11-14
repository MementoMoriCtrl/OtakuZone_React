import { getAnimeDetails, getAnimeGenres, searchAnime } from './jikan.js'
import { filterDemoAnime } from '../domain/catalog.js'

export async function searchCatalog(filters, options) {
  if (filters.source !== 'demo') return searchAnime(filters, options)
  const { demoAnime } = await import('../data/demoAnime.js')
  options?.signal?.throwIfAborted()
  return filterDemoAnime(demoAnime, filters)
}

export async function getCatalogGenres(source, options) {
  if (source !== 'demo') return getAnimeGenres(options)
  const { demoGenres } = await import('../data/demoAnime.js')
  options?.signal?.throwIfAborted()
  return demoGenres
}

export async function getCatalogDetails(anime, options) {
  if (anime.source !== 'demo') return getAnimeDetails(anime.id, options)
  const { demoAnime } = await import('../data/demoAnime.js')
  options?.signal?.throwIfAborted()
  const item = demoAnime.find((record) => record.id === anime.id)
  if (!item) throw new Error('Esta ficha demostrativa ya no está disponible.')
  return item
}
