import { Router } from 'express'
import { createCatalogController } from '../controllers/catalogController.js'
import { health } from '../controllers/healthController.js'
import { emptyQuery, idParams, productQuery } from '../validators/catalog.js'
import { validate } from '../middlewares/validate.js'
import { methodNotAllowed } from '../middlewares/errors.js'

export function createRoutes(service) {
  const router = Router()
  const catalog = createCatalogController(service)
  router.get('/health', validate(emptyQuery, 'query'), health)
  router.get('/products', validate(productQuery, 'query'), catalog.products)
  router.get('/products/:id', validate(emptyQuery, 'query'), validate(idParams, 'params'), catalog.product)
  router.get('/categories', validate(emptyQuery, 'query'), catalog.categories)
  router.get('/categories/:id', validate(emptyQuery, 'query'), validate(idParams, 'params'), catalog.category)
  router.get('/promotions', validate(emptyQuery, 'query'), catalog.promotions)
  for (const path of ['/health', '/products', '/products/:id', '/categories', '/categories/:id', '/promotions']) router.all(path, methodNotAllowed)
  return router
}
