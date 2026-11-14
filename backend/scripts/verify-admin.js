import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID,randomBytes } from 'node:crypto'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadConfig } from '../src/config/env.js'
import { createDatabasePool } from '../src/db/pool.js'
import { createMysqlCatalogRepository } from '../src/repositories/mysqlCatalogRepository.js'
import { createApp } from '../src/app.js'
import { createAdminRepository } from '../src/repositories/adminRepository.js'
import { assertTestIsolation } from './test-isolation.js'
loadEnvironment();const config=loadConfig();await assertTestIsolation(config.database)
const pool=createDatabasePool(config.database)
let server,checks=0
try {
  server=createApp({config,repository:createMysqlCatalogRepository(pool),authPool:pool}).listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}/api/v1`
  const call=async(path,account,method='GET',body,status=200)=>{
    const res=await fetch(base+path,{method,headers:{Origin:config.origins[0],...(account?{Cookie:account.cookie}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-OtakuZone-CSRF':account?.csrf??'1'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    const result=await res.json();assert.equal(res.status,status,`${method} ${path}: ${result.error?.code}`);checks++
    return {data:result.data,cookie:res.headers.getSetCookie()[0]?.split(';')[0]}
  }
  const register=async()=>{const r=await call('/auth/register',null,'POST',{name:'Prueba administración',email:`admin-test-${randomUUID()}@example.test`,password:`Aa1-${randomBytes(20).toString('hex')}`},201);return {id:r.data.user.id,cookie:r.cookie,csrf:r.data.csrfToken}}
  const admin=await register(),client=await register()
  await pool.execute("UPDATE usuarios SET rol_id=(SELECT id FROM roles WHERE codigo='administrador') WHERE id=?",[admin.id])
  const matrix=[...['dashboard','products','categories','inventory','movements','orders','users'].map(x=>['GET',`/admin/${x}`]),['POST','/admin/products'],['PUT','/admin/products/missing'],['DELETE','/admin/products/missing'],['POST','/admin/categories'],['PUT','/admin/categories/missing'],['PATCH','/admin/inventory/missing'],['GET','/admin/orders/1'],['PATCH','/admin/orders/1/status']]
  for(const [method,path] of matrix){await call(path,null,method,method==='GET'?undefined:{},401);await call(path,client,method,method==='GET'?undefined:{},403)}
  const id='admin-'+randomUUID(),categoryId='cat-'+randomUUID()
  await call('/admin/categories',admin,'POST',{id:categoryId,name:'Categoría de prueba',active:true},201)
  const body={id,name:'Producto administrativo',categoryId,price:10.25,description:'Producto técnico aislado',imageKey:'manga',imageAlt:'Prueba de catálogo',active:true,quantity:8}
  await call('/admin/products',admin,'POST',body,201)
  await call('/admin/products',admin,'POST',body,409)
  for(const invalid of [{...body,id:'bad-price',price:-1},{...body,id:'bad-cent',price:1.001},{...body,id:'bad-stock',quantity:-1},{...body,id:'bad-name',name:' '},{...body,id:'bad-role',role:'ADMIN'}]) await call('/admin/products',admin,'POST',invalid,400)
  await call('/admin/products',admin,'POST',{...body,id:'bad-cat',categoryId:'missing-category'},409)
  const {id:_id,quantity:_quantity,...update}=body
  await call(`/admin/products/${id}`,admin,'PUT',{...update,name:'Producto actualizado',price:12.5})
  const found=(await call('/admin/products',admin)).data.items.find(p=>p.id===id);assert.equal(found.name,'Producto actualizado');assert.equal(found.price,'12.50')
  const stock=async()=>(await pool.execute('SELECT cantidad_total AS n FROM inventario WHERE producto_id=?',[id]))[0][0].n
  await call(`/admin/inventory/${id}`,admin,'PATCH',{quantity:6,expectedQuantity:8,reason:'Ajuste técnico'})
  await call(`/admin/inventory/${id}`,admin,'PATCH',{quantity:9,expectedQuantity:8,reason:'Edición obsoleta'},409)
  await pool.execute('UPDATE inventario SET cantidad_reservada=2 WHERE producto_id=?',[id])
  await call(`/admin/inventory/${id}`,admin,'PATCH',{quantity:1,expectedQuantity:6,reason:'Menos que reserva'},409)
  assert.equal(await stock(),6)
  const repo=createAdminRepository(pool)
  await assert.rejects(repo.updateInventory(id,{quantity:9,expectedQuantity:6,reason:'Actor inexistente'},'18446744073709551615'),e=>e.status===409)
  assert.equal(await stock(),6,'El fallo de auditoría debe revertir el ajuste')
  await pool.execute('UPDATE inventario SET cantidad_reservada=0 WHERE producto_id=?',[id])
  await call('/cart/items',client,'POST',{productId:id,quantity:2})
  const cart=(await call('/cart',client)).data
  const order=(await call('/orders',client,'POST',{cartId:cart.id,idempotencyKey:randomUUID()},201)).data
  assert.equal(await stock(),4)
  const detail=(await call(`/admin/orders/${order.id}`,admin)).data;assert.equal(detail.userId,client.id);assert.equal(detail.items.length,1)
  await call(`/admin/orders/${order.id}/status`,admin,'PATCH',{status:'confirmado',expectedStatus:'confirmado'},400)
  await call(`/admin/orders/${order.id}/status`,admin,'PATCH',{status:'cancelado',expectedStatus:'confirmado'})
  assert.equal(await stock(),6)
  await call(`/admin/orders/${order.id}/status`,admin,'PATCH',{status:'cancelado',expectedStatus:'confirmado'},409);assert.equal(await stock(),6)
  await call('/cart/items',client,'POST',{productId:id,quantity:1})
  const cart2=(await call('/cart',client)).data
  const order2=(await call('/orders',client,'POST',{cartId:cart2.id,idempotencyKey:randomUUID()},201)).data
  await call(`/admin/orders/${order2.id}/status`,admin,'PATCH',{status:'completado',expectedStatus:'confirmado'})
  await call(`/admin/orders/${order2.id}/status`,admin,'PATCH',{status:'cancelado',expectedStatus:'confirmado'},409)
  const legacy=await pool.execute("INSERT INTO pedidos (usuario_id,estado) VALUES (?,'confirmado')",[client.id])
  await call(`/admin/orders/${legacy[0].insertId}/status`,admin,'PATCH',{status:'cancelado',expectedStatus:'confirmado'},409)
  const users=(await call('/admin/users',admin)).data
  assert.ok(users.items.every(u=>!('passwordHash' in u)&&!('password_hash' in u)&&!('password' in u)))
  await call(`/admin/users/${admin.id}/role`,admin,'PATCH',{role:'ADMIN'},404)
  await call('/auth/me',client,'PATCH',{name:'Cliente',bio:'',role:'ADMIN'},400)
  const csrf={...admin,csrf:'incorrecto'}
  await call(`/admin/products/${id}`,csrf,'DELETE',{},403)
  await call(`/admin/products/${id}`,admin,'DELETE',{})
  await call(`/products/${id}`,null,'GET',undefined,404)
  await call(`/admin/products/${id}`,admin,'PUT',update)
  await call(`/admin/categories/${categoryId}`,admin,'PUT',{name:'Categoría inactiva',active:false})
  await call(`/products/${id}`,null,'GET',undefined,404)
  assert.equal(Number((await pool.execute('SELECT COUNT(*) AS n FROM productos WHERE categoria_id=?',[categoryId]))[0][0].n),1)
  await call(`/admin/categories/${categoryId}`,admin,'PUT',{name:'Categoría activa',active:true})
  const movements=(await call('/admin/movements',admin)).data.items.filter(m=>m.productId===id)
  assert.equal(movements.length,5);assert.ok(movements.some(m=>m.reason==='Cancelación de pedido'))
  const dashboard=(await call('/admin/dashboard',admin)).data
  for(const [key,sql] of Object.entries({users:'SELECT COUNT(*) AS n FROM usuarios',products:'SELECT COUNT(*) AS n FROM productos',orders:'SELECT COUNT(*) AS n FROM pedidos',pendingOrders:"SELECT COUNT(*) AS n FROM pedidos WHERE estado='pendiente'",activeSubscriptions:"SELECT COUNT(*) AS n FROM historial_suscripciones WHERE estado='activa'",lowStock:'SELECT COUNT(*) AS n FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id WHERE p.activo=1 AND COALESCE(i.cantidad_disponible,0)<=5'})) assert.equal(dashboard[key],Number((await pool.execute(sql))[0][0].n))
  await call('/admin/products?page=0',admin,'GET',undefined,400)
  console.log(`PASS ADMIN/CLIENTE/401/CSRF, CRUD, categorías, inventario/reservas/rollback, pedidos/cancelación única, usuarios sin hashes y dashboard SQL: ${checks} solicitudes HTTP`)
} catch(e){console.error('Validación ADMIN:',e.code==='ERR_ASSERTION'?e.message:e.code??e.message);process.exitCode=1}
finally{if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve)});await pool.end()}
