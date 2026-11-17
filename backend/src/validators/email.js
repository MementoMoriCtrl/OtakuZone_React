import { z } from 'zod'
import { normalizeAsciiEmail } from '../domain/emailPolicy.js'

export const emailSchema = z.string().transform((value, context) => {
  try { return normalizeAsciiEmail(value) }
  catch {
    context.addIssue({ code: 'custom', message: 'Correo ASCII no válido.' })
    return z.NEVER
  }
}).pipe(z.string().max(254).email())

// Reuse at non-HTTP boundaries as well (services, repositories and operator CLI).
export const normalizeEmail = value => emailSchema.parse(value)
