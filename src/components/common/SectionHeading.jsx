import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SectionHeading({ id, eyebrow, title, description, to, linkLabel }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-neo-cyan">{eyebrow}</p>
        <h2 id={id} className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neo-white/65">{description}</p>}
      </div>
      {to && <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-lg text-sm font-medium text-neo-cyan transition-colors hover:text-neo-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none sm:self-auto">{linkLabel}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>}
    </div>
  )
}
