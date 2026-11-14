import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createClient, createRateGate, fetchJSON, requireList, safeImage, wait } from '../src/services/http.js'
import { normalizeAnime } from '../src/services/jikan.js'

test('normaliza propiedades ausentes sin inventar datos reales', () => {
  const item = normalizeAnime({ mal_id: 1, title: 'Anime real', score: null, images: null, genres: null })
  assert.equal(item.title, 'Anime real')
  assert.equal(item.image, null)
  assert.equal(item.score, null)
  assert.equal(item.source, 'jikan')
  assert.match(item.description, /no disponible/)
  assert.throws(() => normalizeAnime({ title: 'Sin id' }), ApiError)
  assert.throws(() => requireList({ data: [] }), ApiError)
  assert.equal(safeImage('javascript:alert(1)'), null)
})

test('HTTP 404 no se reintenta; JSON incorrecto se informa', async () => {
  let calls = 0
  await assert.rejects(fetchJSON('https://test.invalid', { fetcher: async () => { calls++; return new Response('', { status: 404 }) } }), (error) => error.status === 404)
  assert.equal(calls, 1)
  await assert.rejects(fetchJSON('https://test.invalid', { fetcher: async () => new Response('not json') }), /JSON inválida/)
})

test('429 permite un único reintento y respeta Retry-After largo', async () => {
  let calls = 0
  const result = await fetchJSON('https://test.invalid', { fetcher: async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '0' } }) : Response.json({ data: [] }) })
  assert.deepEqual(result, { data: [] })
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(fetchJSON('https://test.invalid', { fetcher: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }) } }), (error) => error.status === 429)
  assert.equal(calls, 1)
})

test('503 y desconexión agotan como máximo dos intentos', async () => {
  let calls = 0
  await assert.rejects(fetchJSON('https://test.invalid', { fetcher: async () => { calls++; return new Response('', { status: 503 }) } }), /503/)
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(fetchJSON('https://test.invalid', { fetcher: async () => { calls++; throw new TypeError('offline') } }), /conectar/)
  assert.equal(calls, 2)
})

test('deduplica consumidores y reutiliza caché', async () => {
  let calls = 0
  const get = createClient({ fetcher: async () => { calls++; await wait(20); return Response.json({ data: [1] }) } })
  const [first, second] = await Promise.all([get('/shared'), get('/shared')])
  assert.deepEqual(first, second)
  await get('/shared')
  assert.equal(calls, 1)
})

test('una respuesta con esquema inválido no queda en caché al reintentar', async () => {
  let calls = 0
  const get = createClient({ fetcher: async () => Response.json(++calls === 1 ? { unexpected: true } : []) })
  await assert.rejects(get('/schema', { transform: requireList }), /formato/)
  assert.deepEqual(await get('/schema', { transform: requireList }), [])
  assert.equal(calls, 2)
})

test('cancelar un consumidor no cancela al otro; StrictMode reutiliza transporte', async () => {
  let calls = 0
  const get = createClient({ fetcher: async (_url, { signal }) => { calls++; await wait(25, signal); return Response.json([1]) } })
  const first = new AbortController()
  const canceled = get('/shared', { signal: first.signal })
  const rejected = assert.rejects(canceled, { name: 'AbortError' })
  first.abort()
  const second = get('/shared')
  await rejected
  assert.deepEqual(await second, [1])
  assert.equal(calls, 1)
})

test('cancelar el último consumidor aborta la petición y no envenena caché', async () => {
  let aborted = false
  const get = createClient({ fetcher: async (_url, { signal }) => {
    try { await wait(100, signal); return Response.json([]) } catch (error) { aborted = true; throw error }
  } })
  const controller = new AbortController()
  const pending = get('/abort', { signal: controller.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  controller.abort()
  await rejected
  await wait(10)
  assert.equal(aborted, true)
  assert.deepEqual(await get('/abort'), [])
})

test('cola limita inicios y permite cancelar solicitudes en espera', async () => {
  const gate = createRateGate(30)
  await gate()
  const start = Date.now()
  await gate()
  assert.ok(Date.now() - start >= 20)
  const controller = new AbortController()
  const pending = gate(controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})
