import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { openBrowser, assertBrowserApi } from './browser-session.mjs'
import { loadEnvironment } from '../backend/src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../backend/src/config/database.js'
import { createDatabasePool } from '../backend/src/db/pool.js'
import { assertTestIsolation } from '../backend/scripts/test-isolation.js'
loadEnvironment();const config=loadDatabaseConfig();await assertTestIsolation(config)
const pool=createDatabasePool(config),id='ui-'+randomUUID(),cat='ui-cat-'+randomUUID(),email=`ui-${randomUUID()}@example.test`
let browser
try {
  browser=await openBrowser();const {navigate,input,evaluate,waitFor,resize,screenshot}=browser
  await navigate('/cuenta')
  await assertBrowserApi(browser)
  await waitFor(`!!document.querySelector('form[aria-label="Registro"] [name="name"]')`,30000)
  for(const [name,value] of Object.entries({name:'Admin de prueba',email,password:'Aa1-'+randomBytes(20).toString('hex')})){
    await input(`form[aria-label="Registro"] [name="${name}"]`,value)
    if(name==='password')await input('form[aria-label="Registro"] [name="confirmPassword"]',value)
  }
  await evaluate(`document.querySelector('form[aria-label="Registro"]').requestSubmit()`)
  await waitFor(`document.querySelector('main').textContent.includes('Cerrar sesión')`)
  await navigate('/admin');await waitFor(`document.querySelector('main h1')?.textContent==='Acceso restringido'`)
  console.log('PASS navegador CLIENTE denegado en /admin')
  await pool.execute("UPDATE usuarios SET rol_id=(SELECT id FROM roles WHERE codigo='administrador') WHERE email=?",[email])
  await navigate('/admin');await waitFor(`document.querySelectorAll('main dd').length===6`)
  await resize(1440)
  await screenshot('admin-dashboard')
  await navigate('/admin/categorias')
  await input('form [name="id"]',cat);await input('form [name="name"]','Categoría UI')
  await evaluate(`document.querySelector('form[aria-label="Categoría administrativa"]').requestSubmit()`)
  await waitFor(`Array.from(document.querySelectorAll('main article')).some(a=>a.textContent.includes(${JSON.stringify(cat)}))`)
  await navigate('/admin/productos')
  for(const [name,value] of Object.entries({id,name:'Producto UI',categoryId:cat,price:'12.35',quantity:'3',imageAlt:'Manga técnico',description:'Descripción de prueba UI'})) await input(`form [name="${name}"]`,value)
  await evaluate(`document.querySelector('form[aria-label="Producto administrativo"]').requestSubmit()`)
  await waitFor(`Array.from(document.querySelectorAll('main article')).some(a=>a.textContent.includes(${JSON.stringify(id)}))`)
  await evaluate(`Array.from(document.querySelectorAll('main article')).find(a=>a.textContent.includes(${JSON.stringify(id)})).querySelector('button').click()`)
  await input('form [name="name"]','Producto UI editado')
  await evaluate(`document.querySelector('form[aria-label="Producto administrativo"]').requestSubmit()`)
  await waitFor(`document.querySelector('main').textContent.includes('Producto UI editado')`)
  await navigate('/admin/inventario')
  const article=`Array.from(document.querySelectorAll('main article')).find(a=>a.querySelector('h2')?.textContent==='Producto UI editado')`
  await waitFor(`!!(${article})`)
  // Locate this record explicitly; other inventory forms retain their values.
  await evaluate(`(${article}).setAttribute('data-audit','inventory')`)
  await input('[data-audit="inventory"] [name="quantity"]','7');await input('[data-audit="inventory"] [name="reason"]','Reposición desde navegador')
  await evaluate(`document.querySelector('[data-audit="inventory"] form').requestSubmit()`)
  await waitFor(`document.querySelector('main').textContent.includes('Inventario actualizado')`)
  const [[stock]]=await pool.execute('SELECT cantidad_total AS n FROM inventario WHERE producto_id=?',[id]);assert.equal(stock.n,7)
  console.log('PASS navegador categorías, creación/edición de producto e inventario auditado SQL')
  await navigate(`/tienda/${id}`);await waitFor(`!!document.querySelector('main article button')`)
  await evaluate(`document.querySelector('main article button').click()`);await waitFor(`document.querySelector('main').textContent.includes('Producto agregado')`)
  await navigate('/carrito');await waitFor(`!!document.querySelector('input[name="quantity"]')`)
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.includes('Confirmar pedido')).click()`)
  await waitFor(`location.pathname.startsWith('/pedidos/')&&document.querySelector('main').textContent.includes('confirmado')`)
  const orderId=await evaluate('location.pathname.split("/").pop()')
  await navigate('/admin/pedidos');await waitFor(`Array.from(document.querySelectorAll('main article h2')).some(h=>h.textContent==='Pedido #${orderId}')`)
  await evaluate(`Array.from(document.querySelectorAll('main article')).find(a=>a.querySelector('h2').textContent==='Pedido #${orderId}').querySelector('button').click()`)
  await waitFor(`!!document.querySelector('[aria-label="Detalle administrativo del pedido"]')`)
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Marcar cancelado').click()`)
  await waitFor(`document.querySelector('[aria-label="Detalle administrativo del pedido"] h2').textContent.includes('cancelado')`)
  const [[restored]]=await pool.execute('SELECT cantidad_total AS n FROM inventario WHERE producto_id=?',[id]);assert.equal(restored.n,7)
  await navigate('/admin/productos')
  const productArticle=`Array.from(document.querySelectorAll('main article')).find(a=>a.textContent.includes(${JSON.stringify(id)}))`
  await waitFor(`!!(${productArticle})`)
  await evaluate(`Array.from((${productArticle}).querySelectorAll('button')).find(b=>b.textContent==='Desactivar').click()`)
  await waitFor(`document.querySelector('main').textContent.includes('Producto desactivado')`)
  const [[disabled]]=await pool.execute('SELECT activo FROM productos WHERE id=?',[id]);assert.equal(disabled.activo,0)
  console.log('PASS navegador desactivación de producto sin eliminación de historial')
  await navigate('/admin/usuarios');await waitFor(`document.querySelector('main').textContent.includes(${JSON.stringify(email)})`)
  assert.equal(await evaluate(`!!document.querySelector('[name="role"]')`),false)
  for(const section of ['','productos','categorias','inventario','pedidos','usuarios']){
    await navigate('/admin'+(section?'/'+section:''))
    await waitFor(`!document.querySelector('main').textContent.includes('Cargando información')`)
    for(const width of [320,375,768,1024,1440]){await resize(width);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`${section}@${width}`)}
  }
  await navigate('/admin/productos');await resize(390);await screenshot('admin-productos-movil')
  const errors=browser.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');assert.deepEqual(errors,[])
  console.log('PASS Chrome ADMIN: dashboard real, CRUD, inventario, pedido/cancelación, usuarios y seis módulos a 320/375/768/1024/1440 sin excepciones')
} catch(e){console.error('Navegador ADMIN:',e.message);if(browser)await browser.screenshot('admin-error');process.exitCode=1}
finally{if(browser)await browser.close();await pool.end()}
