import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnilistClient } from '../src/services/anilistClient.js'
import { normalizeDetails } from '../src/services/anilistAdapter.js'

const run = fetcher => createAnilistClient({ intervalMs: 0, fetcher }).request('detail', { id: 1 }, normalizeDetails)
const errorIs = (status, code) => e => e.status === status && e.code === code && !e.message.includes('private')
for (const phase of ['fetch', 'body']) {
  for (const [error, status] of [[new DOMException('private', 'TimeoutError'), 504], [new TypeError('private transport'), 503]]) {
    test(`${phase} failure ${error.name} retains classification`, async () => {
      await assert.rejects(run(async () => {
        if (phase === 'fetch') throw error
        return { ok: true, status: 200, headers: new Headers(), json: async () => { throw error } }
      }), errorIs(status, 'ANILIST_UNAVAILABLE'))
    })
  }
}
test('body abort after headers uses the same timeout signal and releases pending request', async () => {
  let calls = 0
  const client = createAnilistClient({ intervalMs: 0, timeoutMs: 5, fetcher: async (_url, { signal }) => {
    calls++
    return { ok: true, status: 200, headers: new Headers(), json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('private', 'AbortError')), { once: true })
    }) }
  } })
  // AbortSignal.timeout is unref'ed; this test-only timer keeps Node alive.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (let i = 0; i < 2; i++) await assert.rejects(client.request('detail', {}, normalizeDetails), errorIs(504, 'ANILIST_UNAVAILABLE'))
    assert.equal(calls, 2)
  } finally { clearInterval(keepAlive) }
})
for (const body of [null, [], 'text', {}, { errors: null }, { errors: [null] }, { data: [] }, { data: null }, { data: {}, errors: {} }]) {
  test('rejects malformed GraphQL envelope ' + JSON.stringify(body), async () => {
    await assert.rejects(run(async () => Response.json(body)), errorIs(502, 'ANILIST_INVALID_RESPONSE'))
  })
}
test('invalid JSON, HTTP failure and GraphQL error remain distinct', async () => {
  await assert.rejects(run(async () => new Response('invalid')), errorIs(502, 'ANILIST_INVALID_RESPONSE'))
  await assert.rejects(run(async () => new Response('private', { status: 500 })), errorIs(502, 'ANILIST_HTTP_ERROR'))
  await assert.rejects(run(async () => Response.json({ errors: [{ message: 'private' }] })), errorIs(502, 'ANILIST_GRAPHQL_ERROR'))
})
const character = { id: 2, name: { full: 'Character' }, image: null }
const relation = { relationType: 'SEQUEL', node: { id: 3, type: 'ANIME', title: { romaji: 'Related' }, coverImage: null, season: null, seasonYear: null } }
test('valid detail and optional missing connections retain normalized contract', async () => {
  const data = { Media: { id: 1, characters: { nodes: [character] }, relations: { edges: [relation, { ...relation, node: { ...relation.node, id: 4, type: 'MANGA' } }] } } }
  const result = await run(async () => Response.json({ data }))
  assert.deepEqual(result.characters, [{ id: 2, name: 'Character', image: null }])
  assert.equal(result.related.length, 1)
  assert.equal(result.related[0].title, 'Related')
  assert.deepEqual(normalizeDetails({ Media: { id: 1 } }).characters, [])
})
for (const patch of [
  { characters: [] }, { characters: {} }, { characters: { nodes: {} } },
  { characters: { nodes: [null] } }, { characters: { nodes: [{ ...character, id: 0 }] } },
  { characters: { nodes: [{ ...character, name: {} }] } }, { characters: { nodes: [{ ...character, image: [] }] } },
  { relations: [] }, { relations: { edges: {} } }, { relations: { edges: [null] } },
  { relations: { edges: [{ node: null }] } }, { relations: { edges: [{ ...relation, node: { ...relation.node, id: '3' } }] } },
  { relations: { edges: [{ ...relation, node: { ...relation.node, title: {} } }] } },
  { relations: { edges: [{ ...relation, node: { ...relation.node, seasonYear: '2026' } }] } },
]) test('rejects malformed secondary detail ' + JSON.stringify(patch), () => {
  assert.throws(() => normalizeDetails({ Media: { id: 1, ...patch } }), errorIs(502, 'ANILIST_INVALID_RESPONSE'))
})
