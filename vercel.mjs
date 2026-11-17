import { createVercelConfig } from './scripts/vercel-config.mjs'

// Programmatic configuration: static vercel.json cannot interpolate env origins.
export const config = createVercelConfig()
