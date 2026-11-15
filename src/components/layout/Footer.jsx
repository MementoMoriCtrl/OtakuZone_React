import { Mail, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

const linkClass = 'rounded-sm text-sm text-neo-white/70 transition-colors hover:text-neo-cyan motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan'

// Brand silhouettes kept inline to avoid adding an icon dependency.
const socialLinks = [
  { name: 'Instagram', href: 'https://www.instagram.com/', path: 'M7 2C4.24 2 2 4.24 2 7v10c0 2.76 2.24 5 5 5h10c2.76 0 5-2.24 5-5V7c0-2.76-2.24-5-5-5H7zm0 2h10c1.66 0 3 1.34 3 3v10c0 1.66-1.34 3-3 3H7c-1.66 0-3-1.34-3-3V7c0-1.66 1.34-3 3-3zm10.5 1.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z' },
  { name: 'TikTok', href: 'https://www.tiktok.com/', path: 'M16.6 2c.35 2.95 2 4.71 4.9 4.9v3.32a8.18 8.18 0 0 1-4.85-1.55v7.1a6.22 6.22 0 1 1-5.36-6.16v3.39a2.9 2.9 0 1 0 2.04 2.77V2h3.27z' },
  { name: 'YouTube', href: 'https://www.youtube.com/', path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8zM9.6 15.6V8.4l6.24 3.6-6.24 3.6z' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neo-slate bg-neo-midnight">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr_1fr] lg:gap-12">
          <div className="min-w-0">
            <Link to="/" aria-label="OtakuZone — Inicio" className="inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">
              <Zap aria-hidden="true" className="size-6 text-neo-cyan" />
              <span className="font-heading text-lg font-semibold tracking-wider">OTAKUZONE<span className="text-neo-cyan">.</span></span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-7 text-neo-white/70">Un punto de encuentro para descubrir historias, compartir tu pasión por el anime y explorar el universo otaku.</p>
            <ul className="mt-6 flex gap-3" aria-label="Redes sociales">
              {socialLinks.map(({ name, href, path }) => (
                <li key={name}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} (abre en una pestaña nueva)`} title={`${name} · Abrir en una pestaña nueva`} className="inline-flex size-11 items-center justify-center rounded-xl border border-neo-slate bg-neo-slate/25 text-neo-white/75 transition-colors hover:border-neo-violet hover:bg-neo-violet/10 hover:text-neo-cyan focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="size-5"><path fillRule="evenodd" d={path} /></svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <nav aria-labelledby="footer-navigation-title" className="min-w-0 lg:pt-1">
            <h2 id="footer-navigation-title" className="font-heading text-sm font-semibold">Explora OtakuZone</h2>
            <ul className="mt-5 space-y-4">
              <li><Link to="/" className={linkClass}>Inicio</Link></li>
              <li><Link to="/animes" className={linkClass}>Animes</Link></li>
              <li><Link to="/tienda" className={linkClass}>Tienda Otaku</Link></li>
            </ul>
          </nav>
          <div className="min-w-0 lg:pt-1">
            <h2 className="font-heading text-sm font-semibold">Contacto</h2>
            <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-neo-cyan"><Mail aria-hidden="true" className="mt-1 size-4 shrink-0" /><span className="min-w-0 break-all">contacto@otakuzone.com</span></p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-neo-slate pt-6 text-xs leading-relaxed text-neo-white/60 sm:flex-row sm:items-center sm:justify-between lg:mt-12">
          <p>© 2026 OtakuZone. Todos los derechos reservados.</p>
          <p className="font-heading font-medium tracking-wide text-neo-white/70">OtakuZone</p>
        </div>
      </div>
    </footer>
  )
}
