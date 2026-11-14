import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnimeCollection from '../components/home/AnimeCollection.jsx'
import AnimeSearchForm from '../components/home/AnimeSearchForm.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import useResource from '../hooks/useResource.js'
import { getAnimeGenres, searchAnime } from '../services/jikan.js'

const buttonClass = 'min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan'

export default function Animes() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const genre = params.get('genre') ?? ''
  const rawPage = Number(params.get('page') ?? 1)
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const loader = useCallback((options) => searchAnime({ query, genre, page }, options), [query, genre, page])
  const resource = useResource(loader)
  const genres = useResource(getAnimeGenres)
  const items = resource.data?.items ?? []
  const goToPage = (next) => { const updated = new URLSearchParams(params); updated.set('page', String(next)); setParams(updated) }
  const submit = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const updated = new URLSearchParams()
    const q = String(form.get('q') ?? '').trim()
    const selected = String(form.get('genre') ?? '')
    if (q) updated.set('q', q)
    if (selected) updated.set('genre', selected)
    setParams(updated)
  }
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">CATÁLOGO · JIKAN / MYANIMELIST</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Animes<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Información real de anime. Busca por título o género y consulta su ficha. Las sinopsis pueden estar en inglés.</p></div>
    <AnimeSearchForm key={`${query}:${genre}`} query={query} genre={genre} genres={genres.data ?? []} onSubmit={submit} />
    <ResourceState resource={genres} empty={!genres.data?.length} emptyMessage="No hay géneros disponibles; puedes buscar por título." />
    <section aria-label="Resultados del catálogo" aria-busy={resource.loading}>
      <ResourceState resource={resource} empty={!items.length} emptyMessage="No encontramos animes con esos criterios. Prueba otro título o género." />
      {!resource.loading && !resource.error && <AnimeCollection key={`${query}:${genre}:${page}`} anime={items} />}
      {!resource.loading && !resource.error && <div className="mt-8 flex flex-wrap items-center justify-center gap-4"><button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} className={buttonClass}>Anterior</button><p role="status" className="text-sm">Página {page}</p><button type="button" disabled={!resource.data?.hasNext} onClick={() => goToPage(page + 1)} className={buttonClass}>Siguiente</button></div>}
    </section>
  </div>
}
