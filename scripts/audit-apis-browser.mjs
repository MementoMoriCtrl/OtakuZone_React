// Prueba de integración REAL: no intercepta ni fabrica respuestas exitosas.
// Solo bloquea productos temporalmente para comprobar error y recuperación.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173'
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean)
let executable
for (const candidate of candidates) { try { await access(candidate); executable = candidate; break } catch { /* siguiente */ } }
assert.ok(executable, 'Configura CHROME_PATH')
const profile = await mkdtemp(join(tmpdir(), 'otakuzone-apis-'))
const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']
if (process.env.AUDIT_USE_PROXY === '1' && process.env.HTTPS_PROXY) flags.unshift(`--proxy-server=${process.env.HTTPS_PROXY}`)
const browser = spawn(executable, flags, { windowsHide: true, stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
let live = false
const exceptions = []
const consoleErrors = []
const responses = []
const failedRequests = []
try {
  let port
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) } }
  assert.ok(port, 'Chrome no inició')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id)
      if (message.error) task.reject(message.error); else task.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params)
    if (message.method === 'Network.responseReceived' && /api.jikan.moe|127.0.0.1:3001/.test(message.params.response.url)) responses.push({ url: message.params.response.url, status: message.params.response.status })
    if (message.method === 'Network.loadingFailed') failedRequests.push(message.params.errorText)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(key, { resolve: (result) => { clearTimeout(timer); resolve(result) }, reject: (error) => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression, timeout = 45000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Timeout: ${expression}`)
  }
  const navigate = async (path) => {
    await send('Page.navigate', { url: `${base}${path}` })
    await waitFor(`location.pathname === ${JSON.stringify(path.split('?')[0])} && !!document.querySelector('main h1')`)
  }
  const settled = () => waitFor(`!Array.from(document.querySelectorAll('main [role="status"]')).some(el => el.textContent.includes('Cargando'))`)
  const click = async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable'); await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await navigate('/')
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('main [role="status"]')).some(el => el.textContent.includes('Cargando'))`), 'Estado de carga visible')
  await settled()
  const counts = await evaluate(`({popular:document.querySelector('[aria-labelledby="popular-title"]').querySelectorAll('article').length,current:document.querySelector('[aria-labelledby="latest-title"]').querySelectorAll('article').length,products:document.querySelector('[aria-labelledby="shop-title"]').querySelectorAll('article').length,genres:document.querySelector('[aria-labelledby="genres-title"]').querySelectorAll('a').length})`)
  console.log('Home, registros reales renderizados:', JSON.stringify(counts))
  assert.equal(counts.products, 4)
  live = counts.popular > 0 && counts.current > 0 && counts.genres > 0
  console.log(live ? 'PASS: consumo simultáneo Jikan + JSON Server en Home' : 'FAIL: consumo simultáneo incompleto; Jikan no produjo todas sus secciones. No se sustituyeron sus datos.')
  if (counts.popular) {
    await click('main article button')
    await waitFor(`!!document.querySelector('dialog[open]')`)
    await settled()
    assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes('Jikan')`))
    assert.equal(await evaluate(`document.querySelectorAll('dialog [role="alert"]').length`), 0, 'Detalle real disponible')
    await click('dialog button[aria-label="Cerrar detalles"]')
  }
  await click('header a[aria-label="Mi Cuenta"]')
  assert.ok(await evaluate(`location.pathname === '/cuenta' && !!document.querySelector('header a[aria-current="page"][href="/cuenta"]')`))
  await navigate('/tienda'); await settled()
  assert.equal(await evaluate(`document.querySelectorAll('main article').length`), 12)
  console.log('PASS: 12 productos de JSON Server renderizados en React')
  await evaluate(`const select = document.querySelector('main select'); select.value = 'papeleria'; select.dispatchEvent(new Event('change', {bubbles:true}))`)
  await waitFor(`document.querySelectorAll('main article').length === 0 && document.querySelector('main').textContent.includes('No hay productos')`)
  console.log('PASS: estado vacío con categoría real sin productos')
  for (const width of [320, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Responsive @${width}`)
  }
  // Fallo intencional, separado de la evidencia de servicios disponibles.
  await send('Network.setBlockedURLs', { urls: ['*127.0.0.1:3001/products*'] })
  await navigate('/tienda'); await settled()
  assert.ok(await evaluate(`document.querySelector('main [role="alert"]').textContent.includes('conectar')`))
  await send('Network.setBlockedURLs', { urls: [] })
  await click('main [role="alert"] button'); await settled()
  assert.equal(await evaluate(`document.querySelectorAll('main article').length`), 12)
  console.log('PASS: fallo de conexión intencional, error visible y recuperación con Reintentar contra JSON Server real')
  await navigate('/animes'); await settled()
  if (live) {
    assert.ok(await evaluate(`document.querySelectorAll('main article').length >= 10`), 'Catálogo real con al menos diez resultados')
    await evaluate(`document.querySelector('input[name="q"]').value='Naruto'; document.querySelector('form[role="search"]').requestSubmit()`)
    await settled()
    await waitFor(`document.querySelectorAll('main article').length > 0`)
    console.log('PASS: catálogo y búsqueda real Naruto')
  } else {
    assert.equal(await evaluate(`document.querySelectorAll('main article').length`), 0, 'Sin muestras ficticias como fallback')
    assert.ok(await evaluate(`document.querySelectorAll('main [role="alert"]').length > 0`), 'Error Jikan visible')
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: false })
  await click('header button[aria-controls]')
  assert.ok(await evaluate(`!document.querySelector('#mobile-navigation').hidden`))
  await click('#mobile-navigation a[href="/favoritos"]')
  assert.ok(await evaluate(`location.pathname === '/favoritos' && document.querySelector('#mobile-navigation').hidden`))
  await navigate('/ruta-inexistente')
  await click('main a[href="/"]')
  await waitFor(`location.pathname === '/'`)
  console.log('PASS: navegación activa, cuenta, menú móvil y regreso desde 404')
  assert.deepEqual(exceptions, [], 'Excepciones de ejecución')
  assert.deepEqual(consoleErrors, [], 'Errores console.error de React/aplicación')
  for (const path of ['/animes', '/tienda']) {
    await navigate(path); await settled()
    const capture = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(profile, `${path.slice(1)}.png`)
    await writeFile(file, Buffer.from(capture.data, 'base64'))
    console.log(`Captura: ${file}`)
  }
  console.log('Respuestas reales:', JSON.stringify(responses))
  console.log('Fallos de red observados (incluye bloqueo intencional):', JSON.stringify(failedRequests))
  console.log('PASS: sin excepciones de ejecución ni console.error de la aplicación')
  await send('Browser.close')
  process.exitCode = live ? 0 : 1
} finally { socket?.close(); browser.kill() }
