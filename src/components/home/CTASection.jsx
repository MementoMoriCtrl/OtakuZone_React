import { Sparkles, UserRoundPlus } from 'lucide-react'

import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth.js'

export default function CTASection() {
  const auth = useAuth()
  return (
    <section aria-labelledby="community-title" className="relative isolate overflow-hidden rounded-2xl border border-neo-violet/40 bg-linear-to-br from-neo-violet/20 via-neo-slate/40 to-neo-cyan/5 px-6 py-10 text-center sm:p-12">
      <div aria-hidden="true" className="absolute -right-16 -top-16 -z-10 size-48 rounded-full bg-neo-cyan/10 blur-3xl" />
      <Sparkles aria-hidden="true" className="mx-auto mb-5 size-7 text-neo-cyan" />
      <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-neo-cyan">TU PRÓXIMA HISTORIA EMPIEZA CONTIGO</p>
      <h2 id="community-title" className="font-heading text-2xl font-semibold tracking-tight sm:text-4xl">Encuentra tu lugar en OtakuZone.</h2>
      <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-neo-white/75 sm:text-base">Nuevos mundos, historias que te acompañan y una pasión que nos conecta. Prepárate para formar parte de nuestro universo anime.</p>
      <Link to={auth.user ? '/perfil' : '/cuenta'} aria-describedby="registration-note" className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-neo-violet px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan"><UserRoundPlus aria-hidden="true" className="size-4" />{auth.user ? 'Ver mi perfil' : 'Crear cuenta'}</Link>
      <p id="registration-note" className="mt-3 text-xs leading-relaxed text-neo-white/60">Tu espacio para formar parte de OtakuZone.</p>
    </section>
  )
}
