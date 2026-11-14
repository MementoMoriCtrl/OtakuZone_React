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
        {pathname !== '/' && <p className="mt-6 text-xs leading-relaxed text-neo-white/55">OtakuZone — Neo Tokyo · Proyecto académico · Páginas provisionales</p>}
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
          <Route path="favoritos" element={<Favoritos />} />
          <Route path="cuenta" element={<MiCuenta />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
