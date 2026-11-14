import { useState } from 'react'
import ProductCard from '../components/home/ProductCard.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import useResource from '../hooks/useResource.js'
import { getProducts, getProductCategories } from '../services/otakuzone.js'

export default function Tienda() {
  const products = useResource(getProducts)
  const categories = useResource(getProductCategories)
  const [category, setCategory] = useState('')
  const items = (products.data ?? []).filter((product) => !category || product.categoryId === category)
  const names = new Map(categories.data?.map((item) => [item.id, item.name]))
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">PRODUCTOS DEMOSTRATIVOS</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Tienda Otaku<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Catálogo dinámico de la API OtakuZone. Productos ficticios, imágenes ilustrativas reutilizadas y precios demostrativos en soles. Sin compras, stock real ni activación de planes Free/Premium.</p></div>
    <label className="block max-w-sm text-sm">Categoría<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-neo-violet/40 bg-neo-midnight px-3 py-2 focus-visible:outline-2 focus-visible:outline-neo-cyan"><option value="">Todas las categorías</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <ResourceState resource={categories} empty={!categories.data?.length} emptyMessage="No hay categorías disponibles." />
    <section aria-label="Productos de demostración" aria-busy={products.loading}>
      <ResourceState resource={products} empty={!items.length} emptyMessage="No hay productos disponibles para esta selección." />
      {!products.loading && !products.error && <><p role="status" className="mb-4 text-sm text-neo-white/65">{items.length} productos demostrativos</p><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((product) => <ProductCard key={product.id} product={{ ...product, category: names.get(product.categoryId) ?? 'Categoría no disponible' }} inStore />)}</div></>}
    </section>
  </div>
}
