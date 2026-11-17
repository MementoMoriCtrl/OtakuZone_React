import { ApiError, createClient, safeImage } from './http.js'
import { productImages } from '../data/productImages.js'
import { readStoreCollection } from './storeContract.js'

import { resolveApiUrls } from '../config/api.js'
export const OTAKUZONE_URL = resolveApiUrls(import.meta.env).store
const get = createClient({ ttl: 30000 })
const getLive = createClient({ ttl: 0 })
function adaptProduct(item) {
  return { ...item, category: 'Selección otaku', image: safeImage(item.image) || productImages[item.imageKey] || null, imageAlt: item.imageAlt || `Imagen ilustrativa de ${item.name}` }
}
export async function getProduct(id, options) {
  return getLive(`${OTAKUZONE_URL}/products/${encodeURIComponent(id)}`, { ...options, transform: (body) => {
    const item = body?.success === true ? body.data : body
    if (!item?.id || !Number.isFinite(item.price)) throw new ApiError('Producto no disponible.')
    return adaptProduct(item)
  } })
}
export async function getProducts(options) {
  return getLive(`${OTAKUZONE_URL}/products`, { ...options, transform: (body) => readStoreCollection(body).map((item) => {
    if (!item || !['string', 'number'].includes(typeof item.id) || !item.id || typeof item.name !== 'string' || !Number.isFinite(item.price) || item.price < 0) throw new ApiError('No se pudo cargar la información del producto. Inténtalo de nuevo.')
    return { ...item, category: 'Selección otaku', description: typeof item.description === 'string' ? item.description : 'Descripción no disponible.', image: safeImage(item.image) || productImages[item.imageKey] || null, imageAlt: typeof item.imageAlt === 'string' ? item.imageAlt : `Imagen ilustrativa de ${item.name}` }
  }) })
}
export async function getProductCategories(options) {
  return get(`${OTAKUZONE_URL}/categories`, { ...options, transform: (body) => readStoreCollection(body).map((item) => {
    if (!item?.id || typeof item.name !== 'string') throw new ApiError('No se pudieron cargar las categorías. Inténtalo de nuevo.')
    return item
  }) })
}
export async function getPromotions(options) {
  return get(`${OTAKUZONE_URL}/promotions`, { ...options, transform: (body) => readStoreCollection(body).map((item) => {
    if (!item?.id || typeof item.title !== 'string' || typeof item.description !== 'string' || !['/animes', '/tienda'].includes(item.to)) throw new ApiError('No se pudieron cargar las promociones. Inténtalo de nuevo.')
    return item
  }) })
}
