import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import useSubscription from '../hooks/useSubscription.js'
import useAsyncAction from '../hooks/useAsyncAction.js'
import useResource from '../hooks/useResource.js'
import { getPlans, changeSubscription } from '../services/commerce.js'
import { presentSubscription } from '../data/homeData.js'
import SubscriptionCard from '../components/home/SubscriptionCard.jsx'
import ShopNavigation from '../components/common/ShopNavigation.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import ActionMessage from '../components/common/ActionMessage.jsx'

const buttonClass = 'min-h-12 rounded-lg px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan motion-reduce:transition-none'

function PlanConfirmation({ plan, busy, error, onConfirm, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    element.showModal()
    return () => { element.close(); previous?.focus() }
  }, [])
  return <dialog ref={dialog} aria-labelledby="plan-confirm-title" aria-describedby="plan-confirm-note" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-neo-violet/50 bg-neo-midnight p-6 text-neo-white shadow-2xl backdrop:bg-neo-midnight/85 sm:p-8">
    <h2 id="plan-confirm-title" className="font-heading text-xl font-semibold">Cambiar a {plan.name}</h2>
    <p className="mt-4 text-2xl font-semibold">S/ {plan.price.toFixed(2)} <span className="text-sm font-normal text-neo-white/70">/ mes</span></p>
    <ul className="my-5 list-disc space-y-3 pl-5 text-sm leading-relaxed text-neo-white/80">{plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
    <p id="plan-confirm-note" className="text-sm leading-relaxed text-neo-white/70">Al confirmar, el sistema finalizará tu plan actual y activará el seleccionado. El cambio quedará registrado en tu historial cuando el servidor lo confirme.</p>
    {error && <p role="alert" className="mt-4 text-sm text-neo-cyan">{error}</p>}
    {busy && <p role="status" className="mt-4 text-sm text-neo-cyan">Actualizando tu plan…</p>}
    <div className="mt-6 flex flex-wrap gap-3">
      <button type="button" autoFocus disabled={busy} onClick={onClose} className={`${buttonClass} border border-neo-white/25 hover:border-neo-cyan`}>Cancelar</button>
      <button type="button" disabled={busy} onClick={onConfirm} className={`${buttonClass} bg-neo-violet hover:bg-neo-violet/80`}>Confirmar cambio</button>
    </div>
  </dialog>
}

export default function Suscripciones() {
  const { user } = useAuth()
  const plans = useResource(getPlans)
  const subscription = useSubscription()
  const action = useAsyncAction()
  const [selected, setSelected] = useState(null)
  const ready = !!user && !!subscription.data && !subscription.loading && !subscription.error
  const choose = (plan) => {
    if (!ready || action.loading || subscription.data.code === plan.code) return
    action.reset()
    setSelected({ ...presentSubscription(plan), code: plan.code })
  }
  const confirm = async () => {
    if (!selected || !ready || action.loading || selected.code === subscription.data.code) return
    const updated = await action.run(async () => {
      const result = await changeSubscription(selected.code)
      if (result?.code !== selected.code) throw new Error('El servidor no confirmó el plan seleccionado. Vuelve a consultar tu suscripción.')
      subscription.retry()
    }, `Tu plan ${selected.name} está activo.`)
    if (updated) setSelected(null)
  }
  return <div className="space-y-8">
    <div><p className="text-xs font-semibold tracking-widest text-neo-cyan">TU EXPERIENCIA OTAKUZONE</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Suscripciones</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-neo-white/70">Explora nuevas historias con Free o elige Premium para disfrutar de tu insignia y una navegación sin espacios promocionales en Inicio.</p></div>
    <ShopNavigation />
    {!user && <Link to="/cuenta" className="inline-flex min-h-11 items-center rounded text-neo-cyan focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neo-cyan">Inicia sesión para elegir tu plan</Link>}
    <ResourceState resource={plans} empty={!plans.data?.length} emptyMessage="No hay planes disponibles." />
    {user && <><ResourceState resource={subscription} />{subscription.data && <p role="status" className="rounded-xl border border-neo-cyan/25 bg-neo-slate/30 px-5 py-4 text-sm">Plan actual: <strong className="text-neo-cyan">{subscription.data.code === 'premium' ? 'Premium' : 'Free'}</strong></p>}</>}
    {!selected && <ActionMessage action={action} />}
    <div className="grid items-stretch gap-6 md:grid-cols-2">{plans.data?.map((plan) => <SubscriptionCard key={plan.code} plan={{ ...presentSubscription(plan), action: user && subscription.data?.code === plan.code ? 'Tu plan actual' : `Elegir ${presentSubscription(plan).name}` }} onChoose={user ? () => choose(plan) : null} to="/cuenta" disabled={!ready || action.loading || subscription.data?.code === plan.code} />)}</div>
    {subscription.premium && <section aria-label="Beneficios Premium activos" className="rounded-xl border border-neo-cyan/30 bg-neo-slate/30 p-5"><h2 className="font-heading text-lg font-semibold text-neo-cyan">Tu experiencia Premium está activa</h2><p className="mt-3 text-sm leading-relaxed text-neo-white/75">Tu insignia aparece en el encabezado y los espacios promocionales de Inicio permanecen ocultos mientras tu plan Premium esté activo.</p></section>}
    {user && subscription.data && <section><h2 className="font-heading text-xl">Historial de planes</h2><ol className="mt-4 space-y-3 text-sm">{subscription.data.history.map((entry, index) => <li key={index} className="rounded-lg border border-neo-violet/25 p-4 leading-relaxed">{entry.code === 'premium' ? 'Premium' : 'Free'} · {entry.status} · {new Date(entry.startedAt).toLocaleString('es-PE')}{entry.endedAt && ` hasta ${new Date(entry.endedAt).toLocaleString('es-PE')}`}</li>)}</ol></section>}
    {selected && <PlanConfirmation plan={selected} busy={action.loading} error={action.error} onConfirm={confirm} onClose={() => setSelected(null)} />}
  </div>
}
