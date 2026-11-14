import { z } from 'zod'
import { slug } from './catalog.js'
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict()
const name = z.string().trim().min(2).max(150)
const stock = z.number().int().min(0).max(1000000)
export const categoryBody = z.object({ name: name.max(100), active: z.boolean() }).strict()
export const createCategoryBody = categoryBody.extend({ id: slug })
export const productBody = z.object({ name, categoryId: slug, price: z.number().min(0).max(999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001), description: z.string().trim().min(1).max(2000), imageKey: z.enum(['figura', 'manga', 'polo', 'llavero']), imageAlt: z.string().trim().min(1).max(300), active: z.boolean() }).strict()
export const createProductBody = productBody.extend({ id: slug, quantity: stock })
export const inventoryBody = z.object({ quantity: stock, expectedQuantity: stock, reason: z.string().trim().min(5).max(300) }).strict()
export const orderStateBody = z.object({ status: z.enum(['cancelado', 'completado']), expectedStatus: z.enum(['pendiente', 'confirmado']) }).strict()
