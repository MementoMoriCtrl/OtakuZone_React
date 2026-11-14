import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { openBrowser, assertBrowserApi } from './browser-session.mjs'
import { loadEnvironment } from '../backend/src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../backend/src/config/database.js'
import { createDatabasePool } from '../backend/src/db/pool.js'
import { withTransaction } from '../backend/src/db/transaction.js'
import { assertTestIsolation } from '../backend/scripts/test-isolation.js'

loadEnvironment()
await assertTestIsolation(loadDatabaseConfig())
const pool = createDatabasePool(loadDatabaseConfig())
const nonce = randomUUID()
const email = `browser-shop-${nonce}@example.test`
const productId = `browser-${nonce}`
const password = `Aa1-${randomBytes(20).toString('hex')}`
let browser
try {
  const [[category]] = await pool.execute('SELECT id FROM categorias WHERE activa=1 ORDER BY id LIMIT 1')
  await pool.execute("INSERT INTO productos (id,categoria_id,nombre,descripcion,precio,image_key,alt_imagen) VALUES (?,?,'Producto navegador técnico','Solo auditoría académica',12.35,'manga','Ilustración de prueba')", [productId, category.id])
  await pool.execute('INSERT INTO inventario (producto_id,cantidad_total) VALUES (?,5)', [productId])
  browser = await openBrowser()
  const { send, navigate, waitFor, input, click, evaluate, resize, screenshot, events, select } = browser
  await send('Page.navigate', { url: `${process.env.AUDIT_URL ?? 'http://127.0.0.1:5173'}/carrito` }); await waitFor(`location.pathname === '/cuenta' && !!document.querySelector('form[aria-label="Registro"]')`)
  await assertBrowserApi(browser)
  for (const [name, value] of Object.entries({ name: 'Cliente navegador', email, password, confirmPassword: password })) await input(`form[aria-label="Registro"] [name="${name}"]`, value)
  await evaluate(`document.querySelector('form[aria-label="Registro"]').requestSubmit()`)
  await waitFor(`location.pathname === '/carrito' && document.querySelector('main').textContent.includes('Tu carrito está vacío')`)
  console.log('PASS redirección privada y registro con el sistema existente')
  await send('Fetch.enable', { patterns: [{ urlPattern: `${process.env.API_URL}/cart`, requestStage: 'Request' }] })
  await navigate('/carrito')
  await waitFor(`document.querySelector('main [role="status"]')?.textContent.includes('Cargando información')`)
  await send('Fetch.disable')
  await waitFor(`document.querySelector('main').textContent.includes('Tu carrito está vacío')`)
  console.log('PASS estado de carga observado con petición pausada y recuperación')
  await send('Network.setBlockedURLs', { urls: [`${process.env.API_URL}/cart`] })
  await navigate('/carrito'); await waitFor(`!!document.querySelector('main [role="alert"]')`)
  await send('Network.setBlockedURLs', { urls: [] })
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Reintentar').click()`)
  await waitFor(`document.querySelector('main').textContent.includes('Tu carrito está vacío')`)
  await navigate('/pedidos'); await waitFor(`document.querySelector('main').textContent.includes('Todavía no tienes pedidos')`)
  await navigate('/tienda')
  await waitFor(`document.querySelectorAll('main article').length >= 12`)
  await select('order', 'price-desc')
  const amounts = await evaluate(`Array.from(document.querySelectorAll('main article p.text-xl')).map(p=>Number(p.textContent.replace(/[^0-9.]/g,'')))`)
  assert.ok(amounts.every((price, i) => i === 0 || price <= amounts[i-1]))
  await select('category', category.id)
  await input('input[type="search"]', 'noexistezzzz')
  await waitFor(`document.querySelectorAll('main article').length === 0`)
  await input('input[type="search"]', 'Producto navegador técnico')
  await waitFor(`document.querySelectorAll('main article').length === 1`)
  assert.equal(await evaluate(`document.querySelector('select[name="category"]').value`), category.id)
  await click('main article button')
  await waitFor(`document.querySelector('main article').textContent.includes('Producto agregado')`)
  await navigate(`/tienda/${productId}`)
  await waitFor(`document.querySelector('main article')?.textContent.includes('Disponibles: 5')`)
  await navigate('/carrito')
  await waitFor(`!!document.querySelector('input[name="quantity"]')`)
  await input('input[name="quantity"]', '2')
  await evaluate(`document.querySelector('main form').requestSubmit()`)
  await waitFor(`document.querySelector('input[name="quantity"]')?.value === '2' && !document.querySelector('main button[disabled]')`)
  await navigate('/carrito')
  await waitFor(`document.querySelector('input[name="quantity"]')?.value === '2'`)
  const [[line]] = await pool.execute('SELECT d.cantidad AS n FROM detalles_carrito d JOIN carritos c ON c.id=d.carrito_id JOIN usuarios u ON u.id=c.usuario_id WHERE u.email=? AND d.producto_id=?', [email, productId])
  assert.equal(line.n, 2)
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Quitar').click()`)
  await waitFor(`document.querySelector('main').textContent.includes('Tu carrito está vacío')`)
  await navigate(`/tienda/${productId}`)
  await waitFor(`!!document.querySelector('main article button')`)
  await click('main article button')
  await waitFor(`document.querySelector('main article').textContent.includes('Producto agregado')`)
  await navigate('/carrito'); await waitFor(`!!document.querySelector('input[name="quantity"]')`)
  await input('input[name="quantity"]', '2')
  await evaluate(`document.querySelector('main form').requestSubmit()`)
  await waitFor(`document.querySelector('input[name="quantity"]')?.value === '2' && !document.querySelector('main button[disabled]')`)
  console.log('PASS eliminación desde navegador y nueva adición/actualización')
  const orderButton = `Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.includes('Confirmar pedido'))`
  await evaluate(`${orderButton}.click()`)
  await waitFor(`location.pathname.startsWith('/pedidos/') && document.querySelector('main').textContent.includes('confirmado')`)
  const orderId = await evaluate('location.pathname.split("/").pop()')
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('24.70')`))
  console.log('PASS búsqueda, detalle, carrito, pedido e inventario persistidos')
  const [[stock]] = await pool.execute('SELECT cantidad_total AS n FROM inventario WHERE producto_id=?', [productId])
  assert.equal(stock.n, 3)
  await navigate('/pedidos'); await waitFor(`!!document.querySelector('main a[href="/pedidos/${orderId}"]')`)
  await navigate(`/pedidos/${orderId}`); await waitFor(`document.querySelector('main').textContent.includes('Historial de estados')`)
  await screenshot('pedido-demostrativo')
  await navigate('/suscripciones')
  await waitFor(`document.querySelector('main').textContent.includes('Plan actual: FREE') && document.querySelectorAll('main article').length === 2`)
  console.log('PASS plan Free inicial consultado desde MySQL')
  const choose = (code) => evaluate(`Array.from(document.querySelectorAll('main article button')).find(b=>b.textContent.includes('Elegir ${code}')).click()`)
  await choose('PREMIUM')
  await waitFor(`document.querySelector('main').textContent.includes('Plan actual: PREMIUM') && !!document.querySelector('[aria-label="Insignia Premium"]')`)
  console.log('PASS activación Premium e insignia')
  await navigate('/suscripciones'); await waitFor(`document.querySelector('main').textContent.includes('Plan actual: PREMIUM')`)
  await navigate('/')
  await waitFor(`!!document.querySelector('[aria-label="Insignia Premium"]')`)
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="Promociones de demostración"]')`), false)
  console.log('PASS Premium persistido y promociones ocultas')
  await navigate('/suscripciones'); await waitFor(`document.querySelector('main').textContent.includes('Plan actual: PREMIUM') && Array.from(document.querySelectorAll('main article button')).some(b=>b.textContent.includes('Elegir FREE') && !b.disabled)`)
  await choose('FREE'); await waitFor(`document.querySelector('main').textContent.includes('Plan actual: FREE')`)
  await navigate('/'); await waitFor(`!!document.querySelector('[aria-label="Promociones de demostración"]')`)
  for (const path of ['/tienda', `/tienda/${productId}`, '/carrito', '/pedidos', `/pedidos/${orderId}`, '/suscripciones']) {
    await navigate(path)
    for (const width of [320, 375, 768, 1024, 1440]) { await resize(width); assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${path}@${width}`) }
  }
  await resize(390); await screenshot('suscripciones-movil')
  const errors = events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
  assert.deepEqual(errors, [])
  console.log('PASS Chrome real: login único, búsqueda, vacío, detalle, carrito persistido, pedido MySQL, historial, planes, insignia, publicidad simulada y responsive 320/375/768/1024/1440; sin excepciones de aplicación.')
  // Cookie intentionally never printed or copied outside this browser session.
  await send('Network.clearBrowserCookies')
} catch (error) {
  console.error('Auditoría comercial navegador:', error.message)
  if (browser) { console.log('Estado de página:', await browser.evaluate(`document.querySelector('main')?.textContent.slice(0,1000)`)); await browser.screenshot('commerce-error') }
  process.exitCode = 1
}
finally {
  try { if (browser) await browser.close() }
  finally {
    try {
      await withTransaction(pool, async (c) => {
        const [[user]] = await c.execute('SELECT id FROM usuarios WHERE email=? FOR UPDATE', [email])
        if (!user) return
        await c.execute('DELETE FROM movimientos_inventario WHERE actor_id=?', [user.id])
        await c.execute('DELETE h FROM historial_pedidos h JOIN pedidos p ON p.id=h.pedido_id WHERE p.usuario_id=?', [user.id])
        await c.execute('DELETE d FROM detalles_pedido d JOIN pedidos p ON p.id=d.pedido_id WHERE p.usuario_id=?', [user.id])
        await c.execute('DELETE FROM pedidos WHERE usuario_id=?', [user.id])
        await c.execute('DELETE FROM carritos WHERE usuario_id=?', [user.id])
        await c.execute('DELETE FROM historial_suscripciones WHERE usuario_id=?', [user.id])
        await c.execute('DELETE FROM usuarios WHERE id=?', [user.id])
      })
      await pool.execute('DELETE FROM inventario WHERE producto_id=?', [productId])
      await pool.execute('DELETE FROM productos WHERE id=?', [productId])
      console.log('Datos técnicos de navegador eliminados; catálogo anterior conservado.')
    } finally { await pool.end() }
  }
}
