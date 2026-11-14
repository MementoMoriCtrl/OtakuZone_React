import HttpError from '../utils/HttpError.js'

export function createCatalogService(repository) {
  return {
    listProducts: (query) => repository.findProducts(query),
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
