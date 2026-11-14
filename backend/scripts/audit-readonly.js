import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool } from '../src/db/pool.js'
import { checkDatabaseSchema } from '../src/db/schemaCheck.js'
loadEnvironment();const config=loadDatabaseConfig(),pool=createDatabasePool(config)
try{
  const schema=await checkDatabaseSchema(pool)
  const [ledger]=await pool.execute('SELECT version,checksum FROM schema_migrations ORDER BY version')
  for(const r of ledger){assert.match(r.version,/^\d{3}_[a-z_]+\.sql$/);const sql=(await readFile(new URL(`../database/migrations/${r.version}`,import.meta.url),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');assert.equal(createHash('sha256').update(sql).digest('hex'),r.checksum)}
  const [fk]=await pool.execute('SELECT TABLE_NAME AS child,COLUMN_NAME AS field,REFERENCED_TABLE_NAME AS parent,REFERENCED_COLUMN_NAME AS parentField FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[config.database])
  const quote=s=>{assert.match(s,/^[a-zA-Z0-9_]+$/);return '`'+s+'`'}
  for(const r of fk){const [[v]]=await pool.query(`SELECT COUNT(*) AS n FROM ${quote(r.child)} c LEFT JOIN ${quote(r.parent)} p ON c.${quote(r.field)}=p.${quote(r.parentField)} WHERE c.${quote(r.field)} IS NOT NULL AND p.${quote(r.parentField)} IS NULL`);assert.equal(Number(v.n),0,`FK ${r.child}.${r.field}`)}
  const queries={invalidInventory:'SELECT COUNT(*) AS n FROM inventario WHERE cantidad_total<0 OR cantidad_reservada<0 OR cantidad_disponible<>cantidad_total-cantidad_reservada',invalidOrderAmounts:'SELECT COUNT(*) AS n FROM detalles_pedido WHERE subtotal<>precio_unitario*cantidad',invalidMovementAmounts:'SELECT COUNT(*) AS n FROM movimientos_inventario WHERE cantidad_nueva-cantidad_anterior<>delta',activeUsersWithoutBcrypt:"SELECT COUNT(*) AS n FROM usuarios WHERE estado='activo' AND (password_hash IS NULL OR password_hash NOT LIKE '$2%$%')"}
  const consistency={}
  for(const [key,sql] of Object.entries(queries)){const [[v]]=await pool.execute(sql);consistency[key]=Number(v.n);assert.equal(consistency[key],0,key)}
  const [grants]=await pool.execute('SHOW GRANTS FOR CURRENT_USER')
  console.log(JSON.stringify({mode:'READ_ONLY',schema,matchingChecksums:ledger.length,relationsWithoutOrphans:fk.length,consistency,runtimeHasGlobalPrivileges:grants.some(r=>Object.values(r)[0].includes(' ON *.*')&&!Object.values(r)[0].startsWith('GRANT USAGE'))}))
}catch(e){console.error('FAIL auditoría solo lectura:',e.code==='ERR_ASSERTION'?e.message:e.code??e.message);process.exitCode=1}
finally{await pool.end()}
