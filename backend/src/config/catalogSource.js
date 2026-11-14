import { createDatabasePool } from '../db/pool.js'
import { createMysqlCatalogRepository } from '../repositories/mysqlCatalogRepository.js'
import { createDemoCatalogRepository } from '../repositories/demoCatalogRepository.js'

export function createCatalogSource(config) {
  if (config.catalogSource !== 'mysql') return { repository: createDemoCatalogRepository(config.demoDataPath), pool: null, close: async () => {} }
  const pool = createDatabasePool(config.database)
  return { repository: createMysqlCatalogRepository(pool), pool, close: () => pool.end() }
}
