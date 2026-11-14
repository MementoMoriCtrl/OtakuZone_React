export default function ActionMessage({ action }) {
  return <>
    {action.loading && <p role="status" className="text-sm text-neo-cyan">Procesando…</p>}
    {action.error && <p role="alert" className="rounded-lg border border-neo-violet/40 bg-neo-slate/40 p-4 text-sm leading-relaxed">{action.error}</p>}
    {action.success && <p role="status" className="rounded-lg border border-neo-cyan/30 p-4 text-sm leading-relaxed text-neo-cyan">{action.success}</p>}
  </>
}
