import { mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const packageRoot = path.dirname(createRequire(import.meta.url).resolve('vite-plugin-taro/package.json'))
const directory = path.join(packageRoot, 'tmp')
mkdirSync(directory, { recursive: true })

/** Shared scratch root; each test owns and removes only its own files beneath it. */
export const projectTempDir = realpathSync(directory)
