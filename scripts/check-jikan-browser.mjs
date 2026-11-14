import assert from 'node:assert/strict'
import { openBrowser } from './browser-session.mjs'
// Diagnostic only: public API, optional existing proxy, no TLS bypass and no fixtures.
const browser=await openBrowser()
const url='https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=4&sfw=true'
try {
  const navigation=await browser.send('Page.navigate',{url})
  assert.ok(!navigation.errorText,navigation.errorText)
  await browser.waitFor(`document.body?.innerText.trim().startsWith('{')`,30000)
  const result=await browser.evaluate(`JSON.parse(document.body.innerText)`)
  assert.equal(result.data.length,4)
  console.log('PASS Jikan JSON real en Chrome: cuatro populares, TLS validado')
}catch(e){
  const failures=browser.events.filter(e=>e.method==='Network.loadingFailed').map(e=>e.params.errorText)
  console.error('FAIL conectividad Jikan Chrome:',failures.join(', ')||e.message);process.exitCode=1
}finally{await browser.close()}
