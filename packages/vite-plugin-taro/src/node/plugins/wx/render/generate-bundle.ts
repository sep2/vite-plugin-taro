import type { Rolldown } from 'vite'
import { createTransport } from './transport/create-transport.ts'

export function generateBundle(bundle: Rolldown.OutputBundle) {
    return [createTransport(bundle)]
}
