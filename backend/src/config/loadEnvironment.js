import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export function loadEnvironment() {
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })
}
