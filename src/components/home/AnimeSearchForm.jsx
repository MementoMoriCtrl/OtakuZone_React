import { useState } from 'react'

const controlClass = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-neo-violet/40 bg-neo-midnight px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-neo-cyan'

export default function AnimeSearchForm({ query, genre, genres, onSubmit }) {
  const [selectedGenre, setSelectedGenre] = useState(genre)
  return <form onSubmit={onSubmit} className="grid items-end gap-4 rounded-xl border border-neo-violet/25 bg-neo-slate/30 p-5 sm:grid-cols-[1fr_1fr_auto]" role="search" aria-label="Buscar anime">
    <label className="min-w-0 text-sm">Título<input name="q" type="search" maxLength={150} defaultValue={query} placeholder="Por ejemplo: Naruto" className={controlClass} /></label>
    <label className="min-w-0 text-sm">Género<select name="genre" value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)} className={controlClass}>
      <option value="">Todos los géneros</option>
      {selectedGenre && !genres.some((item) => String(item.id) === selectedGenre) && <option value={selectedGenre}>Género seleccionado ({selectedGenre})</option>}
      {genres.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-neo-violet px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Buscar</button>
  </form>
}
