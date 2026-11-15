import assert from 'node:assert/strict'
import { openBrowser } from './browser-session.mjs'

// Isolated frontend contract audit: no requests reach user subscriptions or MySQL.
const browser = await openBrowser()
try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.audit={code:'free',writes:0,fail:false,guest:false,history:[]};
    const original=window.fetch;
    window.fetch=async (url,options={})=>{
      if(!String(url).includes('/api/v1/')) return original(url,options);
      const path=new URL(url,location.href).pathname.split('/api/v1')[1];
      let data=[];
      if(path==='/auth/session')data={user:window.audit.guest?null:{id:'isolated-test',name:'Prueba',role:'USER'},csrfToken:'test'};
      if(path==='/plans')data=[{code:'free',name:'Free',price:0},{code:'premium',name:'Premium',price:19.90}];
      if(path==='/subscription'){
        if(options.method==='PATCH'){
          window.audit.writes++;
          await new Promise(r=>setTimeout(r,150));
          if(window.audit.fail)return Response.json({success:false,error:{message:'No se pudo cambiar el plan de prueba.'}},{status:503});
          window.audit.code=JSON.parse(options.body).code;
          window.audit.history.unshift({code:window.audit.code,status:'activa',startedAt:'2026-11-14T12:00:00Z'});
        }
        data={code:window.audit.code,history:window.audit.history};
      }
      return Response.json({success:true,data});
    };` })
  await browser.navigate('/suscripciones')
  await browser.waitFor(`document.querySelector('main').textContent.includes('Plan actual: Free')`)
  const choose = async name => {
    await browser.evaluate(`{const b=Array.from(document.querySelectorAll('main article button')).find(b=>b.textContent==='Elegir ${name}');b.focus();b.click()}`)
    await browser.waitFor(`!!document.querySelector('dialog[open]')`)
  }
  const confirm = () => browser.evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Confirmar cambio').click()`)
  const checkWidths = async label => {
    for(const width of [320,375,768,1024,1440]){
      await browser.resize(width)
      const m=await browser.evaluate(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,cards:Array.from(document.querySelectorAll('main article')).map(e=>e.getBoundingClientRect().height),dialog:document.querySelector('dialog[open]')?.getBoundingClientRect().toJSON()})`)
      assert.equal(m.client,m.scroll)
      if(width>=768)assert.equal(m.cards[0],m.cards[1])
      if(m.dialog)assert.ok(m.dialog.x>=0&&m.dialog.right<=m.client)
      console.log(label,width,JSON.stringify(m))
      if([320,1440].includes(width)){
        await browser.evaluate('window.scrollTo(0,0)')
        await browser.screenshot('subscriptions-'+label+'-'+width)
      }
    }
  }
  assert.ok(await browser.evaluate(`document.querySelector('main article button').disabled`))
  await browser.evaluate(`document.querySelector('main article button').click()`)
  assert.equal(await browser.evaluate('window.audit.writes'),0)
  await checkWidths('free')
  await choose('Premium');await checkWidths('confirmation')
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.ok(await browser.evaluate(`document.activeElement.textContent==='Confirmar cambio'`))
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await browser.waitFor(`!document.querySelector('dialog')`)
  assert.equal(await browser.evaluate('window.audit.writes'),0)
  assert.ok(await browser.evaluate(`document.activeElement.textContent==='Elegir Premium'`))
  await choose('Premium')
  await browser.evaluate('window.audit.fail=true');await confirm()
  await browser.waitFor(`!!document.querySelector('dialog [role="alert"]')`)
  assert.equal(await browser.evaluate('window.audit.code'),'free')
  await browser.evaluate('window.audit.fail=false');await confirm()
  await browser.waitFor(`document.querySelector('main').textContent.includes('Plan actual: Premium') && !document.querySelector('dialog')`)
  assert.ok(await browser.evaluate(`!!document.querySelector('header [aria-label="Insignia Premium"]')`))
  await checkWidths('premium')
  await browser.evaluate(`document.querySelector('header a[aria-label="OtakuZone — Inicio"]').click()`)
  await browser.waitFor(`location.pathname==='/' && document.querySelectorAll('#plans-title').length===1`)
  assert.ok(await browser.evaluate(`!document.querySelector('[aria-label="Promociones de demostración"]')`))
  assert.ok(await browser.evaluate(`!/demostr|simulad|académic|sin cobros/i.test(document.querySelector('#plans-title').parentElement.parentElement.innerText)`))
  await browser.evaluate(`document.querySelector('a[href="/suscripciones"]').click()`)
  await browser.waitFor(`location.pathname==='/suscripciones' && document.querySelector('main').textContent.includes('Plan actual: Premium')`)
  await choose('Free');await confirm()
  await browser.waitFor(`document.querySelector('main').textContent.includes('Plan actual: Free') && !document.querySelector('dialog')`)
  assert.equal(await browser.evaluate('window.audit.writes'),3)
  assert.ok(await browser.evaluate(`!document.querySelector('header [aria-label="Insignia Premium"]')`))
  assert.ok(await browser.evaluate(`!/demostr|simulad|académic|sin cobros|precio de muestra/i.test(document.querySelector('main').innerText)`))
  await browser.evaluate(`window.audit.guest=true;window.dispatchEvent(new Event('otakuzone:session-expired'))`)
  await browser.waitFor(`!!document.querySelector('main article a[href="/cuenta"]')`)
  console.log('PASS: current plan blocked; cancel/Escape/focus restored; server error; Free -> Premium -> Free; badge; history; guest links; 15 responsive checks. Controlled HTTP responses only; live persistence not tested.')
} finally { await browser.close() }
