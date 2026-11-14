import assert from 'node:assert/strict'
import { randomBytes,randomUUID } from 'node:crypto'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { assertTestIsolation } from './test-isolation.js'
loadEnvironment();const config=loadDatabaseConfig();await assertTestIsolation(config)
const pool=createDatabasePool(config),base=process.env.API_URL,origin=process.env.CORS_ORIGINS
assert.equal(new URL(base).port,'4407')
let checks=0
async function call(path,status=200,options={}) {
  const res=await fetch(base+path,{...options,signal:AbortSignal.timeout(15000)})
  assert.equal(res.status,status,`${options.method??'GET'} ${path}`);checks++
  if([204].includes(status)||options.method==='HEAD')return res
  const body=await res.json();assert.equal(body.success,status<400)
  if(status>=400)assert.ok(body.error.code&&!JSON.stringify(body).match(/password_hash|SELECT .* FROM|\bat .+\.js:\d|JWT_SECRET/))
  return {res,body}
}
try {
  const health=await call('/health');assert.equal(health.res.headers.get('cache-control'),'no-store');assert.equal(health.res.headers.get('x-powered-by'),null)
  await call('/health',200,{method:'HEAD'})
  await call('/health',405,{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})
  await call('/products',400,{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'})
  await call('/products',413,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'x'.repeat(11000)})})
  await call('/products',403,{headers:{Origin:'https://untrusted.example'}})
  const preflight=await call('/admin/products/slug',204,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'X-OtakuZone-CSRF,Content-Type'}})
  assert.ok(preflight.headers.get('access-control-allow-methods').includes('PUT'));assert.equal(preflight.headers.get('access-control-allow-credentials'),'true')
  for(const path of ['/products?unknown=1','/products?q=a&q=b','/products?categoryId[]=mangas','/products/%2F','/products/%E0%A4%A','/categories?x=1'])await call(path,400)
  for(const path of ['/no-such-route','/products/not-existing-quality','/categories/not-existing-quality'])await call(path,404)
  const injection=await call('/products?q='+encodeURIComponent("' OR 1=1 --"));assert.deepEqual(injection.body.data,[])
  const registration=await call('/auth/register',201,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-OtakuZone-CSRF':'1'},body:JSON.stringify({name:'Cliente QA',email:`qa-${randomUUID()}@example.test`,password:'Aa1-'+randomBytes(20).toString('hex')})})
  const headers={Origin:origin,Cookie:registration.res.headers.getSetCookie()[0].split(';')[0],'Content-Type':'application/json','X-OtakuZone-CSRF':registration.body.data.csrfToken}
  await call('/orders/1844674407370955161',404,{headers})
  await call('/orders/invalid',400,{headers})
  await call('/orders?userId=1',400,{headers})
  const cart=await call('/cart',200,{headers})
  await call('/orders',409,{method:'POST',headers,body:JSON.stringify({cartId:cart.body.data.id,idempotencyKey:randomUUID()})})
  await call('/cart/items/not-existing-quality',404,{method:'PATCH',headers,body:'{"quantity":1}'})
  await call('/cart/items',400,{method:'POST',headers,body:'{"productId":"missing","quantity":"1"}'})
  await call('/auth/me',400,{method:'PATCH',headers,body:'{"name":"Cliente QA","bio":"","password_hash":"injected"}'})
  const [relations]=await pool.execute('SELECT TABLE_NAME AS child,COLUMN_NAME AS field,REFERENCED_TABLE_NAME AS parent,REFERENCED_COLUMN_NAME AS parentField FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[config.database])
  const quote=s=>{assert.match(s,/^[a-zA-Z0-9_]+$/);return '`'+s+'`'}
  for(const r of relations){const [[result]]=await pool.query(`SELECT COUNT(*) AS n FROM ${quote(r.child)} c LEFT JOIN ${quote(r.parent)} p ON c.${quote(r.field)}=p.${quote(r.parentField)} WHERE c.${quote(r.field)} IS NOT NULL AND p.${quote(r.parentField)} IS NULL`);assert.equal(Number(result.n),0,`Relación huérfana ${r.child}.${r.field}`)}
  const [[money]]=await pool.execute('SELECT COUNT(*) AS n FROM detalles_pedido WHERE subtotal<>precio_unitario*cantidad');assert.equal(Number(money.n),0)
  const [[stock]]=await pool.execute('SELECT COUNT(*) AS n FROM inventario WHERE cantidad_total<0 OR cantidad_reservada<0 OR cantidad_disponible<>cantidad_total-cantidad_reservada');assert.equal(Number(stock.n),0)
  console.log(`PASS QA HTTP: ${checks} solicitudes, CORS/PUT/HEAD/OPTIONS/405, errores, entradas, pedido inexistente/vacío; ${relations.length} relaciones sin huérfanos, DECIMAL e inventario consistentes`)
}catch(e){console.error('FAIL QA HTTP:',e.code==='ERR_ASSERTION'?e.message:e.code??e.message);process.exitCode=1}
finally{await pool.end()}
