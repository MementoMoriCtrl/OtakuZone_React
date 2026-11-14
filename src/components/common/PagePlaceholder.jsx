export default function PagePlaceholder({ number, title, description, children, headingLevel = 1 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1'
  return (
    <section aria-labelledby="page-title" className="w-full rounded-2xl border border-neo-violet/25 bg-neo-slate/35 p-6 sm:p-12">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs font-medium tracking-[0.2em] text-neo-cyan">UNIVERSO ANIME / {number}</p>
        <span className="rounded-full border border-neo-violet/40 px-3 py-1 text-xs text-neo-white/70">FASE 02</span>
      </div>
      <Heading id="page-title" className="font-heading text-3xl font-semibold tracking-tight sm:text-5xl">{title}<span className="text-neo-cyan">.</span></Heading>
      <p className="mt-5 max-w-xl leading-relaxed text-neo-white/75">{description}</p>
      {children}
    </section>
  )
}
