import { assertTestIsolation } from '../backend/scripts/test-isolation.js'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { openBrowser, assertBrowserApi } from './browser-session.mjs'
import { loadEnvironment } from '../backend/src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../backend/src/config/database.js'
import { createDatabasePool } from '../backend/src/db/pool.js'

loadEnvironment()
await assertTestIsolation(loadDatabaseConfig())
const api = process.env.API_URL
assert.ok(api?.startsWith('http://127.0.0.1:4407/'))
const pool = createDatabasePool(loadDatabaseConfig())
const email = `browser-auth-${randomUUID()}@example.test`
const password = `Aa1-${randomBytes(20).toString('hex')}`
let browser
try {
  browser = await openBrowser()
  const { send, navigate, waitFor, evaluate, input, click, resize, screenshot, events } = browser
  const account = () => waitFor(`!!document.querySelector('form[aria-label="Registro"]')`)
  const submit = (label) => evaluate(`document.querySelector('form[aria-label="${label}"]').requestSubmit()`)
  await resize(1440)
  await navigate('/animes?source=demo')
  await assertBrowserApi(browser)
  await waitFor(`document.querySelectorAll('main article').length === 12`)
  await click('main article button[aria-pressed]')
  await send('Page.navigate', { url: `${process.env.AUDIT_URL || 'http://127.0.0.1:5173'}/perfil` })
  await waitFor(`location.pathname === '/cuenta'`); await account()
  await submit('Registro')
  assert.equal(await evaluate(`document.querySelectorAll('form[aria-label="Registro"] [aria-invalid="true"]').length`), 4)
  await input('form[aria-label="Registro"] [name="name"]', 'Aiko de prueba')
  await input('form[aria-label="Registro"] [name="email"]', email)
  await input('form[aria-label="Registro"] [name="password"]', password)
  await input('form[aria-label="Registro"] [name="confirmPassword"]', 'Diferente123')
  await submit('Registro')
  assert.ok(await evaluate(`document.querySelector('form[aria-label="Registro"] [name="confirmPassword"]').getAttribute('aria-invalid') === 'true'`))
  await input('form[aria-label="Registro"] [name="confirmPassword"]', password)
  await submit('Registro')
  await waitFor(`location.pathname === '/perfil' && !!document.querySelector('form[aria-label="Perfil"]')`)
  const { cookies } = await send('Network.getCookies', { urls: [`${api}/auth/session`] })
  const cookie = cookies.find((item) => item.name === 'otakuzone_session')
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Lax')
  assert.ok(await evaluate(`!document.cookie.includes('otakuzone_session')`))
  assert.ok(await evaluate(`!JSON.stringify(localStorage).includes(${JSON.stringify(password)}) && !JSON.stringify(localStorage).includes(${JSON.stringify(cookie.value)})`))
  await input('form[aria-label="Perfil"] [name="name"]', 'Aiko actualizado')
  await input('form[aria-label="Perfil"] [name="bio"]', 'Perfil autenticado de prueba.')
  await submit('Perfil')
  await waitFor(`document.querySelector('form[aria-label="Perfil"]').textContent.includes('Perfil actualizado.')`)
  await navigate('/perfil')
  await waitFor(`!!document.querySelector('form[aria-label="Perfil"]')`)
  assert.equal(await evaluate(`document.querySelector('form[aria-label="Perfil"] [name="name"]').value`), 'Aiko actualizado')
  assert.equal(await evaluate(`document.querySelector('form[aria-label="Perfil"] [name="email"]').readOnly`), true)
  const [[stored]] = await pool.execute('SELECT nombre, presentacion, password_hash AS hash FROM usuarios WHERE email = ?', [email])
  assert.equal(stored.nombre, 'Aiko actualizado')
  assert.equal(stored.presentacion, 'Perfil autenticado de prueba.')
  assert.ok(stored.hash !== password && stored.hash.startsWith('$2'))
  for(const width of [320,375,768,1024,1440]) { await resize(width); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`Perfil @${width}`) }
  await resize(390); await screenshot('perfil-autenticado-movil')
  await navigate('/favoritos')
  assert.equal(await evaluate(`document.querySelectorAll('main article').length`), 1)
  console.log('PASS registro real, confirmación, cookie HttpOnly, sesión tras recarga, perfil SQL y favoritos conservados')

  await navigate('/admin')
  await waitFor(`document.querySelector('main').textContent.includes('Acceso restringido')`)
  assert.equal(await evaluate(`fetch('${api}/admin/overview', { credentials: 'include' }).then(response => response.status)`), 403)
  await pool.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE email = ?', ['administrador', email])
  await navigate('/admin')
  await waitFor(`document.querySelectorAll('main dd').length === 6`)
  assert.ok(events.some((event) => event.method === 'Network.responseReceived' && event.params.response.url.endsWith('/admin/dashboard') && event.params.response.status === 200))
  await pool.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE email = ?', ['cliente', email])
  await navigate('/admin')
  await waitFor(`document.querySelector('main').textContent.includes('Acceso restringido')`)
  await navigate('/perfil'); await waitFor(`!!document.querySelector('form[aria-label="Perfil"]')`)
  await click('main button[type="button"]')
  await waitFor(`location.pathname === '/cuenta'`); await account()
  await input('form[aria-label="Iniciar sesión"] [name="email"]', email)
  await input('form[aria-label="Iniciar sesión"] [name="password"]', 'Incorrecta123')
  await submit('Iniciar sesión')
  await waitFor(`!!document.querySelector('form[aria-label="Iniciar sesión"] [role="alert"]')`)
  await input('form[aria-label="Iniciar sesión"] [name="password"]', password)
  await submit('Iniciar sesión')
  await waitFor(`location.pathname === '/perfil' && !!document.querySelector('form[aria-label="Perfil"]')`)
  await click('main button[type="button"]')
  await waitFor(`location.pathname === '/cuenta'`); await account()
  const afterLogout = await send('Network.getCookies', { urls: [api] })
  assert.ok(!afterLogout.cookies.some((item) => item.name === 'otakuzone_session'))
  console.log('PASS CLIENTE denegado, ADMIN permitido, rol verificado en servidor, login con error/éxito y logout')
  for (const width of [320, 375, 768, 1024, 1440]) { await resize(width); assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth')) }
  await screenshot('cuenta-login-registro')
  const runtimeErrors = events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
  assert.deepEqual(runtimeErrors, [])
  console.log('PASS responsive y ausencia de excepciones de aplicación; respuestas 401/403 intencionales verificadas')
} finally {
  try { if (browser) await browser.close() }
  finally {
    try {
      await pool.execute('DELETE c FROM carritos c JOIN usuarios u ON u.id=c.usuario_id WHERE u.email=?', [email])
      await pool.execute('DELETE h FROM historial_suscripciones h JOIN usuarios u ON u.id=h.usuario_id WHERE u.email=?', [email])
      await pool.execute('DELETE FROM usuarios WHERE email = ?', [email]); console.log('Cuenta técnica del navegador, suscripción y sesiones eliminadas.')
    }
    finally { await pool.end() }
  }
}
