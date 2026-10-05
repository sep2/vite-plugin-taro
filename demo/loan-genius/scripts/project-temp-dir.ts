import { mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

const directory = path.resolve(import.meta.dirname, '../tmp')
mkdirSync(directory, { recursive: true })

/** Project-local scratch root; tests own and remove only their individual files beneath it. */
export const projectTempDir = realpathSync(directory)
