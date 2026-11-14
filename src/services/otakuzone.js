import { ApiError, createClient, requireList, safeImage } from './http.js'
import { productImages } from '../data/productImages.js'

export const OTAKUZONE_URL = (import.meta.env?.VITE_OTAKUZONE_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const get = createClient({ ttl: 30000 })
export async function getProducts(options) {
  return get(`${OTAKUZONE_URL}/products`, { ...options, transform: (body) => requireList(body).map((item) => {
    if (!item || !['string', 'number'].includes(typeof item.id) || !item.id || typeof item.name !== 'string' || !Number.isFinite(item.price) || item.price < 0) throw new ApiError('La API de tienda devolvió un producto inválido.')
    return { ...item, category: 'Producto de demostración', description: typeof item.description === 'string' ? item.description : 'Producto ficticio de demostración.', image: safeImage(item.image) || productImages[item.imageKey] || null, imageAlt: typeof item.imageAlt === 'string' ? item.imageAlt : `Imagen ilustrativa de ${item.name}` }
  }) })
}
export async function getProductCategories(options) {
  return get(`${OTAKUZONE_URL}/categories`, { ...options, transform: (body) => requireList(body).map((item) => {
    if (!item?.id || typeof item.name !== 'string') throw new ApiError('La API de tienda devolvió una categoría inválida.')
    return item
  }) })
}
export async function getPromotions(options) {
  return get(`${OTAKUZONE_URL}/promotions`, { ...options, transform: (body) => requireList(body).map((item) => {
    if (!item?.id || typeof item.title !== 'string' || typeof item.description !== 'string' || !['/animes', '/tienda'].includes(item.to)) throw new ApiError('La API de tienda devolvió una promoción inválida.')
    return item
  }) })
}
