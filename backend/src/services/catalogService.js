import HttpError from '../utils/HttpError.js'

export function createCatalogService(repository) {
  return {
    async listProducts(query) {
      const items = await repository.findProducts(query)
      const compare = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name, 'es') }[query?.order]
      return compare ? items.sort(compare) : items
    },
    listCategories: () => repository.findCategories(),
    listPromotions: () => repository.findPromotions(),
    async getProduct(id) {
      const item = await repository.findProductById(id)
      if (!item) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto solicitado no existe.')
      return item
    },
    async getCategory(id) {
      const item = await repository.findCategoryById(id)
      if (!item) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'La categoría solicitada no existe.')
      return item
    },
  }
}
