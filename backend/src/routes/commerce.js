import { Router } from 'express'
import { authenticate, browserMutation, sessionCsrf } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { emptyQuery, idParams } from '../validators/catalog.js'
import { quantityBody, addBody, orderParams, checkoutBody, planBody } from '../validators/commerce.js'
import { noBody } from '../validators/auth.js'
import { createCommerceController } from '../controllers/commerceController.js'
import HttpError from '../utils/HttpError.js'

export function createCommerceRoutes(service, auth, config) {
  const router = Router()
  if (!service || !auth) {
    for (const path of ['/cart', '/orders', '/plans', '/subscription']) router.use(path, () => { throw new HttpError(503, 'COMMERCE_UNAVAILABLE', 'La tienda requiere MySQL y autenticación disponibles.') })
    return router
  }
  const controller = createCommerceController(service)
  const privateRoute = authenticate(auth, config.auth)
  const mutation = [privateRoute, browserMutation(config.origins), sessionCsrf(auth), validate(emptyQuery, 'query')]
  router.get('/plans', validate(emptyQuery, 'query'), controller.plans)
  router.get('/cart', privateRoute, validate(emptyQuery, 'query'), controller.cart)
  router.post('/cart/items', ...mutation, validate(addBody, 'body'), controller.add)
  router.patch('/cart/items/:id', ...mutation, validate(idParams, 'params'), validate(quantityBody, 'body'), controller.update)
  router.delete('/cart/items/:id', ...mutation, validate(idParams, 'params'), validate(noBody, 'body'), controller.remove)
  router.post('/orders', ...mutation, validate(checkoutBody, 'body'), controller.checkout)
  router.get('/orders', privateRoute, validate(emptyQuery, 'query'), controller.orders)
  router.get('/orders/:id', privateRoute, validate(emptyQuery, 'query'), validate(orderParams, 'params'), controller.order)
  router.get('/subscription', privateRoute, validate(emptyQuery, 'query'), controller.subscription)
  router.patch('/subscription', ...mutation, validate(planBody, 'body'), controller.changePlan)
  return router
}
