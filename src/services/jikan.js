import { ApiError, createClient, createRateGate, requireList, safeImage } from './http.js'
import { buildAnimeSearchParams } from '../domain/catalog.js'

export const JIKAN_URL = (import.meta.env?.VITE_JIKAN_API_URL || 'https://api.jikan.moe/v4').replace(/\/$/, '')
const get = createClient({ gate: createRateGate() })
const text = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback

export function normalizeAnime(item) {
  if (!item || !Number.isInteger(item.mal_id) || item.mal_id <= 0) throw new ApiError('Jikan devolvió un anime sin identificador válido.')
  const title = text(item.title, text(item.title_english, 'Título no disponible'))
  return {
    id: item.mal_id, title, source: 'jikan',
    genreIds: Array.isArray(item.genres) ? item.genres.map((genre) => genre?.mal_id).filter(Number.isInteger) : [],
    popularity: Number.isInteger(item.popularity) && item.popularity > 0 ? item.popularity : null,
    statusCode: { 'Currently Airing': 'airing', 'Finished Airing': 'complete', 'Not yet aired': 'upcoming' }[item.status] ?? '',
    image: safeImage(item.images?.webp?.large_image_url) || safeImage(item.images?.jpg?.large_image_url),
    imageAlt: `Portada de ${title}`,
    genre: Array.isArray(item.genres) ? item.genres.map((genre) => genre?.name).filter((name) => typeof name === 'string').join(' · ') || 'Género no disponible' : 'Género no disponible',
    score: typeof item.score === 'number' && item.score > 0 && item.score <= 10 ? item.score : null,
    season: [text(item.season, ''), Number.isInteger(item.year) ? item.year : ''].filter(Boolean).join(' · ') || 'Temporada no disponible',
    description: text(item.synopsis, 'Sinopsis no disponible en Jikan.'),
    episodes: Number.isInteger(item.episodes) ? item.episodes : null,
    status: text(item.status, 'Estado no disponible'),
  }
}

async function list(path, options) {
  return get(`${JIKAN_URL}${path}`, { ...options, transform: (body) => {
    const records = requireList(body?.data)
    const items = [...new Map(records.map((item) => { const anime = normalizeAnime(item); return [anime.id, anime] })).values()]
    return { items, hasNext: body.pagination?.has_next_page === true }
  } })
}

export const getPopularAnime = (options) => list('/top/anime?filter=bypopularity&limit=4&sfw=true', options)
export const getCurrentAnime = (options) => list('/seasons/now?limit=4&sfw=true', options)
export function searchAnime(filters = {}, options) {
  const params = buildAnimeSearchParams(filters)
  return list(`/anime?${params}`, options)
}
export async function getAnimeDetails(id, options) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new ApiError('Identificador de anime inválido.')
  return get(`${JIKAN_URL}/anime/${id}/full`, { ...options, transform: (body) => normalizeAnime(body?.data) })
}
export async function getAnimeGenres(options) {
  return get(`${JIKAN_URL}/genres/anime?filter=genres`, { ...options, transform: (body) => requireList(body?.data).map((genre) => {
    if (!Number.isInteger(genre?.mal_id) || typeof genre.name !== 'string') throw new ApiError('Jikan devolvió un género inválido.')
    return { id: genre.mal_id, name: genre.name, description: 'Explorar animes de este género', icon: 'sparkles' }
  }) })
}
