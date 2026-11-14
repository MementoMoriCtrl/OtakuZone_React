import distrito from '../assets/demo/distrito-cero.png'
import jardin from '../assets/demo/jardin-cristal.png'
import orbita from '../assets/demo/orbita-09.png'
import cafe from '../assets/demo/cafe-nubes.png'
import archivo from '../assets/demo/archivo-lunar.png'
import isla from '../assets/demo/isla-bruma.png'

export const demoGenres = [
  { id: 1, name: 'Acción' }, { id: 2, name: 'Aventura' },
  { id: 22, name: 'Romance' }, { id: 10, name: 'Fantasía' },
  { id: 24, name: 'Ciencia ficción' }, { id: 4, name: 'Comedia' },
]

// Obras originales ficticias. Los números permiten probar orden y filtros;
// no son estadísticas de AniList. Se reutilizan las ilustraciones originales.
const seeds = [
  ['Distrito Cero', distrito, [1, 24], 'airing', 9.2, 2],
  ['El jardín de cristal', jardin, [10, 22], 'complete', 8.9, 4],
  ['Órbita 09', orbita, [24, 2], 'complete', 9.1, 1],
  ['Café entre nubes', cafe, [4, 22], 'airing', 8.7, 3],
  ['Archivo lunar', archivo, [10, 2], 'upcoming', null, 8],
  ['Isla de bruma', isla, [2, 10], 'upcoming', null, 6],
  ['Distrito Cero: Horizonte', distrito, [1, 24], 'complete', 8.5, 7],
  ['El jardín de los ecos', jardin, [10, 22], 'airing', 8.4, 5],
  ['Órbita de cristal', orbita, [24, 2], 'upcoming', null, 12],
  ['Café de medianoche', cafe, [4], 'complete', 7.9, 9],
  ['Archivo de las mareas', archivo, [10], 'airing', 8.1, 11],
  ['Islas del recuerdo', isla, [2, 22], 'complete', 8.2, 10],
]
export const demoAnime = seeds.map(([title, image, genreIds, statusCode, score, popularity], index) => ({
  id: `demo-${index + 1}`, source: 'demo', title, image,
  imageAlt: `Ilustración demostrativa de ${title}`, genreIds,
  genre: genreIds.map((id) => demoGenres.find((genre) => genre.id === id).name).join(' · '),
  statusCode, status: { airing: 'En emisión (demo)', complete: 'Finalizado (demo)', upcoming: 'Próximamente (demo)' }[statusCode],
  score, popularity, season: 'Temporada ficticia · Demo local',
  episodes: statusCode === 'upcoming' ? null : 12,
  description: `${title} es una obra ficticia del universo OtakuZone. Esta ficha, su estado, puntuación y popularidad son datos locales de demostración; no proceden de AniList. La ilustración puede reutilizarse entre títulos.`,
}))
