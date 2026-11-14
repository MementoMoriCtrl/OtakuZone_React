import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { parse } from 'dotenv'

const file = new URL('../.env', import.meta.url)
let text
try { text = await readFile(file, 'utf8') }
catch (error) { if (error.code !== 'ENOENT') throw error; text = await readFile(new URL('../.env.example', import.meta.url), 'utf8') }
if (parse(text).JWT_SECRET) {
  console.log('Ya existe un secreto local; no se reemplazó ni se mostró.')
} else {
  text = text.replace(/^JWT_SECRET=.*\r?\n?/m, '').trimEnd() + '\nJWT_SECRET=' + randomBytes(64).toString('base64url') + '\n'
  await writeFile(file, text)
  console.log('Secreto JWT generado en backend/.env, sin mostrar su valor.')
}
