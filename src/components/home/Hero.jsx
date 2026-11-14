import { ArrowRight, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import cityImage from '../../assets/neo-tokyo-city.png'

const buttonClass = 'inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-5 py-3 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan'

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden rounded-2xl border border-neo-violet/30 bg-neo-midnight shadow-xl shadow-neo-violet/10">
      <img src={cityImage} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 -z-30 h-full w-full object-cover object-[65%_center] lg:object-center" />
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-linear-to-r from-neo-midnight/95 via-neo-midnight/80 to-neo-midnight/25" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-neo-midnight/80 via-neo-midnight/10 to-transparent" />
      <div className="flex min-h-[540px] flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:min-h-[560px] lg:px-16">
        <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-neo-cyan"><span aria-hidden="true" className="h-px w-8 bg-neo-cyan shadow-sm shadow-neo-cyan/50" />BIENVENIDO A NEO TOKYO</p>
        <h1 id="hero-title" className="max-w-2xl font-heading text-4xl font-semibold leading-[1.15] tracking-tight text-balance sm:text-5xl lg:text-6xl">TU UNIVERSO ANIME <span className="text-neo-cyan">COMIENZA AQUÍ</span></h1>
        <p className="mt-6 max-w-lg text-base leading-relaxed text-neo-white/85 sm:text-lg">Descubre nuevas historias, explora tus animes favoritos y encuentra productos exclusivos del universo otaku.</p>
        <div className="mt-8 flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap">
          <Link to="/animes" className={`${buttonClass} bg-neo-violet text-neo-white shadow-lg shadow-neo-violet/20 hover:bg-neo-violet/80`}>Explorar animes <ArrowRight aria-hidden="true" className="size-4" /></Link>
          <Link to="/tienda" className={`${buttonClass} border border-neo-cyan/40 bg-neo-midnight/65 text-neo-white hover:border-neo-cyan hover:bg-neo-slate`}><ShoppingBag aria-hidden="true" className="size-4" />Visitar tienda</Link>
        </div>
      </div>
      <span aria-hidden="true" className="absolute bottom-0 left-6 h-px w-24 bg-neo-cyan shadow-sm shadow-neo-cyan/50 sm:left-10 lg:left-16" />
    </section>
  )
}
