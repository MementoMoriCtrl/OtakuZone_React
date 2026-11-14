import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnimeCollection from '../components/home/AnimeCollection.jsx'
import AnimeSearchForm from '../components/home/AnimeSearchForm.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import useResource from '../hooks/useResource.js'
import { getCatalogGenres, searchCatalog } from '../services/animeCatalog.js'
import { readCatalogParams } from '../domain/catalog.js'
import { Link } from 'react-router-dom'

const buttonClass = 'min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan'

export default function Animes() {
  const [params, setParams] = useSearchParams()
  const filters = readCatalogParams(params)
  const { source, query, genre, status, order, page } = filters
  const loader = useCallback((options) => searchCatalog({ source, query, genre, status, order, page }, options), [source, query, genre, status, order, page])
  const genreLoader = useCallback((options) => getCatalogGenres(source, options), [source])
  const resource = useResource(loader)
  const genres = useResource(genreLoader)
  const items = resource.data?.items ?? []
  const goToPage = (next) => { const updated = new URLSearchParams(params); updated.set('page', String(next)); setParams(updated) }
  const update = (patch, replace = false) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(patch)) { if (value && !(key === 'source' && value === 'jikan')) next.set(key, value); else next.delete(key) }
      next.delete('page')
      return next
    }, { replace })
  }
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">CATÁLOGO · {source === 'demo' ? 'DEMOSTRACIÓN LOCAL' : 'JIKAN / MYANIMELIST'}</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Animes<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Busca por título, combina filtros, ordena resultados y guarda favoritos en este navegador.</p></div>
    {source === 'demo' ? <p role="note" className="rounded-xl border border-neo-cyan/40 bg-neo-slate/50 p-5 text-sm leading-relaxed text-neo-cyan">DEMO LOCAL: obras, puntuaciones, popularidad y estados ficticios. Se reutilizan ilustraciones locales. No son resultados de Jikan ni una prueba de que la API esté disponible.</p> : <p className="text-sm text-neo-white/65">Fuente real: Jikan / MyAnimeList. Las sinopsis pueden estar en inglés. Si el servicio no responde, puedes elegir Demo local para probar la interfaz.</p>}
    <AnimeSearchForm filters={filters} genres={genres.data ?? []} revision={params.toString()} onUpdate={update} />
    <ResourceState resource={genres} empty={!genres.data?.length} emptyMessage="No hay géneros disponibles; puedes buscar por título." />
    <section aria-label="Resultados del catálogo" aria-busy={resource.loading}>
      <ResourceState resource={resource} empty={!items.length} emptyMessage="No encontramos animes con esos criterios. Prueba otro título o género." />
      {source === 'jikan' && resource.error && <Link to="/animes?source=demo" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-neo-cyan/40 px-4 py-2 text-sm text-neo-cyan focus-visible:outline-2 focus-visible:outline-neo-cyan">Probar con datos demostrativos locales</Link>}
      {!resource.loading && !resource.error && <AnimeCollection key={`${source}:${query}:${genre}:${status}:${order}:${page}`} anime={items} />}
      {!resource.loading && !resource.error && <div className="mt-8 flex flex-wrap items-center justify-center gap-4"><button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} className={buttonClass}>Anterior</button><p role="status" className="text-sm">Página {page}</p><button type="button" disabled={!resource.data?.hasNext} onClick={() => goToPage(page + 1)} className={buttonClass}>Siguiente</button></div>}
    </section>
  </div>
}
