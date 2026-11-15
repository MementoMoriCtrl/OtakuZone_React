import { useState } from 'react'
import ProductCard from '../components/home/ProductCard.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import useResource from '../hooks/useResource.js'
import { getProducts, getProductCategories } from '../services/otakuzone.js'
import ShopNavigation from '../components/common/ShopNavigation.jsx'

export default function Tienda() {
  const products = useResource(getProducts)
  const categories = useResource(getProductCategories)
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState('default')
  const items = (products.data ?? []).filter((product) => (!category || product.categoryId === category) && product.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))
  if (order === 'price-asc') items.sort((a, b) => a.price - b.price)
  if (order === 'price-desc') items.sort((a, b) => b.price - a.price)
  if (order === 'name') items.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const names = new Map(categories.data?.map((item) => [item.id, item.name]))
  return <div className="space-y-8">
    <div><p className="text-xs tracking-wider text-neo-cyan">DESCUBRE TU ESTILO OTAKU</p><h1 className="mt-3 font-heading text-3xl font-semibold sm:text-5xl">Tienda Otaku<span className="text-neo-cyan">.</span></h1><p className="mt-4 text-sm leading-relaxed text-neo-white/70">Explora figuras, mangas, polos y accesorios con precios en soles. Las imágenes son ilustrativas. No se realizan cobros ni envíos reales; las existencias mostradas no representan stock para entrega.</p></div>
    <ShopNavigation />
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Buscar productos<input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-neo-violet/40 bg-neo-midnight px-3" /></label><label className="text-sm">Ordenar productos<select name="order" value={order} onChange={(event) => setOrder(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-neo-violet/40 bg-neo-midnight px-3"><option value="default">Orden del catálogo</option><option value="price-asc">Precio: menor a mayor</option><option value="price-desc">Precio: mayor a menor</option><option value="name">Nombre</option></select></label></div>
    <label className="block max-w-sm text-sm">Categoría<select name="category" value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-neo-violet/40 bg-neo-midnight px-3 py-2 focus-visible:outline-2 focus-visible:outline-neo-cyan"><option value="">Todas las categorías</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <ResourceState resource={categories} empty={!categories.data?.length} emptyMessage="No hay categorías disponibles." />
    <section aria-label="Catálogo de productos" aria-busy={products.loading}>
      <ResourceState resource={products} empty={!items.length} emptyMessage="No hay productos disponibles para esta selección." />
      {!products.loading && !products.error && <><p role="status" className="mb-4 text-sm text-neo-white/65">{items.length} productos</p><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((product) => <ProductCard key={product.id} product={{ ...product, category: names.get(product.categoryId) ?? 'Categoría no disponible' }} inStore />)}</div></>}
    </section>
  </div>
}
