import HttpError from '../utils/HttpError.js'
const bad = () => { throw new HttpError(502,'ANILIST_INVALID_RESPONSE','AniList devolvió datos que no se pudieron interpretar.') }
const text = (v,fallback='') => typeof v==='string'&&v.trim()?v.trim():fallback
const image = v => typeof v==='string'&&v.startsWith('https://')?v:null
// Never inject upstream HTML. React also renders this as text, without innerHTML.
export const plainDescription = value => text(value,'Sinopsis no disponible en AniList.').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m])).slice(0,10000)
export function normalizeAnime(item) {
  if(!item||!Number.isSafeInteger(item.id)||item.id<1)bad()
  const titles={romaji:text(item.title?.romaji),english:text(item.title?.english),native:text(item.title?.native)}
  const title=titles.romaji||titles.english||titles.native||'Título no disponible'
  const genres=Array.isArray(item.genres)?item.genres.filter(g=>typeof g==='string'):[]
  const states={RELEASING:['airing','En emisión'],FINISHED:['complete','Finalizado'],NOT_YET_RELEASED:['upcoming','Próximamente'],CANCELLED:['cancelled','Cancelado'],HIATUS:['hiatus','En pausa']}
  const [statusCode,status]=states[item.status]??['','Estado no disponible']
  return {id:item.id,source:'anilist',title,titles,image:image(item.coverImage?.large),imageAlt:`Portada de ${title}`,banner:image(item.bannerImage),
    description:plainDescription(item.description),genre:genres.join(' · ')||'Género no disponible',genreIds:genres,
    score:Number.isFinite(item.averageScore)&&item.averageScore>0&&item.averageScore<=100?item.averageScore/10:null,
    popularity:Number.isSafeInteger(item.popularity)&&item.popularity>0?item.popularity:null,statusCode,status,
    format:text(item.format,'Formato no disponible'),episodes:Number.isInteger(item.episodes)?item.episodes:null,
    season:[text(item.season),Number.isInteger(item.seasonYear)?item.seasonYear:''].filter(Boolean).join(' · ')||'Temporada no disponible',
    startDate:item.startDate?{year:item.startDate.year??null,month:item.startDate.month??null,day:item.startDate.day??null}:null}
}
export function normalizePage(data) {
  if(!Array.isArray(data?.Page?.media)||typeof data.Page.pageInfo?.hasNextPage!=='boolean')bad()
  return {items:[...new Map(data.Page.media.map(m=>{const anime=normalizeAnime(m);return [anime.id,anime]})).values()],hasNext:data.Page.pageInfo.hasNextPage}
}
export function normalizeDetails(data) {
  if(data?.Media===null)throw new HttpError(404,'ANIME_NOT_FOUND','El anime solicitado no existe en AniList.')
  const item=data?.Media,anime=normalizeAnime(item)
  return {...anime,characters:(item.characters?.nodes??[]).slice(0,6).map(c=>({id:c.id,name:text(c.name?.full,'Personaje sin nombre'),image:image(c.image?.medium)})),
    related:(item.relations?.edges??[]).filter(e=>e.node?.type==='ANIME').slice(0,12).map(e=>({id:e.node.id,title:text(e.node.title?.romaji,text(e.node.title?.english,text(e.node.title?.native,'Anime relacionado'))),image:image(e.node.coverImage?.large),relation:text(e.relationType),season:e.node.season??null,year:e.node.seasonYear??null}))}
}
export function normalizeGenres(data) {
  if(!Array.isArray(data?.GenreCollection)||data.GenreCollection.some(g=>typeof g!=='string'))bad()
  return data.GenreCollection.filter(g=>g!=='Hentai').map(name=>({id:name,name,description:'Explorar animes de este género',icon:'sparkles'}))
}
