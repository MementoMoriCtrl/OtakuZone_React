export const legacyTidbDatabase = 'otakuzone_db'
export const productionTidbDatabase = 'otakuzone_prod'
export const databaseBindingRule = 'otakuzone-tidb-database-binding-v1'

// Runtime is production-only. Historical/offline contracts retain their explicit scope.
export function productionTidbTarget(value) {
  if (value !== productionTidbDatabase) throw new Error('Runtime TiDB requiere DB_NAME=otakuzone_prod explícito; destino histórico no permitido.')
  return value
}

// Bounded destinations: never interpolate an arbitrary environment identifier.
export function tidbDatabase(value = legacyTidbDatabase) {
  if (![legacyTidbDatabase, productionTidbDatabase].includes(value)) throw new Error('Destino TiDB inválido: únicamente otakuzone_db u otakuzone_prod.')
  return value
}

export function bindTidbCatalog(catalog, database) {
  if (catalog.dialect !== 'tidb') throw new Error('Solo se pueden vincular catálogos TiDB.')
  return { ...catalog, database: tidbDatabase(database), databaseBindingRule }
}
