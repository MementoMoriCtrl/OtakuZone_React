// Comprueba servicios REALES. Nunca sustituye respuestas ni usa fixtures.
import assert from 'node:assert/strict'
import { getPopularAnime, getCurrentAnime, getAnimeGenres, getAnimeDetails, searchAnime } from '../src/services/jikan.js'

let failed = false
async function check(label, callback) {
  try { await callback(); console.log(`PASS ${label}`) }
  catch (error) { failed = true; console.error(`FAIL ${label}: ${error.message}`) }
}
const local = process.env.OTAKUZONE_API_URL ?? 'http://127.0.0.1:3001'
await check('JSON Server: productos, categorías y promociones', async () => {
  for (const name of ['products', 'categories', 'promotions']) {
    const url = `${local}/${name}`
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200, url)
    const data = await response.json()
    assert.ok(Array.isArray(data))
    assert.ok(data.length >= (name === 'products' ? 10 : 1))
    console.log(`${url} → HTTP 200, ${data.length} registros`)
  }
})
let popular
await check('Jikan: populares', async () => {
  popular = await getPopularAnime({ signal: AbortSignal.timeout(35000) })
  assert.ok(popular.items.length)
  console.log(`https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=4&sfw=true → ${popular.items.length} registros reales`)
})
// Si Jikan no es accesible, informar el fallo sin multiplicar solicitudes.
if (popular) {
  await check('Jikan: temporada actual', async () => assert.ok((await getCurrentAnime()).items.length))
  await check('Jikan: géneros', async () => assert.ok((await getAnimeGenres()).length))
  await check('Jikan: búsqueda Naruto', async () => assert.ok((await searchAnime({ query: 'Naruto' })).items.length))
  await check('Jikan: detalles', async () => assert.equal((await getAnimeDetails(popular.items[0].id)).id, popular.items[0].id))
} else console.error('SKIP temporada, géneros, búsqueda y detalles: Jikan no respondió correctamente; no se afirma éxito.')
process.exitCode = failed ? 1 : 0
