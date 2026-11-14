import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createAuthController } from '../controllers/authController.js'
import { authenticate, authorize, browserMutation, publicAuthMutation, sessionCsrf } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { registerBody, loginBody, profileBody, noBody } from '../validators/auth.js'
import { emptyQuery } from '../validators/catalog.js'
import { failure } from '../utils/responses.js'
import HttpError from '../utils/HttpError.js'

export function createAuthRoutes(service, config) {
  const router = Router()
  if (!service) {
    router.use('/auth', (_request, _response, next) => next(new HttpError(503, 'AUTH_UNAVAILABLE', 'El servicio de autenticación no está disponible.')))
    router.use('/admin', (_request, _response, next) => next(new HttpError(503, 'AUTH_UNAVAILABLE', 'El servicio de autenticación no está disponible.')))
    return router
  }
  const controller = createAuthController(service, config.auth)
  const privateRoute = authenticate(service, config.auth)
  const write = browserMutation(config.origins)
  const limit = rateLimit({ windowMs: config.auth.rateWindowMs, limit: config.auth.rateMax, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_request, response) => failure(response, 429, 'AUTH_RATE_LIMITED', 'Demasiados intentos. Espera antes de volver a intentarlo.') })
  router.get('/auth/session', validate(emptyQuery, 'query'), controller.session)
  router.post('/auth/register', limit, write, publicAuthMutation, validate(emptyQuery, 'query'), validate(registerBody, 'body'), controller.register)
  router.post('/auth/login', limit, write, publicAuthMutation, validate(emptyQuery, 'query'), validate(loginBody, 'body'), controller.login)
  router.get('/auth/me', privateRoute, validate(emptyQuery, 'query'), controller.me)
  router.patch('/auth/me', privateRoute, write, sessionCsrf(service), validate(emptyQuery, 'query'), validate(profileBody, 'body'), controller.update)
  router.post('/auth/logout', privateRoute, write, sessionCsrf(service), validate(emptyQuery, 'query'), validate(noBody, 'body'), controller.logout)
  router.get('/admin/overview', privateRoute, authorize('ADMIN'), validate(emptyQuery, 'query'), controller.overview)
  return router
}
