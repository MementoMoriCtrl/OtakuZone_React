import { presentSubscription } from '../data/homeData.js'
import Hero from '../components/home/Hero.jsx'
import AnimeSection from '../components/home/AnimeSection.jsx'
import CategoryCard from '../components/home/CategoryCard.jsx'
import ProductCard from '../components/home/ProductCard.jsx'
import SubscriptionCard from '../components/home/SubscriptionCard.jsx'
import CTASection from '../components/home/CTASection.jsx'
import SectionHeading from '../components/common/SectionHeading.jsx'
import { getPlans } from '../services/commerce.js'
import { getPopularAnime, getCurrentAnime, getAnimeGenres } from '../services/anilist.js'
import { getProducts } from '../services/otakuzone.js'
import useResource from '../hooks/useResource.js'
import ResourceState from '../components/common/ResourceState.jsx'

export default function Home() {
  const genres = useResource(getAnimeGenres)
  const products = useResource(getProducts)
  const plans = useResource(getPlans)
  return (
    <div className="space-y-14 sm:space-y-20">
      <Hero />
      <AnimeSection id="popular-title" eyebrow="LA SELECCIÓN OTAKUZONE" title="Animes populares" description="Descubre los títulos más populares. Las sinopsis pueden estar en inglés." loader={getPopularAnime} />
      <AnimeSection id="latest-title" eyebrow="NUEVAS HISTORIAS, NUEVOS MUNDOS" title="Últimos lanzamientos" description="Explora los animes de la temporada actual." loader={getCurrentAnime} isNew />
      <section aria-labelledby="genres-title">
        <SectionHeading id="genres-title" eyebrow="SIGUE TU CURIOSIDAD" title="Explorar por géneros" description="Elige tu género favorito y descubre nuevas historias." />
        <ResourceState resource={genres} empty={!genres.data?.length} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {genres.data?.slice(0, 6).map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
      <section aria-labelledby="shop-title">
        <SectionHeading id="shop-title" eyebrow="LLEVA TU UNIVERSO CONTIGO" title="Tienda Otaku" description="Explora nuestra selección otaku y organiza tu carrito. Las imágenes son ilustrativas; no se realizan cobros ni envíos reales." to="/tienda" linkLabel="Explorar tienda" />
        <ResourceState resource={products} empty={!products.data?.length} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.data?.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      </section>
      <section aria-labelledby="plans-title">
        <SectionHeading id="plans-title" eyebrow="ELIGE CÓMO VIVIRLO" title="Un universo, dos maneras de explorarlo" description="Explora con Free o elige Premium para mostrar tu insignia en OtakuZone." />
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <ResourceState resource={plans} empty={!plans.data?.length} emptyMessage="No hay planes disponibles." />
          {plans.data?.map((plan) => <SubscriptionCard key={plan.code} plan={{ ...presentSubscription(plan), action: 'Ver suscripciones' }} />)}
        </div>
      </section>
      <CTASection />
    </div>
  )
}
