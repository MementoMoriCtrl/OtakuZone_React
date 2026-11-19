import { readFile } from 'node:fs/promises'
import { demoCatalog } from '../validators/catalog.js'

// Fuente demostrativa única compartida con JSON Server. Solo lectura.
// El contrato de este repositorio podrá implementarse con MySQL en otra fase.
export function createDemoCatalogRepository(path) {
  const read = async () => demoCatalog.parse(JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')))
  return {
    source: 'demo',
    async findProducts({ categoryId, q } = {}) {
      const { products } = await read()
      return products.filter((item) => (!categoryId || item.categoryId === categoryId) && (!q || item.name.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es'))))
    },
    async findProductById(id) { return (await read()).products.find((item) => item.id === id) ?? null },
    async findCategories() { return (await read()).categories },
    async findCategoryById(id) { return (await read()).categories.find((item) => item.id === id) ?? null },
    async findPromotions() { return (await read()).promotions },
  }
}
