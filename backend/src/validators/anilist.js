import { z } from 'zod'
export const animeQuery=z.object({q:z.string().trim().max(150).optional(),genre:z.string().trim().min(1).max(50).regex(/^[A-Za-z][A-Za-z -]*$/).optional(),status:z.enum(['airing','complete','upcoming']).optional(),order:z.enum(['score','popularity']).optional(),page:z.coerce.number().int().min(1).max(100).default(1)}).strict()
export const seasonQuery=z.object({season:z.enum(['WINTER','SPRING','SUMMER','FALL']).optional(),year:z.coerce.number().int().min(1940).max(2100).optional(),page:z.coerce.number().int().min(1).max(100).default(1)}).strict()
export const animeId=z.object({id:z.string().regex(/^[1-9]\d{0,8}$/)}).strict()
