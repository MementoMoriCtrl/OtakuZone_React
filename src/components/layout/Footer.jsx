import { Camera, Mail, MessageCircle, Video, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

const linkClass = 'rounded-sm text-sm text-neo-white/70 transition-colors hover:text-neo-cyan motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan'
const socialIcons = [
  { name: 'Instagram', Icon: Camera },
  { name: 'YouTube', Icon: Video },
  { name: 'Twitch', Icon: MessageCircle },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neo-violet/25 bg-neo-slate/25">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid gap-9 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_1fr] lg:gap-12">
          <div>
            <Link to="/" aria-label="OtakuZone — Inicio" className="inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">
              <Zap aria-hidden="true" className="size-6 text-neo-cyan" />
              <span className="font-heading text-lg font-semibold tracking-wider">OTAKUZONE<span className="text-neo-cyan">.</span></span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-neo-white/70">Un punto de encuentro para descubrir historias, compartir tu pasión por el anime y explorar el universo otaku.</p>
            <div className="mt-5 flex gap-2" aria-label="Redes sociales, próximamente">
              {socialIcons.map(({ name, Icon }) => (
                <button key={name} type="button" disabled aria-label={`${name} — próximamente`} title={`${name}: perfil aún no disponible`} className="inline-flex size-10 cursor-not-allowed items-center justify-center rounded-lg border border-neo-white/15 bg-neo-midnight/50 text-neo-white/45"><Icon aria-hidden="true" className="size-4" /></button>
              ))}
            </div>
            <p className="mt-2 text-xs text-neo-white/55">Redes sociales: próximamente.</p>
          </div>
          <nav aria-labelledby="footer-navigation-title">
            <h2 id="footer-navigation-title" className="font-heading text-sm font-semibold">Explora OtakuZone</h2>
            <ul className="mt-4 space-y-3">
              <li><Link to="/" className={linkClass}>Inicio</Link></li>
              <li><Link to="/animes" className={linkClass}>Animes</Link></li>
              <li><Link to="/tienda" className={linkClass}>Tienda Otaku</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="font-heading text-sm font-semibold">Contacto de demostración</h2>
            <p className="mt-4 inline-flex items-center gap-2 break-all text-sm text-neo-cyan"><Mail aria-hidden="true" className="size-4 shrink-0" />hola@otakuzone.example</p>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-neo-white/60">Dirección ficticia para este proyecto académico. No recibe mensajes ni ofrece atención al cliente.</p>
          </div>
        </div>
        <div className="mt-9 flex flex-col gap-3 border-t border-neo-white/10 pt-6 text-xs leading-relaxed text-neo-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} OtakuZone. Todos los derechos reservados.</p>
          <p>NEO TOKYO · PROYECTO ACADÉMICO</p>
        </div>
      </div>
    </footer>
  )
}
