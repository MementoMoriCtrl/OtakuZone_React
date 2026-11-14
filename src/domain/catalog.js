export const statusOptions = [
  { value: 'airing', label: 'En emisión' },
  { value: 'complete', label: 'Finalizado' },
  { value: 'upcoming', label: 'Próximamente' },
]

export function readCatalogParams(params) {
  const rawPage = Number(params.get('page') ?? 1)
  const source=params.get('source')==='demo'?'demo':'anilist'
  const genre=params.get('genre')??''
  return {
    source,
    query: (params.get('q') ?? '').slice(0, 150),
    genre: (source==='demo'?/^[1-9]\d*$/:/^[A-Za-z][A-Za-z -]{0,49}$/).test(genre)?genre:'',
    status: statusOptions.some((option) => option.value === params.get('status')) ? params.get('status') : '',
    order: params.get('order') === 'score' ? 'score' : 'popularity',
    page: Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage<=100 ? rawPage : 1,
  }
}

export function buildAnimeSearchParams({ query = '', genre = '', status = '', order = 'popularity', page = 1 } = {}) {
  const params = new URLSearchParams({ page: String(page), order: order === 'score' ? 'score' : 'popularity' })
  if (query.trim()) params.set('q', query.trim().slice(0, 150))
  if (/^[A-Za-z][A-Za-z -]{0,49}$/.test(String(genre))) params.set('genre', String(genre))
  if (statusOptions.some((option) => option.value === status)) params.set('status', status)
  return params
}

const searchable = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
export function filterDemoAnime(records, { query = '', genre = '', status = '', order = 'popularity', page = 1 } = {}) {
  const selected = records.filter((item) => searchable(item.title).includes(searchable(query.trim())) && (!genre || item.genreIds.includes(Number(genre))) && (!status || item.statusCode === status))
  selected.sort((a, b) => order === 'score' ? (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title) : (a.popularity ?? Infinity) - (b.popularity ?? Infinity) || a.title.localeCompare(b.title))
  const start = (page - 1) * 12
  return { items: selected.slice(start, start + 12), hasNext: start + 12 < selected.length, total: selected.length }
}
