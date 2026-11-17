import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveApiUrls, validateProductionApi } from '../src/config/api.js'

// Reserved test host only; never deployment configuration.
const environment = (url) => Object.fromEntries(['VITE_AUTH_API_URL', 'VITE_OTAKUZONE_API_URL', 'VITE_ANIME_API_URL'].map(key => [key, url]))
test('producción rechaza API ausente, local, HTTP y bases incoherentes', () => {
  for (const url of [undefined, '', 'http://api.test/api/v1', 'https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://api.test/graphql', 'https://api.test/api/v1?token=private']) {
    assert.throws(() => validateProductionApi(environment(url)), error => !error.message.includes('private'))
  }
  assert.throws(() => validateProductionApi({ ...environment('https://api.test/api/v1'), VITE_ANIME_API_URL: 'https://other.test/api/v1' }), /misma API/)
  assert.doesNotThrow(() => validateProductionApi(environment('https://api.test/api/v1/')))
})
test('desarrollo conserva URLs locales; producción nunca usa fallback local', () => {
  assert.equal(resolveApiUrls().auth, 'http://localhost:4000/api/v1')
  assert.throws(() => resolveApiUrls({ PROD: true, MODE: 'production' }))
  assert.equal(resolveApiUrls({ PROD: true, MODE: 'local-preview' }).auth, 'http://localhost:4000/api/v1')
})
