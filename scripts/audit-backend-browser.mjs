import assert from 'node:assert/strict'
import { openBrowser } from './browser-session.mjs'

const browser = await openBrowser()
const apiBase = process.env.STORE_API_URL ?? 'http://127.0.0.1:4000/api/v1'
const { navigate, waitFor, evaluate, click, resize, events, screenshot } = browser
try {
  await resize(1440)
  await navigate('/tienda')
  await waitFor(`document.querySelectorAll('main article').length === 12`)
  const backendResponses = () => events.filter((event) => event.method === 'Network.responseReceived' && event.params.response.url.startsWith(apiBase + '/')).map((event) => ({ url: event.params.response.url, status: event.params.response.status }))
  assert.ok(backendResponses().some((response) => response.url.endsWith('/products') && response.status === 200), 'Productos realmente consultados al proveedor configurado')
  await waitFor(`document.querySelector('main select').options.length === 6`)
  assert.ok(backendResponses().some((response) => response.url.endsWith('/categories') && response.status === 200))
  await evaluate(`(() => { const select = document.querySelector('main select'); select.value = 'mangas'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(`document.querySelectorAll('main article').length === 3`)
  await evaluate(`(() => { const select = document.querySelector('main select'); select.value = 'papeleria'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(`document.querySelectorAll('main article').length === 0 && document.querySelector('main').textContent.includes('No hay productos')`)
  await navigate('/')
  await waitFor(`document.querySelector('[aria-labelledby="shop-title"]').querySelectorAll('article').length === 4 && document.querySelector('[aria-label="Promociones de demostración"]').querySelectorAll('a').length === 2`)
  assert.ok(backendResponses().some((response) => response.url.endsWith('/promotions') && response.status === 200))
  await click('main a[href="/cuenta"]')
  assert.ok(await evaluate(`document.querySelector('form[aria-label="Registro demostrativo"]') !== null`))
  await navigate('/animes?source=demo')
  await waitFor(`document.querySelectorAll('main article').length === 12`)
  await click('main article button[aria-pressed]')
  await click('header nav a[href="/favoritos"]')
  assert.equal(await evaluate(`document.querySelectorAll('main article').length`), 1)
  await navigate('/tienda'); await waitFor(`document.querySelectorAll('main article').length === 12`)
  for (const width of [320, 390, 768, 1440]) {
    await resize(width)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  }
  await screenshot('tienda-express')
  const errors = events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
  assert.deepEqual(errors, [])
  console.log(`PASS: React + ${apiBase}: 12 productos, 5 categorías, 2 promociones, filtros/vacío, favoritos, cuenta y responsive`)
  console.log('Respuestas reales:', JSON.stringify(backendResponses()))
  console.log('Jikan se mantiene separado; esta prueba no declara su disponibilidad.')
} finally { await browser.close() }
