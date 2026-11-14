import type { Plugin } from 'vite'

const moduleId = 'virtual:vpt'
const resolvedModuleId = `\0${moduleId}`

/** Supplies application declarations whose configuration factories remain unevaluated. */
export function createApiModulePlugin(): Plugin {
    return {
        name: 'vpt:api-module',
        resolveId(id) {
            if (id === moduleId) {
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
