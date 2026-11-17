import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export function loadEnvironment() {
  // Production uses only the hosting environment, never a developer's .env.
  if (process.env.NODE_ENV === 'production') return
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })
}
