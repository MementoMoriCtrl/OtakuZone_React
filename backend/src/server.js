import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { loadConfig } from './config/env.js'
import { createApp } from './app.js'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
try {
  const config = loadConfig()
  const server = createApp({ config }).listen(config.port, config.host, () => {
    console.log(`OtakuZone API: http://${config.host}:${config.port}/api/v1`)
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on('error', (error) => { console.error(`No se pudo iniciar el servidor (${error.code ?? 'ERROR'}).`); process.exitCode = 1 })
  const shutdown = () => {
    server.close(() => process.exit(0))
    setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10000).unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
