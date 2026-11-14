import { executeRows } from '../db/pool.js'
import { catalogSql } from '../db/catalogSql.js'
import { withTransaction } from '../db/transaction.js'

const productDto = (row) => ({ ...row, price: Number(row.price) })
export function createMysqlCatalogRepository(pool) {
  return {
    async findProducts({ categoryId, q } = {}) {
      const rows = await executeRows(pool, catalogSql.products, [categoryId || null, categoryId || null, q || null, q || null])
      return rows.map(productDto)
    },
    async findProductById(id) { const rows = await executeRows(pool, catalogSql.product, [id]); return rows[0] ? productDto(rows[0]) : null },
    async findCategories() { return executeRows(pool, catalogSql.categories) },
    async findCategoryById(id) { return (await executeRows(pool, catalogSql.category, [id]))[0] ?? null },
    async findPromotions() { return executeRows(pool, catalogSql.promotions) },
    async createProductWithInventory(product, quantity) {
      return withTransaction(pool, async (connection) => {
        await executeRows(connection, catalogSql.insertProduct, [product.id, product.categoryId, product.name, product.description, product.price.toFixed(2), product.imageKey, product.imageAlt])
        await executeRows(connection, catalogSql.insertInventory, [product.id, quantity])
        return { ...product }
      })
    },
  }
}
