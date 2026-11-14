import { loadEnvironment } from './config/loadEnvironment.js'
import { loadConfig } from './config/env.js'
import { createApp } from './app.js'
import { createCatalogSource } from './config/catalogSource.js'
import { checkDatabaseConnection } from './db/pool.js'

loadEnvironment()
let source
try {
  const config = loadConfig()
  source = createCatalogSource(config)
  if (source.pool) await checkDatabaseConnection(source.pool)
  const server = createApp({ config, repository: source.repository }).listen(config.port, config.host, () => {
    console.log(`OtakuZone API: http://${config.host}:${config.port}/api/v1`)
    console.log(`Fuente de catálogo: ${config.catalogSource}`)
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on('error', async (error) => { console.error(`No se pudo iniciar el servidor (${error.code ?? 'ERROR'}).`); await source.close(); process.exitCode = 1 })
  const shutdown = () => {
    server.close(async () => { await source.close(); process.exit(0) })
    setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10000).unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error(error.code ? `No se pudo iniciar MySQL (${error.code}).` : error.message)
  if (source) await source.close()
  process.exitCode = 1
}
