import { z } from 'zod'
import { slug } from './catalog.js'
export const quantityBody = z.object({ quantity: z.number().int().min(1).max(99) }).strict()
export const addBody = quantityBody.extend({ productId: slug }).strict()
export const numericId = z.string().regex(/^[1-9]\d{0,18}$/)
export const orderParams = z.object({ id: numericId }).strict()
export const checkoutBody = z.object({ cartId: numericId, idempotencyKey: z.string().uuid() }).strict()
export const planBody = z.object({ code: z.enum(['free', 'premium']) }).strict()
