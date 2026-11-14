// Reads REAL HTTP services. No success fixtures or automatic demo substitution.
import assert from 'node:assert/strict'
import { readStoreCollection } from '../src/services/storeContract.js'
const store=(process.env.OTAKUZONE_API_URL??'http://127.0.0.1:4000/api/v1').replace(/\/$/,'')
const anime=(process.env.ANIME_API_URL??process.env.API_URL??'http://127.0.0.1:4000/api/v1').replace(/\/$/,'')
let failed=false,id=1
async function check(label,run){try{await run();console.log(`PASS REAL ${label}`)}catch(e){failed=true;console.error(`FAIL REAL ${label}: ${e.message}`)}}
await check('catálogo HTTP configurado',async()=>{for(const name of ['products','categories','promotions']){const r=await fetch(`${store}/${name}`,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const items=readStoreCollection(await r.json());assert.ok(items.length);console.log(`${name}: ${items.length} registros`)}})
for(const [label,path] of [['populares','/anime/popular'],['búsqueda/filtros','/anime?q=Naruto&genre=Action&status=complete&order=score&page=1'],['géneros','/anime/genres'],['temporada','/anime/season'],['detalle',null]])await check(`Express → AniList ${label}`,async()=>{const r=await fetch(anime+(path??`/anime/${id}`),{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const b=await r.json();assert.equal(b.meta.source,'anilist');if(label==='populares'){assert.ok(b.data.items.length);id=b.data.items[0].id}else if(label==='detalle')assert.equal(b.data.id,id);else if(label==='géneros')assert.ok(b.data.length);else assert.ok(b.data.items.length)})
process.exitCode=failed?1:0
