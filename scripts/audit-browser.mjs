// Auditoría funcional sin dependencias: Node 24 + Chrome/Edge local + servidor Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173'
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean)
let executable
for (const candidate of candidates) {
  try { await access(candidate); executable = candidate; break } catch { /* siguiente navegador */ }
}
assert.ok(executable, 'Configura CHROME_PATH con la ruta de Chrome o Edge')
const profile = await mkdtemp(join(tmpdir(), 'otakuzone-audit-'))
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
let count = 0
const errors = []
try {
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  assert.ok(port, 'El navegador no inició su puerto de depuración')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const task = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) task.reject(message.error); else task.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded' && message.params.entry.level === 'error' || message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP sin respuesta: ${method}`)) }, 20000)
    pending.set(key, { resolve: (result) => { clearTimeout(timeout); resolve(result) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const check = async (expression, label) => { assert.ok(await evaluate(expression), label); count++ }
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50) }
    throw new Error(`Tiempo agotado: ${expression}`)
  }
  const navigate = async (path) => {
    await send('Page.navigate', { url: `${base}${path}` })
    await waitFor(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('main h1')`)
  }
  const resize = async (width) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await delay(100)
  }
  const click = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    await delay(100)
  }
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  const routes = ['/', '/animes', '/tienda', '/favoritos', '/cuenta', '/ruta-inexistente']
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
    await resize(width)
    for (const route of routes) {
      await navigate(route)
      await check(`document.querySelectorAll('h1').length === 1 && document.querySelectorAll('main').length === 1 && document.querySelectorAll('header').length === 1 && document.querySelectorAll('footer').length === 1`, `Landmarks ${route} @${width}`)
      await check(`document.documentElement.scrollWidth <= innerWidth`, `Desbordamiento ${route} @${width}`)
      if (route !== '/ruta-inexistente') await check(`!!document.querySelector('header nav a[aria-current="page"][href="${route}"]')`, `Ruta activa ${route}`)
    }
  }
  console.log('PASS: carga directa, landmarks, indicador activo y anchos 320–1440 en las seis páginas')
  await navigate('/')
  await evaluate(`window.auditDocument = 'persistente'`)
  for (const route of routes.slice(0, 5)) {
    await click(`header nav a[href="${route}"]`)
    await waitFor(`location.pathname === '${route}'`)
    await check(`window.auditDocument === 'persistente'`, `Sin recarga ${route}`)
    if (route !== '/') await check(`document.activeElement.id === 'main-content'`, `Foco al navegar ${route}`)
  }
  await navigate('/')
  await check(`document.querySelectorAll('main > div > section').length === 7 && document.querySelectorAll('main article').length === 14`, 'Secciones y tarjetas Home')
  const links = await evaluate(`Array.from(document.querySelectorAll('main a, footer a'), a => a.getAttribute('href'))`)
  for (let index = 0; index < links.length; index++) {
    await navigate('/')
    await evaluate(`document.querySelectorAll('main a, footer a')[${index}].click()`)
    await waitFor(`location.pathname === ${JSON.stringify(links[index])}`)
    count++
  }
  console.log(`PASS: navegación SPA y ${links.length} enlaces de Hero, Home y Footer`)
  await navigate('/')
  for (let index = 0; index < 8; index++) {
    await evaluate(`window.trigger = document.querySelectorAll('main article button')[${index}]; trigger.focus(); trigger.click()`)
    await waitFor(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('dialog').contains(document.activeElement)`, 'Foco dentro del diálogo')
    await check(`trigger.getAttribute('aria-label').includes(document.querySelector('dialog h2').textContent)`, 'Ficha correcta')
    if (index === 0) {
      const point = await evaluate(`(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return { x: r.left + 8, y: r.top + 50 } })()`)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
      await delay(100)
      await check(`!!document.querySelector('dialog[open]')`, 'Pulsar el espacio interior no cierra la ficha')
    }
    if (index % 2) await click('dialog button')
    else {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    }
    await waitFor(`!document.querySelector('dialog')`)
    await check(`document.activeElement === trigger`, 'Foco restaurado')
  }
  console.log('PASS: ocho fichas, apertura, foco, Escape/botón y restauración bajo StrictMode')
  await click('main article button')
  await waitFor(`!!document.querySelector('dialog[open]')`)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: 2, y: 2, button: 'left', clickCount: 1 })
  await waitFor(`!document.querySelector('dialog')`)
  count++
  await resize(390)
  await click('header button[aria-controls]')
  await check(`document.querySelector('header button[aria-controls]').ariaExpanded === 'true' && !document.querySelector('#mobile-navigation').hidden`, 'Menú abierto')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await check(`document.querySelector('#mobile-navigation').hidden && document.activeElement.matches('header button[aria-controls]')`, 'Escape y foco del menú')
  await click('header button[aria-controls]')
  await click('#mobile-navigation a[href="/tienda"]')
  await check(`location.pathname === '/tienda' && document.querySelector('#mobile-navigation').hidden`, 'Menú cierra al navegar')
  await click('header button[aria-controls]')
  await resize(1280)
  await resize(390)
  await check(`document.querySelector('#mobile-navigation').hidden`, 'Menú cierra al pasar a escritorio')
  await navigate('/')
  await check(`document.querySelector('main section[aria-labelledby="community-title"] button').disabled`, 'Registro pendiente deshabilitado')
  if (await evaluate(`!!document.querySelector('main details')`)) {
    await click('main details summary')
    await click('main details button')
    await check(`document.querySelector('[role="status"]').textContent.includes('1')`, 'Contador de desarrollo')
  }
  await evaluate(`Promise.all(Array.from(document.images, async img => { img.loading = 'eager'; await img.decode() }))`)
  await check(`Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)`, 'Imágenes locales cargadas')
  await check(`getComputedStyle(document.body).fontFamily.includes('Inter') && getComputedStyle(document.querySelector('h1')).fontFamily.includes('Poppins')`, 'Fuentes Neo Tokyo')
  for (const width of [390, 768, 1440]) {
    await resize(width)
    await evaluate('window.scrollTo(0, 0)')
    const capture = await send('Page.captureScreenshot', { format: 'png' })
    const path = join(profile, `home-${width}.png`)
    await writeFile(path, Buffer.from(capture.data, 'base64'))
    console.log(`Captura: ${path}`)
  }
  await navigate('/ruta-inexistente')
  await click('main a[href="/"]')
  await check(`location.pathname === '/'`, 'Regreso desde 404')
  assert.deepEqual(errors, [], 'Errores de consola o ejecución')
  console.log(`PASS: menú móvil, imágenes, fuentes, CTA, 404 y consola; ${count} comprobaciones correctas`)
  await send('Browser.close')
} finally {
  socket?.close()
  browser.kill()
}
