import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRegistration, validateLogin } from '../src/domain/validation.js'

test('formularios conservan correos ASCII válidos y rechazan Unicode sin modificar el diseño', () => {
  for (const email of ['USER@example.com', 'user@example.com', ' user@example.com ']) {
    const values = { name: 'User Fixture', email, password: 'Clave12345', confirmPassword: 'Clave12345' }
    assert.equal(validateRegistration(values).email, undefined)
    assert.equal(validateLogin(values).email, undefined)
  }
  for (const email of ['josé@example.com', 'user@éxample.com', '用户@example.com', 'user name@example.com', 'invalid', '\u00a0user@example.com', '\u212Auser@example.com']) {
    assert.ok(validateRegistration({ name: 'User Fixture', email, password: 'Clave12345', confirmPassword: 'Clave12345' }).email)
    assert.ok(validateLogin({ email, password: 'Clave12345' }).email)
  }
})
