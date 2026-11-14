import { success } from '../utils/responses.js'
import { clearSessionCookie, cookieOptions, readSessionCookie } from '../middlewares/auth.js'

export function createAuthController(service, config) {
  const setSession = (response, result) => response.cookie(config.cookieName, result.token, { ...cookieOptions(config), maxAge: config.ttl * 1000 })
  return {
    async register(request, response) {
      const result = await service.register(request.validated.body)
      setSession(response, result)
      return response.status(201).json({ success: true, data: result.data })
    },
    async login(request, response) {
      const result = await service.login(request.validated.body)
      setSession(response, result)
      return success(response, result.data)
    },
    async session(request, response) {
      const token = readSessionCookie(request, config)
      if (!token) return success(response, { user: null, csrfToken: null, expiresAt: null })
      try {
        const auth = await service.authenticate(token)
        return success(response, { user: auth.user, csrfToken: auth.csrfToken, expiresAt: auth.expiresAt })
      } catch (error) {
        if (error.status !== 401) throw error
        clearSessionCookie(response, config)
        return success(response, { user: null, csrfToken: null, expiresAt: null })
      }
    },
    me: (request, response) => success(response, request.auth.user),
    async update(request, response) { return success(response, await service.updateProfile(request.auth, request.validated.body)) },
    async logout(request, response) {
      await service.logout(request.auth)
      clearSessionCookie(response, config)
      return success(response, null)
    },
    async overview(_request, response) { return success(response, await service.overview()) },
  }
}
