import { Link } from 'react-router-dom'
export default function ShopNavigation() {
  return <nav aria-label="Mi tienda" className="flex flex-wrap gap-4 text-sm text-neo-cyan">{[['/tienda', 'Productos'], ['/carrito', 'Mi carrito'], ['/pedidos', 'Mis pedidos'], ['/suscripciones', 'Suscripciones']].map(([to, label]) => <Link key={to} to={to} className="inline-flex min-h-11 items-center rounded px-2 focus-visible:outline-2 focus-visible:outline-neo-cyan">{label}</Link>)}</nav>
}
