import { success } from '../utils/responses.js'
export function createAnilistController(service) {
  const read=method=>async(req,res)=>success(res,await service[method](req.validated?.query),{source:'anilist'})
  return {search:read('search'),season:read('season'),popular:read('popular'),genres:read('genres'),detail:async(req,res)=>success(res,await service.detail(req.validated.params.id),{source:'anilist'})}
}
