import { useState } from 'react'

// Se conserva la comprobación de FASE 1 fuera del Home de producción.
export default function DevelopmentCheck() {
  const [checks, setChecks] = useState(0)
  return (
    <details className="rounded-lg border border-neo-white/10 p-4 text-xs text-neo-white/60">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-neo-cyan">Comprobación de desarrollo · FASE 1</summary>
      <button type="button" onClick={() => setChecks((value) => value + 1)} className="mt-4 min-h-11 cursor-pointer rounded-lg bg-neo-violet px-4 py-2 text-sm text-neo-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Probar interacción</button>
      <p role="status" className="mt-3">{checks === 0 ? 'Pulsa el botón para comprobar la interacción de React.' : `React responde. Comprobaciones: ${checks}.`}</p>
    </details>
  )
}
