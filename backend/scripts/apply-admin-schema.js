import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { loadEnvironment } from '../src/config/loadEnvironment.js'
import { loadDatabaseConfig } from '../src/config/database.js'
import { createDatabasePool, checkDatabaseConnection } from '../src/db/pool.js'
import { readMigrationCatalog, assertMigrationDialect } from '../src/db/migrationCatalog.js'

// Apply only 007, with the same checksum normalization as migrate.js.
// No existing migration SQL is executed. DDL is not transactional in MySQL.
loadEnvironment()
const config=loadDatabaseConfig()
const catalog=await readMigrationCatalog(config.engine)
assertMigrationDialect(catalog,config.engine)
const pool=createDatabasePool(config)
let c,locked=false
try {
  c=await pool.getConnection()
  await checkDatabaseConnection(c,{expectedEngine:'mysql',phase:'bootstrap'})
  const [[lock]]=await c.execute('SELECT GET_LOCK(?,10) AS acquired',['otakuzone_db:migrations'])
  assert.equal(Number(lock.acquired),1,'Otro proceso está migrando');locked=true
  const [existing]=await c.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')
  assertMigrationDialect(catalog,'mysql',existing.map(row=>row.name))
  const [ledger]=await c.execute('SELECT version,checksum FROM schema_migrations ORDER BY version')
  const manifest=JSON.parse(await readFile(new URL('../database/migrations/manifest.json',import.meta.url),'utf8'))
  const prepared=[]
  for(const {file} of manifest){
    const sql=(await readFile(new URL(`../database/migrations/${file}`,import.meta.url),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
    const checksum=createHash('sha256').update(sql).digest('hex')
    const applied=ledger.find(r=>r.version===file)
    if(applied)assert.equal(applied.checksum,checksum,`Checksum alterado: ${file}`)
    else assert.equal(file,'007_admin_inventory.sql','Falta una migración anterior')
    prepared.push({file,sql,checksum})
  }
  assert.ok(ledger.every(r=>prepared.some(p=>p.file===r.version)),'Versión desconocida')
  const migration=prepared.find(p=>p.file==='007_admin_inventory.sql')
  if(ledger.some(r=>r.version===migration.file)) console.log('SKIP 007: ya aplicada, checksum correcto')
  else {
    assert.equal(ledger.length,6)
    const [tables]=await c.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='movimientos_inventario'")
    assert.equal(tables.length,0,'DDL parcial: inspeccionar manualmente, no repetir')
    await c.query(migration.sql)
    await c.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[migration.file,migration.checksum])
    console.log('APPLY 007: tabla de movimientos creada; ninguna fila previa modificada')
  }
} catch(e){console.error('Migración ADMIN detenida:',e.code==='ERR_ASSERTION'?e.message:e.code??e.message);process.exitCode=1}
finally {if(c){try{if(locked)await c.execute('SELECT RELEASE_LOCK(?)',['otakuzone_db:migrations'])}finally{c.release()}}await pool.end()}
