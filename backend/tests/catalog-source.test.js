import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createDemoCatalogRepository } from '../src/repositories/demoCatalogRepository.js'
import { catalogSql } from '../src/db/catalogSql.js'

async function start(context, repository, catalogSource) {
  const config = { ...loadConfig({ NODE_ENV: 'test' }), catalogSource }
  const server = createApp({ config, repository }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}/api/v1`
}

test('MySQL repository reports mysql for all collections and details despite demo config/content', async context => {
  const product = { id: 'demo-product', name: 'Producto ficticio', price: '12.50', available: '2' }
  const category = { id: 'demo-category', name: 'Ejemplos' }
  const promotion = { id: 'demo-promotion', title: 'Demo', description: 'Ficticia', to: '/tienda' }
  const values = new Map([[catalogSql.products, product], [catalogSql.product, product], [catalogSql.categories, category], [catalogSql.category, category], [catalogSql.promotions, promotion]])
  const calls = []
  // Real repository with a simulated executor: SQL is never sent to a server.
  const repository = createMysqlCatalogRepository({ execute: async (sql, parameters) => {
    assert.ok(values.has(sql)); calls.push({ sql, parameters }); return [[values.get(sql)]]
  } })
  const base = await start(context, repository, 'demo')
  for (const [path, data] of [
    ['/products', [{ ...product, price: 12.5, available: 2 }]], ['/categories', [category]], ['/promotions', [promotion]],
    ['/products/demo-product', { ...product, price: 12.5, available: 2 }], ['/categories/demo-category', category],
  ]) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, data, meta: { source: 'mysql', ...(Array.isArray(data) ? { count: 1 } : {}) } })
  }
  assert.equal(calls.length, 5)
})

test('demo repository reports demo for all collections and details despite mysql config', async context => {
  const config = loadConfig({ NODE_ENV: 'test' })
  const repository = createDemoCatalogRepository(config.demoDataPath)
  const base = await start(context, repository, 'mysql')
  for (const path of ['/products', '/categories', '/promotions', '/products/figura-mensajera', '/categories/figuras']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.success, true)
    assert.equal(body.meta.source, 'demo')
    if (Array.isArray(body.data)) assert.equal(body.meta.count, body.data.length)
  }
})
