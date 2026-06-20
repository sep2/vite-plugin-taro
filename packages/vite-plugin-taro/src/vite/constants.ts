import { createRequire } from 'node:module'

export const isProd = process.env.NODE_ENV === 'production'

export const nodeRequire = createRequire(import.meta.url)
