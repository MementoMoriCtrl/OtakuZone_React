import HttpError from '../utils/HttpError.js'
import { anilistQueries } from './anilistQueries.js'
export const ANILIST_ENDPOINT='https://graphql.anilist.co'
export function createAnilistClient({fetcher=fetch,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),intervalMs=2200,timeoutMs=10000,ttlMs=60000,maxEntries=100,maxPending=8,maxQueueWaitMs=6000}={}) {
  const cache=new Map(),pending=new Map()
  let tail=Promise.resolve(),lastStart=-Infinity,blockedUntil=0,budget=28
  let starts=[]
  const limited=until=>{
    const seconds=Math.max(1,Math.ceil((until-now())/1000))
    const e=new HttpError(429,'ANILIST_RATE_LIMITED',`AniList limita las consultas. Espera ${seconds} segundos y vuelve a intentarlo.`)
    e.retryAfter=seconds;return e
  }
  const cooldown=res=>{
    const value=res.headers.get('Retry-After'),seconds=Number(value)
    const retry=value?(Number.isFinite(seconds)?now()+seconds*1000:Date.parse(value)):0
    const reset=Number(res.headers.get('X-RateLimit-Reset'))*1000
    blockedUntil=Math.max(blockedUntil,Number.isFinite(retry)?retry:0,Number.isFinite(reset)?reset:0,now()+1000)
    if(!value&&!reset)blockedUntil=Math.max(blockedUntil,now()+60000)
  }
  return {
    request(operation,variables,transform) {
      const query=anilistQueries[operation]
      if(!query)throw new Error('Operación AniList interna no admitida')
      const key=JSON.stringify([operation,variables]),hit=cache.get(key)
      if(hit&&hit.expires>now())return Promise.resolve(hit.data)
      cache.delete(key)
      if(pending.has(key))return pending.get(key)
      if(blockedUntil>now())return Promise.reject(limited(blockedUntil))
      if(pending.size>=maxPending)return Promise.reject(new HttpError(503,'ANILIST_BUSY','El catálogo tiene consultas en espera. Inténtalo de nuevo.'))
      const queuedAt=now()
      const task=tail.then(async()=>{
        if(now()-queuedAt>maxQueueWaitMs)throw new HttpError(503,'ANILIST_BUSY','El catálogo tiene consultas en espera. Inténtalo de nuevo.')
        starts=starts.filter(t=>t>now()-60000)
        const until=Math.max(lastStart+intervalMs,blockedUntil,starts.length>=budget?starts[0]+60000:0)
        if(blockedUntil>now()||until-now()>maxQueueWaitMs)throw limited(until)
        if(until>now())await pause(until-now())
        lastStart=now();starts.push(lastStart)
        let res
        try {res=await fetcher(ANILIST_ENDPOINT,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(timeoutMs)})}
        catch(e){throw new HttpError(e.name==='TimeoutError'?504:503,'ANILIST_UNAVAILABLE','No se pudo conectar con AniList. Inténtalo de nuevo. Esta respuesta no contiene datos demo.')}
        const headerLimit=Number(res.headers.get('X-RateLimit-Limit'))
        if(Number.isFinite(headerLimit)&&headerLimit>0)budget=Math.min(budget,headerLimit)
        if(res.status===429){cooldown(res);throw limited(blockedUntil)}
        if(!res.ok)throw new HttpError(502,'ANILIST_HTTP_ERROR','AniList no pudo completar la consulta. Inténtalo de nuevo.')
        let body
        try{body=await res.json()}catch{throw new HttpError(502,'ANILIST_INVALID_RESPONSE','AniList devolvió una respuesta no válida.')}
        if(Array.isArray(body.errors)&&body.errors.length){
          if(body.errors.some(e=>e.status===429)){cooldown(res);throw limited(blockedUntil)}
          if(body.errors.some(e=>e.status===404))throw new HttpError(404,'ANIME_NOT_FOUND','El anime solicitado no existe en AniList.')
          throw new HttpError(502,'ANILIST_GRAPHQL_ERROR','AniList no pudo interpretar la consulta. Inténtalo más tarde.')
        }
        if(res.headers.get('X-RateLimit-Remaining')==='0')cooldown(res)
        const data=transform(body.data)
        cache.set(key,{data,expires:now()+ttlMs})
        while(cache.size>maxEntries)cache.delete(cache.keys().next().value)
        return data
      })
      tail=task.catch(()=>{})
      const result=task.finally(()=>pending.delete(key));pending.set(key,result)
      return result
    },
  }
}
