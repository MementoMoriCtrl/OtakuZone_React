import Hero from '../components/home/Hero.jsx'
import AnimeSection from '../components/home/AnimeSection.jsx'
import CategoryCard from '../components/home/CategoryCard.jsx'
import ProductCard from '../components/home/ProductCard.jsx'
import SubscriptionCard from '../components/home/SubscriptionCard.jsx'
import CTASection from '../components/home/CTASection.jsx'
import SectionHeading from '../components/common/SectionHeading.jsx'
import DevelopmentCheck from '../components/common/DevelopmentCheck.jsx'
import { subscriptions } from '../data/homeData.js'
import { getPopularAnime, getCurrentAnime, getAnimeGenres } from '../services/jikan.js'
import { getProducts, getPromotions } from '../services/otakuzone.js'
import useResource from '../hooks/useResource.js'
import ResourceState from '../components/common/ResourceState.jsx'
import { Link } from 'react-router-dom'

export default function Home() {
  const genres = useResource(getAnimeGenres)
  const products = useResource(getProducts)
  const promotions = useResource(getPromotions)
  return (
    <div className="space-y-14 sm:space-y-20">
      <Hero />
      <AnimeSection id="popular-title" eyebrow="LA SELECCIÓN OTAKUZONE" title="Animes populares" description="Información real de Jikan / MyAnimeList, ordenada por popularidad. Las sinopsis pueden estar en inglés." loader={getPopularAnime} />
      <AnimeSection id="latest-title" eyebrow="NUEVAS HISTORIAS, NUEVOS MUNDOS" title="Últimos lanzamientos" description="Animes de la temporada actual según Jikan. Esta selección de temporada no representa un orden por fecha de estreno." loader={getCurrentAnime} isNew />
      <section aria-labelledby="genres-title">
        <SectionHeading id="genres-title" eyebrow="SIGUE TU CURIOSIDAD" title="Explorar por géneros" description="Géneros reales de Jikan. Elige uno para filtrar el catálogo." />
        <ResourceState resource={genres} empty={!genres.data?.length} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {genres.data?.slice(0, 6).map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
      <section aria-labelledby="shop-title">
        <SectionHeading id="shop-title" eyebrow="LLEVA TU UNIVERSO CONTIGO" title="Tienda Otaku" description="Productos dinámicos de la API OtakuZone. Productos, imágenes ilustrativas y precios en soles son demostrativos. No se realizan compras." to="/tienda" linkLabel="Explorar tienda" />
        <ResourceState resource={products} empty={!products.data?.length} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.data?.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
        <div className="mt-6 space-y-3" aria-label="Promociones de demostración">
          <ResourceState resource={promotions} empty={!promotions.data?.length} emptyMessage="No hay promociones de demostración disponibles." />
          {promotions.data?.map((promotion) => <Link key={promotion.id} to={promotion.to} className="block rounded-xl border border-neo-cyan/25 bg-neo-slate/40 p-5 focus-visible:outline-2 focus-visible:outline-neo-cyan"><span className="text-xs text-neo-cyan">PROMOCIÓN DEMOSTRATIVA</span><h3 className="mt-2 font-semibold">{promotion.title}</h3><p className="mt-2 text-sm text-neo-white/70">{promotion.description}</p></Link>)}
        </div>
      </section>
      <section aria-labelledby="plans-title">
        <SectionHeading id="plans-title" eyebrow="ELIGE CÓMO VIVIRLO" title="Un universo, dos maneras de explorarlo" description="Planes Free y Premium propuestos para una futura simulación académica. Los beneficios todavía no se activan. No hay contrataciones ni pagos; los enlaces llevan a Tienda Otaku." />
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {subscriptions.map((plan) => <SubscriptionCard key={plan.id} plan={plan} />)}
        </div>
      </section>
      <CTASection />
      {import.meta.env.DEV && <DevelopmentCheck />}
    </div>
  )
}
