import { success } from '../utils/responses.js'

export function createCatalogController(service) {
  const list = (method) => async (request, response) => {
    const data = await service[method](request.validated.query)
    return success(response, data, { source: 'demo', count: data.length })
  }
  const detail = (method) => async (request, response) => success(response, await service[method](request.validated.params.id), { source: 'demo' })
  return { products: list('listProducts'), categories: list('listCategories'), promotions: list('listPromotions'), product: detail('getProduct'), category: detail('getCategory') }
}
