import { loadEnvironment } from './config/loadEnvironment.js'
import { loadConfig } from './config/env.js'
import { createApp } from './app.js'
import { createCatalogSource } from './config/catalogSource.js'
import { checkDatabaseConnection, createDatabasePool } from './db/pool.js'

loadEnvironment()
let source
let authPool
const close = async () => { if (source) await source.close(); if (authPool && authPool !== source?.pool) await authPool.end() }
try {
  const config = loadConfig()
  source = createCatalogSource(config)
  if (source.pool) await checkDatabaseConnection(source.pool)
  if (config.auth) {
    authPool = source.pool ?? createDatabasePool(config.database)
    if (authPool !== source.pool) await checkDatabaseConnection(authPool)
    await authPool.execute('SELECT id FROM auth_sesiones LIMIT 0')
  }
  const server = createApp({ config, repository: source.repository, authPool }).listen(config.port, config.host, () => {
    console.log(`OtakuZone API: http://${config.host}:${config.port}/api/v1`)
    console.log(`Fuente de catálogo: ${config.catalogSource}`)
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on('error', async (error) => { console.error(`No se pudo iniciar el servidor (${error.code ?? 'ERROR'}).`); await close(); process.exitCode = 1 })
  const shutdown = () => {
    server.close(async () => { await close(); process.exit(0) })
    setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10000).unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error(error.code ? `No se pudo iniciar MySQL (${error.code}).` : error.message)
  await close()
  process.exitCode = 1
}
