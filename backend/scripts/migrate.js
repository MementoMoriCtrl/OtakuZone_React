import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { migrateDatabase } from '../src/db/migrate.js'

loadEnvironment()
try { await migrateDatabase(loadDatabaseConfig(process.env, { context: 'migration' })) }
catch (error) { console.error('Migración no completada:', error.code ?? error.message); process.exitCode = 1 }
