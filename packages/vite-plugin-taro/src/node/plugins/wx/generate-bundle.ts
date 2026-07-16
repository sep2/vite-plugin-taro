import type { Rolldown } from 'vite'
import { createTransport } from './transport/create-transport.ts'

/** Creates native files from the final bundle. */
export function generateBundle(bundle: Rolldown.OutputBundle): Rolldown.EmittedFile[] {
    return [createTransport(bundle)]
}
