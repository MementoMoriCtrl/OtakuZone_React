import { Link } from 'react-router-dom'
import PagePlaceholder from '../components/common/PagePlaceholder.jsx'

export default function NotFound() {
  return (
    <PagePlaceholder number="404" title="Página no encontrada" description="Esta dirección no existe en OtakuZone. Puedes volver al inicio o elegir una página del menú.">
      <Link to="/" className="mt-8 inline-flex rounded-lg bg-neo-violet px-5 py-3 text-sm font-semibold transition-colors hover:bg-neo-violet/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">Volver al inicio</Link>
    </PagePlaceholder>
  )
}
