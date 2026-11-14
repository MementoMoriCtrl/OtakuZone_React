import Hero from '../components/home/Hero.jsx'
import AnimeSection from '../components/home/AnimeSection.jsx'
import CategoryCard from '../components/home/CategoryCard.jsx'
import ProductCard from '../components/home/ProductCard.jsx'
import SubscriptionCard from '../components/home/SubscriptionCard.jsx'
import CTASection from '../components/home/CTASection.jsx'
import SectionHeading from '../components/common/SectionHeading.jsx'
import DevelopmentCheck from '../components/common/DevelopmentCheck.jsx'
import { categories, latestAnime, popularAnime, products, subscriptions } from '../data/homeData.js'

export default function Home() {
  return (
    <div className="space-y-14 sm:space-y-20">
      <Hero />
      <AnimeSection id="popular-title" eyebrow="LA SELECCIÓN OTAKUZONE" title="Animes populares" description="Un primer vistazo a otros mundos. Obras, imágenes, puntuaciones y popularidad ficticias: todos son datos de muestra para este proyecto académico." anime={popularAnime} />
      <AnimeSection id="latest-title" eyebrow="NUEVAS HISTORIAS, NUEVOS MUNDOS" title="Últimos lanzamientos" description="Una selección de novedades de muestra. Los títulos y las temporadas son ficticios; no representan un calendario real de estrenos." anime={latestAnime} isNew />
      <section aria-labelledby="genres-title">
        <SectionHeading id="genres-title" eyebrow="SIGUE TU CURIOSIDAD" title="Explorar por géneros" description="Cada historia tiene su propio ritmo. Elige el tuyo y visita el catálogo general; los filtros por género estarán disponibles más adelante." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
      <section aria-labelledby="shop-title">
        <SectionHeading id="shop-title" eyebrow="LLEVA TU UNIVERSO CONTIGO" title="Tienda Otaku" description="Objetos para quienes viven cada historia. Productos e imágenes de muestra, con precios ficticios en soles peruanos. Los enlaces llevan a la presentación provisional de la tienda; aún no se realizan compras." to="/tienda" linkLabel="Explorar tienda" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
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
