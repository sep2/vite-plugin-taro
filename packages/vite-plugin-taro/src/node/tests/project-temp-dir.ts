import { mkdirSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../../../../../tmp/', import.meta.url))
mkdirSync(directory, { recursive: true })

/** Shared scratch root; each test owns and removes only its own files beneath it. */
export const projectTempDir = realpathSync(directory)
