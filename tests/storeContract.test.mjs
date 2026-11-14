import test from 'node:test'
import assert from 'node:assert/strict'
import { readStoreCollection } from '../src/services/storeContract.js'

test('el mismo servicio admite Express y JSON Server sin mezclar respuestas', () => {
  const products = [{ id: 'polo', name: 'Polo demo' }]
  assert.deepEqual(readStoreCollection(products), products)
  assert.deepEqual(readStoreCollection({ success: true, data: products, meta: { source: 'demo' } }), products)
  assert.throws(() => readStoreCollection({ success: false, data: products }))
  assert.throws(() => readStoreCollection({ success: true, data: {} }))
})
