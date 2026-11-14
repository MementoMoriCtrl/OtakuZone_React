import assert from 'node:assert/strict'
import { createAnilistService } from '../src/services/anilistService.js'
const service=createAnilistService()
let failed=false,id=1
const checks=[['populares',()=>service.popular(),v=>{assert.ok(v.items.length);id=v.items[0].id}],['búsqueda/filtros',()=>service.search({q:'Naruto',genre:'Action',status:'complete',order:'score',page:1}),v=>{assert.ok(v.items.length);assert.ok(v.items.every(a=>a.source==='anilist'&&a.statusCode==='complete'&&a.genreIds.includes('Action')))}],['géneros',()=>service.genres(),v=>assert.ok(v.some(g=>g.name==='Action'))],['temporada',()=>service.season({}),v=>assert.ok(v.items.length)],['detalle',()=>service.detail(id),v=>assert.equal(v.id,id)]]
for(let i=0;i<checks.length;i++){
  const [label,run,validate]=checks[i]
  try{const result=await run();validate(result);console.log(`PASS REAL AniList POST: ${label}${result.items?` (${result.items.length} registros)`:''}`)}
  catch(e){failed=true;console.error(`FAIL REAL AniList ${label}: ${e.code??e.name} (${e.status??'sin HTTP'})`);if(e.status===429){console.error('SKIP consultas restantes por cuota; repetir tras Retry-After');break}}
}
process.exitCode=failed?1:0
