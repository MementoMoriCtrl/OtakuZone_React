import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import express from 'express'
import { loadAuthConfig } from '../src/config/auth.js'
import { createAuthRoutes } from '../src/routes/auth.js'
import { errorHandler } from '../src/middlewares/errors.js'

for (const sameSite of ['none', undefined]) {
  test(`HTTP login cookie uses ${sameSite ?? 'default lax'} with production security attributes`, async context => {
    const origin = 'https://frontend.example.test'
    const auth = loadAuthConfig({
      NODE_ENV: 'production', JWT_SECRET: randomBytes(64).toString('hex'),
      CORS_ORIGINS: origin, ...(sameSite ? { AUTH_COOKIE_SAME_SITE: sameSite } : {}),
    })
    const token = randomBytes(32).toString('hex')
    let calls = 0
    const data = { user: { id: '1', role: 'CLIENTE' }, csrfToken: 'fixture', expiresAt: '2030-01-01T00:00:00.000Z' }
    const service = { login: async () => { calls++; return { token, data } } }
    const app = express()
    app.set('query parser', 'simple')
    app.use(express.json())
    app.use('/api/v1', createAuthRoutes(service, { auth, origins: [origin] }))
    app.use(errorHandler)
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-OtakuZone-CSRF': '1' },
      body: JSON.stringify({ email: 'fixture@example.test', password: 'fixture-only' }),
    })
    assert.equal(response.status, 200)
    assert.equal(calls, 1)
    const cookie = response.headers.get('set-cookie') ?? ''
    // Only booleans reach assertion diagnostics; never print the header or token.
    assert.equal(cookie.startsWith('__Host-otakuzone_session='), true, 'Expected production host-only cookie')
    assert.equal(cookie.split(';', 1)[0] === `${auth.cookieName}=${token}`, true, 'Expected simulated session cookie')
    for (const attribute of ['Secure', 'HttpOnly', 'Path=/', `SameSite=${sameSite === 'none' ? 'None' : 'Lax'}`]) {
      assert.equal(cookie.split(';').some(part => part.trim() === attribute), true, `Missing cookie attribute: ${attribute}`)
    }
    assert.equal(/;\s*Domain=/i.test(cookie), false, 'Host-only cookie must omit Domain')
    const body = await response.text()
    assert.equal(body.includes(token), false, 'Response body must omit session token')
    assert.deepEqual(JSON.parse(body), { success: true, data })
  })
}
