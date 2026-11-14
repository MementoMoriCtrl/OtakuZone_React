import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnimeSearchParams, filterDemoAnime, readCatalogParams } from '../src/domain/catalog.js'
import { favoriteKey, favoritesReducer, sanitizeFavorites } from '../src/domain/favorites.js'
import { createFavoritesStore } from '../src/services/favoritesStore.js'
import { FAVORITES_KEY, PROFILE_KEY, readFavorites, readProfile, saveProfile } from '../src/services/localRepository.js'
import { validateProfile, validateRegistration, validateLogin } from '../src/domain/validation.js'

const anime = { id: 'demo-1', source: 'demo', title: 'Órbita Demo', genreIds: [24], statusCode: 'complete', score: 9, popularity: 2 }
const memoryStorage = () => {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('traduce filtros a parámetros AniList y orden correcto', () => {
  const params = buildAnimeSearchParams({ query: ' Naruto & amigos ', genre: 'Action', status: 'complete', order: 'score', page: 2 })
  assert.equal(params.get('q'), 'Naruto & amigos')
  assert.equal(params.get('status'), 'complete')
  assert.equal(params.get('genre'), 'Action')
  assert.equal(params.get('order'), 'score')
  assert.equal(buildAnimeSearchParams().get('order'), 'popularity')
  const invalid = readCatalogParams(new URLSearchParams('source=other&genre=-1&status=bad&order=bad&page=NaN'))
  assert.deepEqual(invalid, { source: 'anilist', query: '', genre: '', status: '', order: 'popularity', page: 1 })
})

test('demo: búsqueda con tildes, filtros combinados, puntuación y popularidad', () => {
  const items = [anime, { ...anime, id: 'demo-2', title: 'Otra órbita', genreIds: [1], statusCode: 'airing', popularity: 1, score: null }, { ...anime, id: 'demo-3', title: 'Jardín', score: 9.5, popularity: 3 }]
  assert.equal(filterDemoAnime(items, { query: 'orbita', genre: '24', status: 'complete' }).items.length, 1)
  assert.equal(filterDemoAnime(items, { status: 'upcoming' }).items.length, 0)
  assert.equal(filterDemoAnime(items, { order: 'score' }).items[0].id, 'demo-3')
  assert.equal(filterDemoAnime(items).items[0].id, 'demo-2')
  assert.equal(items[0].id, 'demo-1', 'no modifica el orden de la fuente')
  const many = Array.from({ length: 15 }, (_, index) => ({ ...anime, id: `demo-${index + 1}` }))
  assert.equal(filterDemoAnime(many).hasNext, true)
  assert.equal(filterDemoAnime(many, { page: 2 }).items.length, 3)
})

test('favoritos usan origen + id; deduplican y descartan entradas inválidas', () => {
  const real = { ...anime, id: 1, source: 'jikan' }
  const items = sanitizeFavorites([anime, anime, real, null, { ...anime, source: 'unknown' }])
  assert.equal(items.length, 2)
  assert.notEqual(favoriteKey(items[0]), favoriteKey(items[1]))
  let state = { items: [] }
  state = favoritesReducer(state, { type: 'toggle', anime })
  assert.equal(state.items.length, 1)
  state = favoritesReducer(state, { type: 'toggle', anime })
  assert.equal(state.items.length, 0)
})

test('almacén persiste, restaura y sincroniza favoritos sin duplicados', () => {
  const storage = memoryStorage()
  const store = createFavoritesStore(storage)
  let updates = 0
  const unsubscribe = store.subscribe(() => updates++)
  store.toggle(anime)
  assert.equal(readFavorites(storage).data.length, 1)
  assert.equal(createFavoritesStore(storage).getSnapshot().items.length, 1)
  storage.setItem(FAVORITES_KEY, JSON.stringify({ version: 1, items: [anime, anime] }))
  store.reload()
  assert.equal(store.getSnapshot().items.length, 1)
  assert.equal(updates, 2)
  unsubscribe()
  store.toggle(anime)
  assert.equal(updates, 2)
})

test('storage corrupto o bloqueado no rompe la sesión', () => {
  const storage = memoryStorage()
  storage.setItem(FAVORITES_KEY, 'invalid JSON')
  assert.ok(readFavorites(storage).error)
  storage.setItem(FAVORITES_KEY, JSON.stringify({ version: 99, items: [] }))
  assert.ok(readFavorites(storage).error)
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
  assert.match(saveProfile({ name: 'Demo', email: 'demo@example.test', bio: '' }, blocked), /guardar/)
  const store = createFavoritesStore(blocked)
  store.toggle(anime)
  assert.equal(store.getSnapshot().items.length, 1)
  assert.match(store.getSnapshot().error, /sesión/)
})

test('registro valida obligatorios, correo, contraseña y confirmación', () => {
  const valid = { name: 'Aiko Demo', email: 'aiko@example.test', password: 'Demo12345', confirmPassword: 'Demo12345' }
  assert.deepEqual(validateRegistration(valid), {})
  assert.equal(Object.keys(validateRegistration({})).length, 4)
  assert.ok(validateRegistration({ ...valid, email: 'correo inválido' }).email)
  assert.ok(validateRegistration({ ...valid, password: 'sinNumeros' }).password)
  assert.ok(validateRegistration({ ...valid, password: '12345678' }).password)
  assert.ok(validateRegistration({ ...valid, confirmPassword: 'Otra12345' }).confirmPassword)
  assert.ok(validateProfile({ name: ' ', email: 'bad', bio: 'a'.repeat(301) }).bio)
})

test('autenticación valida el límite UTF-8 de bcrypt y login obligatorio', () => {
  const password = 'Á1'.repeat(25)
  assert.ok(validateRegistration({ name: 'Aiko', email: 'aiko@example.test', password, confirmPassword: password }).password)
  assert.ok(validateLogin({ email: 'bad', password: '' }).email)
  assert.ok(validateLogin({ email: 'aiko@example.test', password: '' }).password)
  assert.deepEqual(validateLogin({ email: 'aiko@example.test', password: 'Clave12345' }), {})
})

test('perfil solo persiste los campos permitidos; nunca contraseñas', () => {
  const storage = memoryStorage()
  assert.equal(saveProfile({ name: ' Aiko ', email: ' aiko@example.test ', bio: ' Hola ', password: 'Demo12345', confirmPassword: 'Demo12345' }, storage), '')
  assert.deepEqual(readProfile(storage).data, { name: 'Aiko', email: 'aiko@example.test', bio: 'Hola' })
  assert.ok(!storage.getItem(PROFILE_KEY).includes('password'))
  assert.ok(!storage.getItem(PROFILE_KEY).includes('Demo12345'))
})
