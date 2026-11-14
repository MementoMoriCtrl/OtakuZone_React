import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import useResource from '../hooks/useResource.js'
import { getProduct } from '../services/otakuzone.js'
import ProductCard from '../components/home/ProductCard.jsx'
import ResourceState from '../components/common/ResourceState.jsx'
import ShopNavigation from '../components/common/ShopNavigation.jsx'
export default function Producto() {
  const { id } = useParams()
  const loader = useCallback((options) => getProduct(id, options), [id])
  const resource = useResource(loader)
  return <div className="space-y-6"><h1 className="font-heading text-3xl font-semibold">Detalle del producto</h1><ShopNavigation /><ResourceState resource={resource} />{resource.data && <div className="max-w-lg"><ProductCard product={resource.data} inStore /></div>}</div>
}
