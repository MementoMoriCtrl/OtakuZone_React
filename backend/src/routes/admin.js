import { Router } from 'express'
import { authenticate, authorize, browserMutation, sessionCsrf } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { emptyQuery,idParams } from '../validators/catalog.js'
import { orderParams } from '../validators/commerce.js'
import { noBody } from '../validators/auth.js'
import { pageQuery,createProductBody,productBody,createCategoryBody,categoryBody,inventoryBody,orderStateBody } from '../validators/admin.js'
import { createAdminController } from '../controllers/adminController.js'
import HttpError from '../utils/HttpError.js'
export function createAdminRoutes(service,auth,config) {
  const router=Router()
  if (!auth || !service) { router.use('/admin',()=>{throw new HttpError(503,'ADMIN_UNAVAILABLE','Administración requiere MySQL y autenticación.');}); return router }
  router.use('/admin',authenticate(auth,config.auth),authorize('ADMIN'))
  const c=createAdminController(service)
  const write=[browserMutation(config.origins),sessionCsrf(auth),validate(emptyQuery,'query')]
  router.get('/admin/dashboard',validate(emptyQuery,'query'),c.dashboard)
  for(const kind of ['products','categories','inventory','movements','orders','users']) router.get(`/admin/${kind}`,validate(pageQuery,'query'),c.list(kind))
  router.post('/admin/products',...write,validate(createProductBody,'body'),c.createProduct)
  router.put('/admin/products/:id',...write,validate(idParams,'params'),validate(productBody,'body'),c.updateProduct)
  router.delete('/admin/products/:id',...write,validate(idParams,'params'),validate(noBody,'body'),c.deactivateProduct)
  router.post('/admin/categories',...write,validate(createCategoryBody,'body'),c.createCategory)
  router.put('/admin/categories/:id',...write,validate(idParams,'params'),validate(categoryBody,'body'),c.updateCategory)
  router.patch('/admin/inventory/:id',...write,validate(idParams,'params'),validate(inventoryBody,'body'),c.inventory)
  router.get('/admin/orders/:id',validate(emptyQuery,'query'),validate(orderParams,'params'),c.order)
  router.patch('/admin/orders/:id/status',...write,validate(orderParams,'params'),validate(orderStateBody,'body'),c.orderState)
  return router
}
