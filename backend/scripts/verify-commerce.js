import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadConfig } from '../src/config/env.js'
import { createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema } from '../src/db/schemaCheck.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createApp } from '../src/app.js'
import { commerceSql } from '../src/db/commerceSql.js'
import { assertTestIsolation } from './test-isolation.js'

loadEnvironment()
const configured = loadConfig()
await assertTestIsolation(configured.database)
if (configured.environment === 'production' || !configured.auth) throw new Error('Requiere desarrollo con AUTH_ENABLED y MySQL reales.')
const pool = createDatabasePool(configured.database)
const nonce = randomUUID()
const emails = [`shop-a-${nonce}@example.test`, `shop-b-${nonce}@example.test`]
const products = [`shop-a-${nonce}`, `shop-b-${nonce}`]
let server
let checks = 0
let injectRollback = false
try {
  console.log('MySQL real:', JSON.stringify(await checkDatabaseSchema(pool)))
  const config = { ...configured, rateLimitMax: 1000, auth: { ...configured.auth, rateMax: 100 } }
  // Real connection and SQL; a scoped application fault proves rollback after writes.
  // No shared table, trigger, schema or existing record is modified for this test.
  const faultPool = new Proxy(pool, { get(target, property) {
    if (property === 'getConnection') return async () => {
      const connection = await target.getConnection()
      return new Proxy(connection, { get(c, key) {
        if (key === 'execute') return async (query, params) => {
          if (injectRollback && query === commerceSql.insertHistory) throw new Error('ROLLBACK_TEST')
          return c.execute(query, params)
        }
        return typeof c[key] === 'function' ? c[key].bind(c) : c[key]
      } })
    }
    return typeof target[property] === 'function' ? target[property].bind(target) : target[property]
  } })
  server = createApp({ config, repository: createMysqlCatalogRepository(pool), authPool: faultPool }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (path, { method = 'GET', body, account, csrf = true } = {}, expected = 200) => {
    const response = await fetch(base + path, { method, headers: { Origin: config.origins[0], ...(account ? { Cookie: account.cookie } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': csrf ? account?.csrf ?? '1' : '' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code ?? 'respuesta'}`)
    checks++
    return { data: result.data, status: response.status, cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  const register = async (email) => {
    const result = await call('/auth/register', { method: 'POST', body: { name: 'Cliente técnico', email, password: `Aa1-${randomBytes(20).toString('hex')}` } }, 201)
    return { id: result.data.user.id, csrf: result.data.csrfToken, cookie: result.cookie }
  }
  const a = await register(emails[0]); const b = await register(emails[1])
  const [[category]] = await pool.execute('SELECT id FROM categorias WHERE activa=1 ORDER BY id LIMIT 1')
  for (const id of products) {
    await pool.execute("INSERT INTO productos (id,categoria_id,nombre,descripcion,precio,image_key,alt_imagen) VALUES (?,?,'Producto técnico','Solo verificación',12.35,'manga','Prueba')", [id, category.id])
    await pool.execute('INSERT INTO inventario (producto_id,cantidad_total) VALUES (?,3)', [id])
  }
  const inventory = async (id) => (await pool.execute('SELECT cantidad_total AS n FROM inventario WHERE producto_id=?', [id]))[0][0].n
  const counts = async () => Number((await pool.execute('SELECT COUNT(*) AS n FROM pedidos WHERE usuario_id IN (?,?)', [a.id, b.id]))[0][0].n)
  await call('/cart', {}, 401)
  await call('/orders', {}, 401)
  await call('/subscription', {}, 401)
  await call('/subscription', { method: 'PATCH', body: { code: 'premium' } }, 401)
  const catalog = await call(`/products?categoryId=${category.id}&q=Producto&order=price-asc`)
  assert.ok(catalog.data.some((item) => item.id === products[0] && item.available === 3))
  assert.ok(catalog.data.every((item, i, all) => i === 0 || item.price >= all[i - 1].price))
  assert.equal((await call(`/products/${products[0]}`)).data.available, 3)
  assert.ok((await call('/categories')).data.length >= 1)
  assert.equal((await call('/cart', { account: a })).data.items.length, 0)
  await call('/cart/items', { method: 'POST', account: a, body: { productId: products[0], quantity: 1 }, csrf: false }, 403)
  for (const quantity of [0, -1, 1.2, 100]) await call('/cart/items', { method: 'POST', account: a, body: { productId: products[0], quantity } }, 400)
  await call('/cart/items', { method: 'POST', account: a, body: { productId: products[0], quantity: 4 } }, 409)
  await call('/cart/items', { method: 'POST', account: a, body: { productId: products[0], quantity: 1, price: 0 } }, 400)
  const add = (account, productId, quantity) => call('/cart/items', { account, method: 'POST', body: { productId, quantity } })
  await call('/cart/items', { account: a, method: 'POST', body: { productId: 'producto-inexistente', quantity: 1 } }, 404)
  await call(`/cart/items/${products[0]}`, { account: a, method: 'PATCH', body: { quantity: 0 } }, 400)
  await add(a, products[0], 1)
  const added = await add(a, products[0], 1)
  assert.equal(added.data.items[0].quantity, 2)
  assert.equal(added.data.total, '24.70')
  const [[storedCart]] = await pool.execute('SELECT d.cantidad FROM detalles_carrito d JOIN carritos c ON c.id=d.carrito_id WHERE c.usuario_id=? AND d.producto_id=?', [a.id, products[0]])
  assert.equal(storedCart.cantidad, 2)
  assert.equal((await call('/cart', { account: b })).data.items.length, 0)
  const patched = await call(`/cart/items/${products[0]}`, { account: a, method: 'PATCH', body: { quantity: 1 } })
  assert.equal(patched.data.total, '12.35')
  await call(`/cart/items/${products[0]}`, { account: a, method: 'DELETE', body: {} })
  assert.equal((await call('/cart', { account: a })).data.total, '0.00')
  await add(a, products[0], 2); await add(a, products[1], 1)
  const cart = (await call('/cart', { account: a })).data
  const checkout = (account, cartId, idempotencyKey, status = 201) => call('/orders', { account, method: 'POST', body: { cartId, idempotencyKey } }, status)
  const key = randomUUID()
  await call('/orders', { account: a, method: 'POST', body: { cartId: cart.id, idempotencyKey: key, total: 0 } }, 400)
  // Stock changed after add: operation must preserve both stock and cart.
  await pool.execute('UPDATE inventario SET cantidad_total=0 WHERE producto_id=?', [products[1]])
  await checkout(a, cart.id, key, 409)
  assert.equal(await inventory(products[0]), 3); assert.equal(await counts(), 0)
  assert.equal((await call('/cart', { account: a })).data.items.length, 2)
  await pool.execute('UPDATE inventario SET cantidad_total=3 WHERE producto_id=?', [products[1]])
  // Real failure AFTER the order header is inserted: prove transaction rollback.
  injectRollback = true
  try { await checkout(a, cart.id, key, 500) }
  finally { injectRollback = false }
  assert.equal(await inventory(products[0]), 3); assert.equal(await inventory(products[1]), 3)
  assert.equal(await counts(), 0)
  for (const table of ['detalles_pedido', 'historial_pedidos']) {
    const [[remaining]] = await pool.execute(`SELECT COUNT(*) AS n FROM ${table}`)
    assert.equal(Number(remaining.n), 0, 'Rollback sin detalles ni eventos huérfanos')
  }
  assert.equal((await call('/cart', { account: a })).data.id, cart.id)
  await pool.execute('UPDATE productos SET precio=13.10 WHERE id=?', [products[0]])
  // Concurrent identical retries must resolve to the same committed order.
  const duplicates = await Promise.all([1, 2].map(async () => {
    const response = await fetch(base + '/orders', { method: 'POST', headers: { Origin: config.origins[0], Cookie: a.cookie, 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': a.csrf }, body: JSON.stringify({ cartId: cart.id, idempotencyKey: key }) })
    checks++; return { status: response.status, data: (await response.json()).data }
  }))
  assert.deepEqual(duplicates.map((r) => r.status).sort(), [200, 201])
  assert.equal(duplicates[0].data.id, duplicates[1].data.id)
  const first = duplicates[0]
  assert.equal(first.data.total, '38.55'); assert.equal(first.data.status, 'confirmado')
  assert.equal(first.data.history.length, 1)
  assert.equal(await inventory(products[0]), 1); assert.equal(await inventory(products[1]), 2)
  const replay = await checkout(a, cart.id, key, 200)
  assert.equal(replay.data.id, first.data.id); assert.equal(await counts(), 1)
  await checkout(a, cart.id, randomUUID(), 409)
  await call(`/orders/${first.data.id}`, { account: b }, 404)
  await checkout(b, cart.id, randomUUID(), 409)
  await call(`/orders/${first.data.id}`, { account: b, method: 'PATCH', body: { status: 'cancelado' } }, 404)
  const [[owner]] = await pool.execute('SELECT usuario_id,estado FROM pedidos WHERE id=?', [first.data.id])
  assert.equal(String(owner.usuario_id), String(a.id)); assert.equal(owner.estado, 'confirmado')
  assert.equal((await call('/orders', { account: b })).data.length, 0)
  assert.equal((await call('/orders', { account: a })).data[0].id, first.data.id)
  assert.equal((await call(`/orders/${first.data.id}`, { account: a })).data.items.length, 2)
  await pool.execute('UPDATE productos SET precio=18.00 WHERE id=?', [products[0]])
  assert.equal((await call(`/orders/${first.data.id}`, { account: a })).data.total, '38.55', 'Los precios históricos no cambian con el catálogo')
  console.log('PASS catálogo, cantidades, propiedad, DECIMAL, rollback real tras escrituras, historial e idempotencia')
  // Two authenticated buyers compete for the last unit.
  const ca = (await add(a, products[0], 1)).data
  const cb = (await add(b, products[0], 1)).data
  const race = await Promise.all([a, b].map(async (account, i) => {
    const response = await fetch(base + '/orders', { method: 'POST', headers: { Origin: config.origins[0], Cookie: account.cookie, 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': account.csrf }, body: JSON.stringify({ cartId: [ca.id, cb.id][i], idempotencyKey: randomUUID() }) })
    checks++; return response.status
  }))
  assert.deepEqual(race.sort(), [201, 409]); assert.equal(await inventory(products[0]), 0)
  const fresh = (await call('/cart', { account: a })).data
  await checkout(a, fresh.id, key, 409)
  assert.equal((await call('/plans')).data.length, 2)
  const free = (await call('/subscription', { account: a })).data
  assert.equal(free.code, 'free'); assert.equal(free.history.length, 1)
  const change = (code) => call('/subscription', { account: a, method: 'PATCH', body: { code } })
  const premium = (await change('premium')).data
  assert.equal(premium.code, 'premium'); assert.equal(premium.history.length, 2)
  assert.equal((await call('/subscription', { account: a })).data.code, 'premium')
  assert.equal((await change('premium')).data.history.length, 2)
  const again = (await change('free')).data
  assert.equal(again.history.length, 3); assert.equal(again.code, 'free')
  assert.equal((await call('/subscription', { account: b })).data.code, 'free')
  const [[persisted]] = await pool.execute("SELECT COUNT(*) AS n FROM historial_suscripciones WHERE usuario_id=? AND estado='activa'", [a.id])
  assert.equal(Number(persisted.n), 1)
  await call('/subscription', { account: a, method: 'PATCH', body: { code: 'admin' } }, 400)
  await call('/subscription', { account: a, method: 'PATCH', body: { code: 'premium', price: 0 } }, 400)
  await call('/subscription', { account: a, method: 'PATCH', body: { code: 'premium', userId: b.id } }, 400)
  await call('/subscription', { account: a, method: 'PATCH', body: { code: 'premium' }, csrf: false }, 403)
  // Exercise repository validation for absent users/plans without adding a public API.
  const { createCommerceRepository } = await import('../src/repositories/commerceRepository.js')
  const repository = createCommerceRepository(pool)
  await assert.rejects(repository.subscription('18446744073709551615', 'premium'), error => error.status === 401)
  await assert.rejects(repository.subscription(a.id, 'plan-inexistente'), error => error.status === 404)
  await call('/admin/overview', { account: a }, 403)
  console.log(`PASS concurrencia último stock, suscripciones persistentes y permisos; ${checks} solicitudes HTTP reales`)
} catch (error) { console.error('Verificación comercial falló:', error.code === 'ERR_ASSERTION' ? error.message : error.code ?? error.message); process.exitCode = 1 }
finally {
  if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
  // Solo entidades de nuestras dos cuentas y productos UUID; nunca borrar por patrón.
  try {
    const [users] = await pool.execute('SELECT id FROM usuarios WHERE email IN (?,?)', emails)
    for (const { id } of users) {
      await pool.execute('DELETE FROM movimientos_inventario WHERE actor_id=?', [id])
      await pool.execute('DELETE h FROM historial_pedidos h JOIN pedidos p ON p.id=h.pedido_id WHERE p.usuario_id=?', [id])
      await pool.execute('DELETE d FROM detalles_pedido d JOIN pedidos p ON p.id=d.pedido_id WHERE p.usuario_id=?', [id])
      await pool.execute('DELETE FROM pedidos WHERE usuario_id=?', [id])
      await pool.execute('DELETE FROM carritos WHERE usuario_id=?', [id])
      await pool.execute('DELETE FROM historial_suscripciones WHERE usuario_id=?', [id])
      await pool.execute('DELETE FROM usuarios WHERE id=?', [id])
    }
    for (const id of products) { await pool.execute('DELETE FROM inventario WHERE producto_id=?', [id]); await pool.execute('DELETE FROM productos WHERE id=?', [id]) }
    console.log('Limpieza de cuentas, pedidos, carritos, planes y productos técnicos completada.')
  } finally { await pool.end() }
}
