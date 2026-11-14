export default function ResourceState({ resource, empty = false, emptyMessage = 'No hay resultados disponibles.' }) {
  if (resource.loading) return <p role="status" className="rounded-xl border border-neo-violet/25 bg-neo-slate/30 p-6 text-sm text-neo-cyan">Cargando información…</p>
  if (resource.error) return <div role="alert" className="rounded-xl border border-neo-violet/40 bg-neo-slate/40 p-6"><p className="text-sm leading-relaxed">{resource.error}</p><button type="button" onClick={resource.retry} className="mt-4 min-h-11 cursor-pointer rounded-lg bg-neo-violet px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Reintentar</button></div>
  if (empty) return <p role="status" className="rounded-xl border border-neo-white/15 p-6 text-sm text-neo-white/70">{emptyMessage}</p>
  return null
}
