import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import HttpError from '../utils/HttpError.js'

const unauthorized = () => new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
const roles = { cliente: 'CLIENTE', administrador: 'ADMIN' }
export function publicUser(row) {
  if (!row || !roles[row.roleCode]) throw unauthorized()
  return { id: String(row.id), name: row.name, email: row.email, bio: row.bio, role: roles[row.roleCode] }
}

export function createAuthService(repository, config) {
  const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), config.rounds)
  const sessionRecord = () => ({ id: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + config.ttl * 1000) })
  const csrf = (id) => createHmac('sha256', config.secret).update(`csrf:${id}`).digest('base64url')
  const issued = (row, session) => ({
    token: jwt.sign({ sid: session.id }, config.secret, { algorithm: 'HS256', subject: String(row.id), expiresIn: config.ttl, issuer: config.issuer, audience: config.audience }),
    data: { user: publicUser(row), csrfToken: csrf(session.id), expiresAt: session.expiresAt.toISOString() },
  })
  return {
    async register(input) {
      const passwordHash = await bcrypt.hash(input.password, config.rounds)
      const session = sessionRecord()
      try { return issued(await repository.registerWithSession({ name: input.name, email: input.email, passwordHash }, session), session) }
      catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'REGISTRATION_UNAVAILABLE', 'No se pudo completar el registro con esos datos. Revisa los datos o inicia sesión si ya tienes una cuenta.')
        throw error
      }
    },
    async login(input) {
      const row = await repository.findByEmail(input.email)
      const matches = await bcrypt.compare(input.password, row?.passwordHash || await dummyHash)
      if (!matches || !row || row.state !== 'activo') throw new HttpError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.')
      const session = sessionRecord()
      await repository.startSession(row.id, session)
      return issued(row, session)
    },
    async authenticate(token) {
      let payload
      try {
        payload = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: config.issuer, audience: config.audience, maxAge: config.ttl })
        if (typeof payload !== 'object' || !/^[1-9]\d*$/.test(payload.sub) || !/^[a-f0-9]{64}$/.test(payload.sid) || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) throw unauthorized()
      } catch { throw unauthorized() }
      const row = await repository.findSession(payload.sid, payload.sub)
      if (!row) throw unauthorized()
      return { user: publicUser(row), sessionId: payload.sid, csrfToken: csrf(payload.sid), expiresAt: row.expiresAt.toISOString() }
    },
    checkCsrf(id, supplied) {
      const expected = Buffer.from(csrf(id))
      const actual = Buffer.from(typeof supplied === 'string' ? supplied : '')
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(403, 'CSRF_REJECTED', 'La solicitud no pudo verificarse. Recarga la página e inténtalo de nuevo.')
    },
    logout: (auth) => repository.revokeSession(auth.sessionId, auth.user.id),
    async updateProfile(auth, input) {
      const row = await repository.updateProfile(auth.user.id, input)
      if (!row) throw unauthorized()
      return publicUser(row)
    },
    overview: () => repository.overview(),
  }
}
