import { useEffect, useRef } from 'react'
import { statusOptions } from '../../domain/catalog.js'

const controlClass = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-neo-violet/40 bg-neo-midnight px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-neo-cyan'

export default function AnimeSearchForm({ filters, genres, revision, onUpdate }) {
  const input = useRef(null)
  const timer = useRef(null)
  const { query, genre, status, order, source } = filters
  useEffect(() => {
    if (input.current.value !== query) input.current.value = query
    return () => clearTimeout(timer.current)
  }, [query, revision])
  const update = (patch, replace = false) => {
    clearTimeout(timer.current)
    onUpdate({ q: input.current.value.trim(), ...patch }, replace)
  }
  const changeQuery = (event) => {
    clearTimeout(timer.current)
    const value = event.target.value.trim()
    timer.current = setTimeout(() => onUpdate({ q: value }, true), 450)
  }
  return <form onSubmit={(event) => { event.preventDefault(); update({}) }} className="grid items-end gap-4 rounded-xl border border-neo-violet/25 bg-neo-slate/30 p-5 sm:grid-cols-2" role="search" aria-label="Buscar anime">
    <label className="min-w-0 text-sm">Fuente<select name="source" value={source} onChange={(event) => update({ source: event.target.value })} className={controlClass}><option value="anilist">AniList · Información real</option><option value="demo">Demo local · Datos ficticios</option></select></label>
    <label className="min-w-0 text-sm">Título<input ref={input} name="q" type="search" maxLength={150} defaultValue={query} onChange={changeQuery} placeholder={source === 'demo' ? 'Por ejemplo: Distrito' : 'Por ejemplo: Naruto'} className={controlClass} /></label>
    <label className="min-w-0 text-sm">Género<select name="genre" value={genre} onChange={(event) => update({ genre: event.target.value })} className={controlClass}>
      <option value="">Todos los géneros</option>
      {genre && !genres.some((item) => String(item.id) === genre) && <option value={genre}>Género seleccionado ({genre})</option>}
      {genres.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label className="min-w-0 text-sm">Estado<select name="status" value={status} onChange={(event) => update({ status: event.target.value })} className={controlClass}><option value="">Todos los estados</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="min-w-0 text-sm">Ordenar por<select name="order" value={order} onChange={(event) => update({ order: event.target.value })} className={controlClass}><option value="popularity">Popularidad</option><option value="score">Puntuación (mayor primero)</option></select></label>
    <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Buscar</button>
  </form>
}
