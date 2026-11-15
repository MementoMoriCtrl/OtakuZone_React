import { useEffect, useRef } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Header from '../components/layout/Header.jsx'
import Footer from '../components/layout/Footer.jsx'
import Home from '../pages/Home.jsx'
import Animes from '../pages/Animes.jsx'
import Tienda from '../pages/Tienda.jsx'
import Favoritos from '../pages/Favoritos.jsx'
import MiCuenta from '../pages/MiCuenta.jsx'
import NotFound from '../pages/NotFound.jsx'
import Perfil from '../pages/Perfil.jsx'
import Admin from '../pages/Admin.jsx'
import RequireAuth from '../components/account/RequireAuth.jsx'
import Carrito from '../pages/Carrito.jsx'
import Pedidos from '../pages/Pedidos.jsx'
import Suscripciones from '../pages/Suscripciones.jsx'
import Producto from '../pages/Producto.jsx'

function PublicLayout() {
  const { pathname } = useLocation()
  const main = useRef(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    document.title = `${main.current?.querySelector('h1')?.textContent.replace(/\.$/, '') ?? 'OtakuZone'} — OtakuZone`
    if (previousPath.current !== pathname) {
      main.current?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
      previousPath.current = pathname
    }
  }, [pathname])

  return (
    <div className="flex min-h-svh flex-col">
      <Header key={pathname} />
      <main ref={main} id="main-content" tabIndex={-1} className={`mx-auto w-full flex-1 px-5 py-10 outline-none sm:px-8 sm:py-12 ${pathname === '/' ? 'max-w-7xl' : 'max-w-5xl'}`}>
        <Outlet />
        {pathname !== '/' && pathname !== '/suscripciones' && !pathname.startsWith('/tienda') && <p className="mt-6 text-xs leading-relaxed text-neo-white/55">OtakuZone — Neo Tokyo · Proyecto académico</p>}
      </main>
      <Footer />
    </div>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="animes" element={<Animes />} />
          <Route path="tienda" element={<Tienda />} />
          <Route path="tienda/:id" element={<Producto />} />
          <Route path="suscripciones" element={<Suscripciones />} />
          <Route element={<RequireAuth />}><Route path="carrito" element={<Carrito />} /><Route path="pedidos" element={<Pedidos />} /><Route path="pedidos/:id" element={<Pedidos />} /></Route>
          <Route path="favoritos" element={<Favoritos />} />
          <Route path="cuenta" element={<MiCuenta />} />
          <Route element={<RequireAuth />}><Route path="perfil" element={<Perfil />} /></Route>
          <Route element={<RequireAuth role="ADMIN" />}><Route path="admin" element={<Admin />} /></Route>
          <Route element={<RequireAuth role="ADMIN" />}><Route path="admin/:section" element={<Admin />} /></Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
