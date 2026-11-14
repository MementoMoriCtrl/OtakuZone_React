import { z } from 'zod'

const name = z.string().trim().min(2).max(60).refine((value) => [...value].every((character) => character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127))
const email = z.string().trim().max(254).email().transform((value) => value.toLowerCase())
const password = z.string().min(8).refine((value) => Buffer.byteLength(value, 'utf8') <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value))
export const registerBody = z.object({ name, email, password }).strict()
export const loginBody = z.object({ email, password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72) }).strict()
export const profileBody = z.object({ name, bio: z.string().max(300) }).strict()
export const noBody = z.object({}).strict()
