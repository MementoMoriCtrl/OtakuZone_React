import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, Search, ShoppingBag, UserRound, X, Zap } from 'lucide-react'
import Navbar from './Navbar.jsx'

const iconClass = 'inline-flex size-9 shrink-0 sm:size-10 items-center justify-center rounded-lg border border-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neo-cyan'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onResize = () => { if (desktop.matches) setMenuOpen(false) }
    document.addEventListener('keydown', onEscape)
    desktop.addEventListener('change', onResize)
    return () => {
      document.removeEventListener('keydown', onEscape)
      desktop.removeEventListener('change', onResize)
    }
  }, [menuOpen])

  return (
    <header className="relative z-10 border-b border-neo-violet/25 bg-neo-midnight/95 shadow-lg shadow-neo-violet/5">
      <a href="#main-content" className="sr-only z-20 rounded-lg bg-neo-cyan p-3 text-neo-midnight focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Saltar al contenido</a>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-4 sm:gap-6 sm:px-8">
        <Link to="/" onClick={closeMenu} aria-label="OtakuZone — Inicio" className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">
          <span className="hidden size-9 items-center min-[375px]:flex justify-center rounded-lg border border-neo-violet/50 bg-neo-violet/15 text-neo-cyan"><Zap aria-hidden="true" className="size-5" /></span>
          <span className="font-heading text-xs font-semibold tracking-wider sm:text-lg">OTAKUZONE<span className="text-neo-cyan">.</span><span className="mt-0.5 block text-[9px] tracking-[0.3em] text-neo-white/55">NEO TOKYO</span></span>
        </Link>
        <div className="hidden lg:block"><Navbar /></div>
        <div className="flex items-center gap-0.5 sm:gap-1" aria-label="Acciones de usuario">
          <button type="button" disabled aria-label="Búsqueda — próximamente" title="Búsqueda disponible en una próxima fase" className={`${iconClass} cursor-not-allowed text-neo-white/40`}><Search aria-hidden="true" className="size-5" /></button>
          <button type="button" disabled aria-label="Carrito — próximamente" title="Carrito disponible en una próxima fase" className={`${iconClass} cursor-not-allowed text-neo-white/40`}><ShoppingBag aria-hidden="true" className="size-5" /></button>
          <NavLink to="/cuenta" end onClick={closeMenu} aria-label="Mi Cuenta" title="Mi Cuenta" className={({ isActive }) => `${iconClass} transition-colors motion-reduce:transition-none ${isActive ? 'border-neo-cyan/30 bg-neo-violet/15 text-neo-cyan' : 'text-neo-white/75 hover:bg-neo-slate hover:text-neo-cyan'}`}><UserRound aria-hidden="true" className="size-5" /></NavLink>
          <button ref={menuButton} type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="mobile-navigation" className={`${iconClass} cursor-pointer text-neo-cyan transition-colors hover:bg-neo-slate motion-reduce:transition-none lg:hidden`}>
            {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </button>
        </div>
      </div>
      <div id="mobile-navigation" hidden={!menuOpen} className="border-t border-neo-white/10 bg-neo-slate/40 px-4 py-4 sm:px-8 lg:hidden">
        <Navbar mobile onNavigate={closeMenu} />
        <p className="mt-4 border-t border-neo-white/10 pt-4 text-xs leading-relaxed text-neo-white/55">Búsqueda y carrito: próximamente.</p>
      </div>
    </header>
  )
}

