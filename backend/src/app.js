import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { loadConfig } from './config/env.js'
import { createCatalogSource } from './config/catalogSource.js'
import { createCatalogService } from './services/catalogService.js'
import { createRoutes } from './routes/index.js'
import HttpError from './utils/HttpError.js'
import { failure } from './utils/responses.js'
import { errorHandler, notFound } from './middlewares/errors.js'

export function createApp({ config = loadConfig(), repository } = {}) {
  const app = express()
  const source = repository ? { repository, close: async () => {} } : createCatalogSource(config)
  app.locals.closeResources = source.close
  app.set('env', config.environment)
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.set('query parser', 'simple')
  app.use(helmet())
  app.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || config.origins.includes(origin)) return callback(null, true)
      return callback(new HttpError(403, 'CORS_ORIGIN_DENIED', 'El origen de la solicitud no está permitido.'))
    },
    methods: ['GET', 'HEAD', 'OPTIONS'], allowedHeaders: ['Accept', 'Content-Type'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'], credentials: false, maxAge: 600,
  }))
  app.use('/api/v1', rateLimit({
    windowMs: config.rateLimitWindowMs, limit: config.rateLimitMax,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, response) => failure(response, 429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera antes de volver a intentarlo.'),
  }))
  app.use(express.json({ limit: '10kb', strict: true }))
  app.use('/api/v1', createRoutes(createCatalogService(source.repository)))
  app.use(notFound)
  app.use(errorHandler)
  return app
}
