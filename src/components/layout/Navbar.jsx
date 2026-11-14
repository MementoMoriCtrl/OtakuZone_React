import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/animes', label: 'Animes' },
  { to: '/tienda', label: 'Tienda Otaku' },
  { to: '/favoritos', label: 'Favoritos' },
  { to: '/cuenta', label: 'Mi Cuenta' },
]

export default function Navbar({ mobile = false, onNavigate }) {
  return (
    <nav aria-label={mobile ? 'Navegación móvil' : 'Navegación principal'}>
      <ul className={mobile ? 'flex flex-col gap-2' : 'flex items-center gap-1'}>
        {links.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              onClick={onNavigate}
              className={({ isActive }) => `block rounded-lg border px-3 py-3 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neo-cyan ${isActive ? 'border-neo-cyan/30 bg-neo-violet/15 text-neo-cyan shadow-sm shadow-neo-cyan/10' : 'border-transparent text-neo-white/75 hover:bg-neo-slate hover:text-neo-white'}`}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
