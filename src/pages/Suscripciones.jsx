import { Link } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import useSubscription from '../hooks/useSubscription.js'
import useAsyncAction from '../hooks/useAsyncAction.js'
import useResource from '../hooks/useResource.js'
import { getPlans, changeSubscription } from '../services/commerce.js'
import SubscriptionCard from '../components/home/SubscriptionCard.jsx'
import ShopNavigation from '../components/common/ShopNavigation.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import ActionMessage from '../components/common/ActionMessage.jsx'

export default function Suscripciones() {
  const { user } = useAuth()
  const plans = useResource(getPlans)
  const subscription = useSubscription()
  const action = useAsyncAction()
  const choose = (code) => action.run(async () => { await changeSubscription(code); subscription.retry() }, 'Plan demostrativo actualizado. No se ha realizado ningún cobro.')
  return <div className="space-y-6"><h1 className="font-heading text-3xl font-semibold">Suscripciones</h1><ShopNavigation /><p className="text-sm text-neo-white/70">Planes académicos simulados, sin pasarela de pago ni tarjetas. Puedes cambiar de plan sin cobros. Premium oculta espacios promocionales simulados y muestra una insignia; no cambia los precios de los productos.</p>{!user && <Link to="/cuenta" className="inline-flex min-h-11 items-center text-neo-cyan">Inicia sesión para activar un plan</Link>}<ResourceState resource={plans} empty={!plans.data?.length} emptyMessage="No hay planes disponibles." />{user && <><ResourceState resource={subscription} /><p role="status">Plan actual: {subscription.data?.code?.toUpperCase() ?? 'Consultando…'}</p></>}<ActionMessage action={action} />
    <div className="grid gap-6 md:grid-cols-2">{plans.data?.map((plan) => <SubscriptionCard key={plan.code} plan={{ name: plan.name, price: Number(plan.price), featured: plan.code === 'premium', tagline: 'Suscripción académica simulada', benefits: plan.code === 'premium' ? ['Catálogo y favoritos', 'Sin espacios promocionales simulados', 'Insignia Premium', 'Contenido exclusivo de demostración'] : ['Acceso al catálogo', 'Favoritos locales', 'Espacios promocionales simulados'], action: subscription.data?.code === plan.code ? 'Plan activo' : `Elegir ${plan.code.toUpperCase()}` }} onChoose={user ? () => choose(plan.code) : null} disabled={action.loading || subscription.loading || !!subscription.error || subscription.data?.code === plan.code} />)}</div>
    {subscription.premium && <section aria-label="Beneficio Premium" className="rounded-xl border border-neo-cyan/40 bg-neo-slate/30 p-5"><h2 className="font-heading text-xl text-neo-cyan">Zona Premium · demostración</h2><p className="mt-3 text-sm">Beneficio exclusivo académico: vista previa de la colección Neo Tokyo. No supone acceso comercial ni productos gratuitos.</p></section>}
    {user && subscription.data && <section><h2 className="font-heading text-xl">Historial de planes</h2><ol className="mt-4 space-y-3 text-sm">{subscription.data.history.map((entry, index) => <li key={index} className="rounded-lg border border-neo-violet/25 p-3">{entry.code.toUpperCase()} · {entry.status} · {new Date(entry.startedAt).toLocaleString('es-PE')}{entry.endedAt && ` hasta ${new Date(entry.endedAt).toLocaleString('es-PE')}`}</li>)}</ol></section>}
  </div>
}
