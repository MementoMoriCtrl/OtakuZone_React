import { z } from 'zod'
import { slug } from '../validators/catalog.js'

const schema = z.object({
  product: z.object({ id: slug, categoryId: slug, name: z.string().min(1).max(150), description: z.string().max(2000), price: z.number().min(0).max(99999999.99).refine((value) => Number(value.toFixed(2)) === value), imageKey: z.enum(['figura','manga','polo','llavero']), imageAlt: z.string().max(300) }).strict(),
  initialQuantity: z.number().int().min(0).max(2147483647),
}).strict()

// Operación interna para mantenimiento/pruebas. Sin ruta HTTP pública y sin
// autenticación simulada: crear producto e inventario siempre es atómico.
export function createProductMaintenanceService(repository) {
  return {
    createWithInventory(input) {
      const value = schema.parse(input)
      return repository.createProductWithInventory(value.product, value.initialQuantity)
    },
  }
}
