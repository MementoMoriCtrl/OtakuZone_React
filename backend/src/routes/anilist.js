import { Router } from 'express'
import { validate } from '../middlewares/validate.js'
import { emptyQuery } from '../validators/catalog.js'
import { animeQuery,seasonQuery,animeId } from '../validators/anilist.js'
import { createAnilistController } from '../controllers/anilistController.js'
import { methodNotAllowed } from '../middlewares/errors.js'
export function createAnilistRoutes(service) {
  const router=Router(),c=createAnilistController(service)
  router.get('/anime',validate(animeQuery,'query'),c.search)
  router.get('/anime/popular',validate(emptyQuery,'query'),c.popular)
  router.get('/anime/season',validate(seasonQuery,'query'),c.season)
  router.get('/anime/genres',validate(emptyQuery,'query'),c.genres)
  router.get('/anime/:id',validate(emptyQuery,'query'),validate(animeId,'params'),c.detail)
  for(const path of ['/anime','/anime/popular','/anime/season','/anime/genres','/anime/:id'])router.all(path,methodNotAllowed)
  router.use((error,_req,res,next)=>{if(error.status===429&&Number.isFinite(error.retryAfter))res.set('Retry-After',String(error.retryAfter));next(error)})
  return router
}
