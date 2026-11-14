import { useId } from 'react'

export default function FormField({ label, error, hint, multiline = false, ...props }) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  const inputProps = { ...props, id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, className: 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-neo-violet/40 bg-neo-midnight px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-neo-cyan' }
  return <div className="min-w-0"><label htmlFor={id} className="text-sm font-medium">{label}</label>{multiline ? <textarea {...inputProps} rows={3} /> : <input {...inputProps} />}{hint && <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-neo-white/65">{hint}</p>}{error && <p id={`${id}-error`} className="mt-2 text-sm leading-relaxed text-neo-cyan">{error}</p>}</div>
}
