import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SubscriptionCard({ plan }) {
  return (
    <article className={`relative flex min-w-0 flex-col rounded-2xl border p-6 sm:p-8 ${plan.featured ? 'border-neo-violet/70 bg-linear-to-br from-neo-violet/15 to-neo-slate/40 shadow-xl shadow-neo-violet/10' : 'border-neo-white/15 bg-neo-slate/30'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`font-heading text-xl font-semibold tracking-wider ${plan.featured ? 'text-neo-cyan' : 'text-neo-white'}`}>{plan.name}</h3>
        {plan.featured && <span className="inline-flex items-center gap-1.5 rounded-full border border-neo-cyan/30 bg-neo-cyan/5 px-3 py-1 text-xs text-neo-cyan"><Sparkles aria-hidden="true" className="size-3.5" />Insignia Premium</span>}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neo-white/65">{plan.tagline}</p>
      <p className="mt-6 text-4xl font-semibold tracking-tight">S/ {plan.price.toFixed(2)}<span className="ml-1 text-sm font-normal tracking-normal text-neo-white/60">/ mes</span></p>
      <p className="mt-2 text-xs text-neo-white/55">Precio de muestra · Sin cobros</p>
      <ul className="my-7 space-y-4">
        {plan.benefits.map((benefit) => <li key={benefit} className="flex items-start gap-3 text-sm leading-relaxed text-neo-white/80"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neo-cyan" />{benefit}</li>)}
      </ul>
      <Link to="/tienda" className={`mt-auto inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none ${plan.featured ? 'bg-neo-violet hover:bg-neo-violet/80' : 'border border-neo-white/20 hover:border-neo-cyan/50 hover:text-neo-cyan'}`}>{plan.action}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </article>
  )
}
