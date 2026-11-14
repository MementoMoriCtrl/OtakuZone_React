import test from 'node:test'
import assert from 'node:assert/strict'
import { favoriteKey,sanitizeFavorites } from '../src/domain/favorites.js'
import { createFavoritesStore } from '../src/services/favoritesStore.js'
import { FAVORITES_KEY } from '../src/services/localRepository.js'
import { getCatalogDetails } from '../src/services/animeCatalog.js'
import { readCatalogParams } from '../src/domain/catalog.js'
test('favoritos: AniList, Jikan heredado y demo conservan namespaces e historial v1',async()=>{
  const old={id:1,source:'jikan',title:'Favorito anterior'},newAnime={id:1,source:'anilist',title:'Ficha AniList de prueba'}
  const memory=new Map([[FAVORITES_KEY,JSON.stringify({version:1,items:[old]})]])
  const store=createFavoritesStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)})
  store.toggle(newAnime);assert.equal(store.getSnapshot().items.length,2)
  assert.notEqual(favoriteKey(old),favoriteKey(newAnime))
  assert.equal(JSON.parse(memory.get(FAVORITES_KEY)).items[0].source,'jikan')
  const details=await getCatalogDetails(old);assert.equal(details.id,1);assert.equal(details.legacy,true)
  assert.equal(sanitizeFavorites([newAnime,{...newAnime,id:'1'}]).length,1)
})
test('catálogo: géneros AniList nombrados, demo numérico y páginas limitadas',()=>{
  assert.equal(readCatalogParams(new URLSearchParams('genre=Slice+of+Life')).genre,'Slice of Life')
  assert.equal(readCatalogParams(new URLSearchParams('genre=1')).genre,'')
  assert.equal(readCatalogParams(new URLSearchParams('source=demo&genre=24')).genre,'24')
  assert.equal(readCatalogParams(new URLSearchParams('source=jikan')).source,'anilist')
  assert.equal(readCatalogParams(new URLSearchParams('page=101')).page,1)
})
