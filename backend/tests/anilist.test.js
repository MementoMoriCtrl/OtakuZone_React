import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAnilistClient } from '../src/services/anilistClient.js'
import { createAnilistService,currentSeason } from '../src/services/anilistService.js'
import { normalizeAnime,normalizePage,normalizeDetails } from '../src/services/anilistAdapter.js'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'

const media={id:900001,title:{romaji:'FIXTURE ANILIST — prueba',english:'Fixture',native:'テスト'},coverImage:{large:'https://example.test/cover.png'},description:'<b>Sinopsis</b><br>sin HTML<script>alert(1)</script>',genres:['Action'],averageScore:85,popularity:200,status:'FINISHED',format:'TV',episodes:12,season:'FALL',seasonYear:2026,startDate:{year:2026,month:10,day:null}}
const page=()=>Response.json({data:{Page:{pageInfo:{hasNextPage:true},media:[media]}}})
test('AniList adapter (mock): score/100, títulos, conteo de usuarios y datos opcionales sin HTML ejecutable',()=>{
  const a=normalizeAnime(media);assert.equal(a.source,'anilist');assert.equal(a.score,8.5);assert.equal(a.popularity,200);assert.equal(a.statusCode,'complete');assert.equal(a.titles.native,'テスト');assert.ok(!a.description.includes('<'))
  assert.equal(normalizeAnime({id:1}).score,null)
  assert.throws(()=>normalizeAnime({id:'1'}),e=>e.status===502)
  assert.deepEqual(normalizePage({Page:{media:[],pageInfo:{hasNextPage:false}}}),{items:[],hasNext:false})
  assert.throws(()=>normalizeDetails({Media:null}),e=>e.status===404)
})
test('AniList service (mock): variables, no concatenación ni nulls opcionales, temporada UTC',async()=>{
  const calls=[];const service=createAnilistService({request:async(...args)=>{calls.push(args);return {}}},()=>new Date('2026-11-14T00:00:00Z'))
  await service.popular();assert.deepEqual(calls[0][1],{page:1,perPage:4,sort:['POPULARITY_DESC','ID']})
  await service.search({q:'a"} malicious',genre:'Action',status:'complete',order:'score',page:2})
  assert.equal(calls[1][1].search,'a"} malicious');assert.equal(calls[1][1].status,'FINISHED');assert.equal(calls[1][1].genre,'Action')
  await service.season({});assert.equal(calls[2][1].season,'FALL');assert.equal(calls[2][1].year,2026)
  assert.deepEqual(currentSeason(new Date('2026-01-01Z')),{season:'WINTER',year:2026})
})
test('AniList transport (mock): POST fijo, variables, deduplicación y caché tras validar',async()=>{
  let count=0,clock=0
  const client=createAnilistClient({intervalMs:0,now:()=>clock,ttlMs:100,fetcher:async(url,options)=>{count++;assert.equal(url,'https://graphql.anilist.co');assert.equal(options.method,'POST');assert.ok(JSON.parse(options.body).query.includes('$search'));return page()}})
  const run=()=>client.request('list',{search:'Naruto'},normalizePage)
  const [a,b]=await Promise.all([run(),run()]);assert.deepEqual(a,b);assert.equal(count,1)
  await run();assert.equal(count,1);clock=101;await run();assert.equal(count,2)
})
test('AniList transport (mock): JSON/GraphQL inválidos y fallos no quedan en caché ni se reintentan automáticamente',async()=>{
  for(const response of [()=>Response.json({errors:[{message:'internal secret',status:500}]}),()=>new Response('invalid'),()=>Response.json({data:{Page:{media:null}}})]){
    let count=0;const client=createAnilistClient({intervalMs:0,fetcher:async()=>{count++;return response()}})
    for(let i=0;i<2;i++)await assert.rejects(client.request('list',{},normalizePage),e=>e.status===502&&!e.message.includes('internal secret'))
    assert.equal(count,2)
  }
  const unavailable=createAnilistClient({fetcher:async()=>{throw new TypeError('private network details')}})
  await assert.rejects(unavailable.request('list',{},normalizePage),e=>e.status===503&&!e.message.includes('private'))
  const timeout=createAnilistClient({fetcher:async()=>{throw new DOMException('private','TimeoutError')}})
  await assert.rejects(timeout.request('list',{},normalizePage),e=>e.status===504)
})
test('AniList transport (mock): 429 y GraphQL 429 bloquean globalmente hasta Retry-After',async()=>{
  for(const status of [429,200]){
    let clock=0,count=0;const client=createAnilistClient({intervalMs:0,now:()=>clock,fetcher:async()=>{count++;return count===1?Response.json({errors:[{status:429}]},{status,headers:{'Retry-After':'60'}}):page()}})
    await assert.rejects(client.request('list',{page:1},normalizePage),e=>e.status===429&&e.retryAfter===60)
    await assert.rejects(client.request('list',{page:2},normalizePage),e=>e.status===429);assert.equal(count,1)
    clock=60001;await client.request('list',{page:2},normalizePage);assert.equal(count,2)
  }
})
test('AniList transport (mock): máximo 28 inicios por ventana, una llamada concurrente y cola acotada',async()=>{
  let clock=0,count=0,active=0,peak=0
  const client=createAnilistClient({intervalMs:0,maxPending:40,now:()=>clock,fetcher:async()=>{count++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;return page()}})
  await Promise.all(Array.from({length:28},(_,i)=>client.request('list',{page:i},normalizePage)))
  await assert.rejects(client.request('list',{page:29},normalizePage),e=>e.status===429);assert.equal(count,28);assert.equal(peak,1)
  clock=60001;await client.request('list',{page:29},normalizePage)
  let release;const blocked=createAnilistClient({maxPending:1,fetcher:()=>new Promise(r=>{release=()=>r(page())})})
  const first=blocked.request('list',{page:1},normalizePage);await Promise.resolve()
  await assert.rejects(blocked.request('list',{page:2},normalizePage),e=>e.status===503);release();await first
})
test('AniList HTTP (mock upstream): filtros validados, sin GraphQL arbitrario y métodos restringidos',async context=>{
  let count=0;const client=createAnilistClient({intervalMs:0,fetcher:async()=>{count++;return page()}})
  const app=createApp({config:loadConfig({NODE_ENV:'test'}),animeService:createAnilistService(client)})
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');context.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}))
  const base=`http://127.0.0.1:${server.address().port}/api/v1`
  for(const path of ['/anime?page=101','/anime?genre=1','/anime?q=a&q=b','/anime?query=mutation','/anime/season?year=9999','/anime/not-an-id','/anime/genres?x=1'])assert.equal((await fetch(base+path)).status,400)
  assert.equal(count,0)
  assert.equal((await fetch(base+'/anime',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"query":"mutation"}'})).status,405)
  const r=await fetch(base+'/anime?q=Naruto&genre=Action&status=complete&order=score&page=2');assert.equal(r.status,200);assert.equal((await r.json()).meta.source,'anilist')
  const boundary=await (await fetch(base+'/anime?page=100')).json();assert.equal(boundary.data.hasNext,false)
})
test('AniList HTTP (mock upstream): Retry-After público sin trazas de GraphQL',async context=>{
  const client=createAnilistClient({fetcher:async()=>Response.json({errors:[{status:429,message:'private'}]},{headers:{'Retry-After':'45'}})})
  const server=createApp({config:loadConfig({NODE_ENV:'test'}),animeService:createAnilistService(client)}).listen(0,'127.0.0.1');await once(server,'listening');context.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}))
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/anime`);assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'45');assert.ok(!(await r.text()).includes('private'))
})
