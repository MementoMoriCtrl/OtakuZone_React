import { ApiError,createClient } from './http.js'
import { resolveApiUrls } from '../config/api.js'
export const ANIME_API_URL=resolveApiUrls(import.meta.env).anime
// The Express service owns upstream scheduling/cache. Do not retry its 429s in a loop.
const get=createClient({ttl:15000,fetcher:async(url,options)=>{
  const response=await fetch(url,options)
  // fetchJSON respects a long Retry-After and offers the existing manual retry UI.
  if(response.status===429&&!response.headers.get('Retry-After'))return new Response(await response.text(),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60'}})
  return response
}})
async function request(path,options){
  return get(ANIME_API_URL+path,{...options,transform:body=>{
    if(body?.success!==true||body.meta?.source!=='anilist'||body.data==null)throw new ApiError('No se pudo cargar el catálogo. Inténtalo de nuevo.')
    return body.data
  }})
}
export const getPopularAnime=options=>request('/anime/popular',options)
export const getCurrentAnime=options=>request('/anime/season',options)
export const getAnimeGenres=options=>request('/anime/genres',options)
export const getAnimeDetails=(id,options)=>request(`/anime/${encodeURIComponent(id)}`,options)
export function searchAnime(filters={},options){
  const params=new URLSearchParams({page:String(filters.page??1),order:filters.order==='score'?'score':'popularity'})
  if(filters.query?.trim())params.set('q',filters.query.trim().slice(0,150))
  if(filters.genre)params.set('genre',filters.genre)
  if(filters.status)params.set('status',filters.status)
  return request(`/anime?${params}`,options)
}
