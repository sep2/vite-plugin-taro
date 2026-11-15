import type { Plugin } from 'vite'
import { apiModuleId } from './api-module-id.ts'

const resolvedModuleId = `\0${apiModuleId}`

/** Supplies application declarations whose configuration factories remain unevaluated. */
export function createApiModulePlugin(): Plugin {
    return {
        name: 'vpt:api-module',
        resolveId(id) {
            if (id === apiModuleId) {
                return resolvedModuleId
            }
        },
        load(id) {
            if (id === resolvedModuleId) {
                return 'export function defineVptPage(factory) {}'
            }
        }
    }
}
