import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

test('shop promotions render real fields, safe destinations and independent resource states', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: Component } = await server.ssrLoadModule('/src/components/shop/ShopPromotions.jsx')
    const promotion = { id: 'fixture', title: 'Título <real>', description: 'Descripción recibida', to: '/tienda' }
    const render = resource => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, { resource })))
    const base = { loading: false, error: null, retry() {}, data: [promotion, { ...promotion, id: 'anime', to: '/animes' }] }
    const html = render(base)
    assert.match(html, /href="\/tienda"/)
    assert.match(html, /href="\/animes"/)
    assert.match(html, /Título &lt;real&gt;/)
    assert.match(html, /Descripción recibida/)
    assert.doesNotMatch(html, /descuento|%|<img/)
    assert.match(render({ ...base, loading: true }), /Cargando/)
    assert.doesNotMatch(render({ ...base, loading: true }), /href=/)
    const failed = render({ ...base, error: 'Error de promociones' })
    assert.match(failed, /role="alert"/)
    assert.match(failed, /Reintentar/)
    assert.doesNotMatch(failed, /href=/)
    assert.match(render({ ...base, data: [] }), /No hay promociones disponibles/)
    for (const invalid of [null, { ...promotion, title: ' ' }, { ...promotion, description: '' }, { ...promotion, id: '' }, { ...promotion, to: 'https://example.invalid' }]) {
      assert.match(render({ ...base, data: [invalid] }), /No hay promociones disponibles/)
    }
    assert.equal((render({ ...base, data: [promotion, promotion] }).match(/<article/g) ?? []).length, 1)
  } finally { await server.close() }
})
