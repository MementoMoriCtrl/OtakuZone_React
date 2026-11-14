import assert from 'node:assert/strict'
import { openBrowser } from './browser-session.mjs'
const browser=await openBrowser()
const {navigate,waitFor,evaluate,resize,send,click,screenshot}=browser
let externalPassed=false
try {
  // Public routes and protected redirects use a fresh, unauthenticated browser.
  for(const path of ['/','/animes?source=demo','/favoritos','/tienda','/tienda/not-existing-quality','/suscripciones','/cuenta','/not-a-real-route']) {
    await navigate(path)
    if(path.includes('source=demo'))await waitFor(`document.querySelectorAll('main article').length===12`)
    if(path==='/tienda/not-existing-quality')await waitFor(`!!document.querySelector('main [role="alert"]')`)
    for(const width of [320,375,768,1024,1440]){
      await resize(width)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`${path}@${width}`)
      const inaccessible=await evaluate(`Array.from(document.querySelectorAll('main input,main select,main textarea,main button')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left< -1||r.right>innerWidth+1)}).length`)
      assert.equal(inaccessible,0,`Controles fuera del ancho ${path}@${width}`)
    }
    if(path==='/not-a-real-route')assert.ok(await evaluate(`document.querySelector('main').textContent.includes('Página no encontrada')`))
  }
  for(const path of ['/perfil','/carrito','/pedidos','/pedidos/1','/admin','/admin/productos']){
    await send('Page.navigate',{url:process.env.AUDIT_URL+path})
    await waitFor(`location.pathname==='/cuenta'&&!!document.querySelector('form[aria-label="Registro"]')`,30000)
  }
  await resize(375)
  await click('header button[aria-expanded]')
  assert.equal(await evaluate(`document.querySelector('header button[aria-expanded]').getAttribute('aria-expanded')`),'true')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await waitFor(`document.querySelector('header button[aria-expanded]').getAttribute('aria-expanded')==='false'`)
  console.log('PASS QA rutas públicas, 404, detalle inexistente, seis redirecciones privadas, navegación móvil/Escape y controles dentro de 320/375/768/1024/1440')
  await navigate('/animes?q=Naruto&genre=Action&status=complete&order=score')
  await waitFor(`!document.querySelector('main').textContent.includes('Cargando información')`,45000)
  const count=await evaluate(`document.querySelectorAll('main article').length`)
  if(count){
    externalPassed=true
    await click('main article button[aria-pressed]')
    await click('main article button[aria-label^="Consultar"]')
    await waitFor(`!!document.querySelector('dialog[open]')&&!document.querySelector('dialog [role="status"]')`,45000)
    assert.equal(await evaluate(`document.querySelectorAll('dialog [role="alert"]').length`),0)
    await click('dialog button[aria-label="Cerrar detalles"]')
    await navigate('/favoritos');await waitFor(`document.querySelectorAll('main article').length===1`)
    const saved=await evaluate(`JSON.parse(localStorage.getItem('otakuzone.favorites.v1')).items[0].source`);assert.equal(saved,'anilist')
    console.log(`PASS AniList real en React: búsqueda/filtros (${count} resultados), detalle y favorito persistido`)
  }else{
    assert.ok(await evaluate(`!!document.querySelector('main [role="alert"]')&&!!document.querySelector('a[href="/animes?source=demo"]')`))
    console.log('PENDIENTE EXTERNO: AniList no produjo resultados reales; error y enlace demo comprobados, sin inventar éxito')
  }
  await resize(1440);await screenshot('qa-catalogo-externo')
  const errors=browser.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');assert.deepEqual(errors,[])
  console.log(`PASS QA navegador local; AniList real: ${externalPassed?'PASS':'NO VALIDADO'}`)
}catch(e){console.error('FAIL QA navegador:',e.message);await screenshot('qa-error');process.exitCode=1}
finally{await browser.close()}
