import assert from 'node:assert/strict'
import { openBrowser } from './browser-session.mjs'
// REAL integration only: no response interception and no MySQL writes.
const browser=await openBrowser()
const {navigate,waitFor,evaluate,click,input,select,resize,screenshot,send}=browser
try {
  await resize(1440);await navigate('/')
  await waitFor(`!!(document.querySelector('[aria-labelledby="popular-title"] article')&&document.querySelector('[aria-labelledby="latest-title"] article')&&document.querySelector('[aria-labelledby="genres-title"] a')&&document.querySelector('[aria-labelledby="shop-title"] article'))`,45000)
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('main article')).some(a=>a.textContent.includes('ANILIST'))`))
  const counts=await evaluate(`({popular:document.querySelectorAll('[aria-labelledby="popular-title"] article').length,season:document.querySelectorAll('[aria-labelledby="latest-title"] article').length,genres:document.querySelectorAll('[aria-labelledby="genres-title"] a').length,products:document.querySelectorAll('[aria-labelledby="shop-title"] article').length})`)
  console.log('PASS REAL Home React → Express → AniList y catálogo configurado simultáneos:',JSON.stringify(counts))
  await navigate('/animes');await waitFor(`document.querySelectorAll('main article').length>0`,45000)
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Siguiente').click()`)
  await waitFor(`new URLSearchParams(location.search).get('page')==='2'&&!document.querySelector('main').textContent.includes('Cargando información')&&document.querySelectorAll('main article').length>0`,45000)
  console.log('PASS REAL paginación AniList: segunda página recibida')
  await waitFor(`!!document.querySelector('select[name="genre"] option[value="Action"]')`,45000)
  await input('input[name="q"]','Naruto');await select('genre','Action');await select('status','complete');await select('order','score')
  await evaluate(`document.querySelector('form[role="search"]').requestSubmit()`)
  await waitFor(`new URLSearchParams(location.search).get('q')==='Naruto'&&!document.querySelector('main').textContent.includes('Cargando información')&&document.querySelectorAll('main article').length>0`,45000)
  const card=await evaluate(`({id:document.querySelector('main article button[aria-pressed]').getAttribute('aria-pressed'),title:document.querySelector('main article h3').textContent})`)
  assert.ok(card.title)
  await click('main article button[aria-pressed]')
  const saved=await evaluate(`JSON.parse(localStorage.getItem('otakuzone.favorites.v1')).items[0]`);assert.equal(saved.source,'anilist');assert.ok(Number.isInteger(saved.id))
  await click('main article button[aria-label^="Consultar"]')
  await waitFor(`document.querySelector('dialog[open]')&&!document.querySelector('dialog [role="status"]')`,45000)
  assert.equal(await evaluate(`document.querySelectorAll('dialog [role="alert"]').length`),0)
  assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes('AniList')`))
  await screenshot('anilist-detalle-real')
  await click('dialog button[aria-label="Cerrar detalles"]')
  // Preserve an older Jikan record, without ever resolving its MAL id via AniList.
  await evaluate(`(()=>{const k='otakuzone.favorites.v1',v=JSON.parse(localStorage.getItem(k));v.items.push({id:1,source:'jikan',title:'Favorito heredado de prueba',description:'Snapshot técnico legado'});localStorage.setItem(k,JSON.stringify(v))})()`)
  await navigate('/favoritos');await waitFor(`document.querySelectorAll('main article').length===2`)
  await evaluate(`Array.from(document.querySelectorAll('main article')).find(a=>a.textContent.includes('Favorito heredado')).querySelector('button[aria-label^="Consultar"]').click()`)
  await waitFor(`document.querySelector('dialog')?.textContent.includes('sin convertir su ID a AniList')`)
  await click('dialog button[aria-label="Cerrar detalles"]')
  console.log('PASS REAL búsqueda/filtros, detalle y favorito AniList; snapshot legado identificado sin convertir IDs')
  await navigate('/animes?q=otakuzone-no-match-rare-test-993187')
  await waitFor(`document.querySelector('main').textContent.includes('No encontramos animes')`,45000)
  console.log('PASS REAL respuesta vacía del catálogo')
  for(const width of [320,375,768,1024,1440]){await resize(width);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))}
  await navigate('/animes?source=demo');await waitFor(`document.querySelectorAll('main article').length===12`)
  assert.ok(await evaluate(`document.querySelector('[role="note"]').textContent.includes('DEMO LOCAL')`))
  await send('Network.setBlockedURLs',{urls:[`${process.env.API_URL??'http://127.0.0.1:4000/api/v1'}/anime*`]})
  await navigate('/animes?q=blocked-connection-test');await waitFor(`!!document.querySelector('main [role="alert"]')`,45000)
  assert.ok(await evaluate(`!!document.querySelector('a[href="/animes?source=demo"]')`))
  await send('Network.setBlockedURLs',{urls:[]})
  // Search and genres have independent ResourceState instances: retry both.
  await evaluate(`Array.from(document.querySelectorAll('main [role="alert"] button')).forEach(b=>b.click())`)
  await waitFor(`!document.querySelector('main [role="alert"]')&&!document.querySelector('main').textContent.includes('Cargando información')`,45000)
  const failures=browser.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');assert.deepEqual(failures,[])
  console.log('PASS demo explícita, error de conexión/reintento y responsive; sin excepciones de aplicación')
}catch(e){console.error('FAIL navegador AniList REAL:',e.message);await screenshot('anilist-error');process.exitCode=1}
finally{await browser.close()}
