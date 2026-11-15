import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { authSql } from '../src/db/authSql.js'
import { commerceSql } from '../src/db/commerceSql.js'
import { cookieOptions } from '../src/middlewares/auth.js'

const origins=['http://localhost:5173','http://localhost:5174','http://127.0.0.1:5173','http://127.0.0.1:5174']
const publicPaths=['/anime/popular','/anime/genres','/anime/season','/products','/promotions','/plans','/auth/session']

async function start(context) {
  const config=loadConfig({NODE_ENV:'test',AUTH_ENABLED:'true',JWT_SECRET:randomBytes(64).toString('hex'),BCRYPT_ROUNDS:'10',DB_USER:'cors-test-double',DB_PASSWORD:'unit-test-only'})
  // Explicit SQL/read doubles: no MySQL connection, registration or data writes.
  const pool={execute:async(sql,params=[])=>{
    if(sql===commerceSql.plans)return [[{code:'free',name:'Plan fixture',price:'0.00'}]]
    if(sql===authSql.session)return [[{id:params[1],name:'Usuario fixture',email:'cors@example.test',bio:'',roleCode:params[1]==='2'?'administrador':'cliente',expiresAt:new Date(Date.now()+60000)}]]
    if(sql===authSql.overview)return [[{users:2,products:12,sessions:2}]]
    throw new Error('SQL no autorizado en prueba CORS: no se permiten escrituras')
  }}
  const animeService={popular:async()=>({items:[],hasNext:false}),genres:async()=>[],season:async()=>({items:[],hasNext:false})}
  const server=createApp({config,authPool:pool,animeService}).listen(0,'127.0.0.1')
  await once(server,'listening')
  context.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
  const cookie=id=>`${config.auth.cookieName}=${jwt.sign({sid:'a'.repeat(64)},config.auth.secret,{subject:id,issuer:config.auth.issuer,audience:config.auth.audience,expiresIn:300})}`
  return {base:`http://127.0.0.1:${server.address().port}/api/v1`,cookie,config}
}

test('CORS configuración: cuatro orígenes locales exactos; override y producción conservados',()=>{
  for(const environment of ['development','test'])for(const origin of origins)assert.ok(loadConfig({NODE_ENV:environment}).origins.includes(origin))
  assert.ok(loadConfig({}).origins.includes('http://localhost:4173'),'conserva preview anterior')
  assert.deepEqual(loadConfig({CORS_ORIGINS:'http://localhost:5173'}).origins,['http://localhost:5173'],'no amplía listas explícitas')
  assert.deepEqual(loadConfig({NODE_ENV:'production',CORS_ORIGINS:'https://otakuzone.example'}).origins,['https://otakuzone.example'])
  assert.throws(()=>loadConfig({NODE_ENV:'production'}),/CORS_ORIGINS/)
  assert.throws(()=>loadConfig({NODE_ENV:'production',CORS_ORIGINS:origins.join(',')}),/HTTPS/)
  assert.throws(()=>loadConfig({CORS_ORIGINS:'*'}),/CORS_ORIGINS/)
})

test('CORS HTTP: siete endpoints admiten los cuatro orígenes y mantienen rechazo externo',async context=>{
  const {base}=await start(context)
  for(const origin of origins)for(const path of publicPaths){
    const response=await fetch(base+path,{headers:{Origin:origin}})
    assert.equal(response.status,200,`${origin} ${path}`)
    assert.equal(response.headers.get('access-control-allow-origin'),origin)
    assert.equal(response.headers.get('access-control-allow-credentials'),'true')
    assert.ok(response.headers.get('vary')?.includes('Origin'))
    assert.equal((await response.json()).success,true)
  }
  for(const path of publicPaths){
    assert.equal((await fetch(base+path)).status,200,`${path} sin Origin`)
    const response=await fetch(base+path,{headers:{Origin:'https://blocked.example'}})
    assert.equal(response.status,403)
    assert.equal(response.headers.get('access-control-allow-origin'),null)
    assert.equal((await response.json()).error.code,'CORS_ORIGIN_DENIED')
  }
  for(const origin of ['http://localhost:51740','http://localhost.evil.example:5174','https://localhost:5174','null']){
    const response=await fetch(base+'/health',{headers:{Origin:origin}})
    assert.equal(response.status,403);assert.equal((await response.json()).error.code,'CORS_ORIGIN_DENIED')
  }
})

test('CORS preflight: refleja origen exacto y credenciales sin comodines',async context=>{
  const {base}=await start(context)
  for(const origin of origins){
    const response=await fetch(base+'/admin/products',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'Content-Type,X-OtakuZone-CSRF'}})
    assert.equal(response.status,204)
    assert.equal(response.headers.get('access-control-allow-origin'),origin)
    assert.equal(response.headers.get('access-control-allow-credentials'),'true')
    assert.ok(response.headers.get('access-control-allow-methods').includes('PUT'))
    assert.ok(response.headers.get('access-control-allow-headers').includes('X-OtakuZone-CSRF'))
  }
})

test('CORS no elude sesión, roles, firma JWT ni CSRF; cookies mantienen sus opciones',async context=>{
  const {base,cookie,config}=await start(context)
  for(const origin of origins){
    for(const path of ['/cart','/orders','/admin/dashboard'])assert.equal((await fetch(base+path,{headers:{Origin:origin}})).status,401)
    const session=await fetch(base+'/auth/session',{headers:{Origin:origin,Cookie:cookie('1')}})
    assert.equal(session.status,200)
    assert.equal(session.headers.get('access-control-allow-credentials'),'true')
    const data=(await session.json()).data
    assert.equal(data.user.role,'CLIENTE');assert.ok(data.csrfToken)
    const denied=await fetch(base+'/admin/products',{headers:{Origin:origin,Cookie:cookie('1')}})
    assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'FORBIDDEN')
    assert.equal((await fetch(base+'/admin/products',{method:'POST',headers:{Origin:origin,Cookie:cookie('1'),'Content-Type':'application/json','X-OtakuZone-CSRF':data.csrfToken},body:'{}'})).status,403)
    assert.equal((await fetch(base+'/admin/overview',{headers:{Origin:origin,Cookie:cookie('2')}})).status,200)
    const csrf=await fetch(base+'/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie('1'),'Content-Type':'application/json','X-OtakuZone-CSRF':'incorrecto'},body:'{}'})
    assert.equal(csrf.status,403);assert.equal((await csrf.json()).error.code,'CSRF_REJECTED')
  }
  assert.equal((await fetch(base+'/auth/me',{headers:{Origin:origins[0],Cookie:config.auth.cookieName+'=forged'}})).status,401)
  assert.deepEqual(cookieOptions(config.auth),{httpOnly:true,secure:false,sameSite:'lax',path:'/'})
  assert.deepEqual(cookieOptions({...config.auth,secure:true}),{httpOnly:true,secure:true,sameSite:'lax',path:'/'})
})
