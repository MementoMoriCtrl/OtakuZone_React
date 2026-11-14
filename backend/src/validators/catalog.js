import { z } from 'zod'

export const slug = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const productQuery = z.object({ q: z.string().trim().max(100).optional(), categoryId: slug.optional() }).strict()
export const emptyQuery = z.object({}).strict()
export const idParams = z.object({ id: slug }).strict()

const product = z.object({
  id: slug, name: z.string().min(1).max(150), categoryId: slug,
  price: z.number().nonnegative(), imageKey: z.enum(['figura', 'manga', 'polo', 'llavero']),
  imageAlt: z.string().max(300), description: z.string().max(2000),
}).strict()
const category = z.object({ id: slug, name: z.string().min(1).max(100) }).strict()
const promotion = z.object({ id: slug, title: z.string().min(1).max(150), description: z.string().max(2000), to: z.enum(['/animes', '/tienda']) }).strict()
export const demoCatalog = z.object({ products: z.array(product), categories: z.array(category), promotions: z.array(promotion) }).strict().superRefine((data, context) => {
  for (const key of ['products', 'categories', 'promotions']) {
    if (new Set(data[key].map((item) => item.id)).size !== data[key].length) context.addIssue({ code: 'custom', path: [key], message: 'Identificadores duplicados' })
  }
  const categoryIds = new Set(data.categories.map((item) => item.id))
  if (data.products.some((item) => !categoryIds.has(item.categoryId))) context.addIssue({ code: 'custom', path: ['products'], message: 'Categoría inexistente' })
})
