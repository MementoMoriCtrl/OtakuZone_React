import { createAnilistClient } from './anilistClient.js'
import { normalizePage,normalizeDetails,normalizeGenres } from './anilistAdapter.js'
export function currentSeason(date=new Date()) {return {season:['WINTER','SPRING','SUMMER','FALL'][Math.floor(date.getUTCMonth()/3)],year:date.getUTCFullYear()}}
export function createAnilistService(client=createAnilistClient(),clock=()=>new Date()) {
  const list=q=>{
    const variables={page:q.page??1,perPage:q.perPage??12,sort:[q.order==='score'?'SCORE_DESC':'POPULARITY_DESC','ID']}
    if(q.q)variables.search=q.q
    if(q.genre)variables.genre=q.genre
    if(q.status)variables.status={airing:'RELEASING',complete:'FINISHED',upcoming:'NOT_YET_RELEASED'}[q.status]
    if(q.season)variables.season=q.season
    if(q.year)variables.year=q.year
    return client.request('list',variables,data=>{const page=normalizePage(data);return {...page,hasNext:page.hasNext&&variables.page<100}})
  }
  return { search:list,popular:()=>list({page:1,perPage:4}),season:q=>list({...currentSeason(clock()),...q}),genres:()=>client.request('genres',{},normalizeGenres),detail:id=>client.request('detail',{id:Number(id)},normalizeDetails) }
}
