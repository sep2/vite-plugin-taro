import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'rolldown'
import { normalizePath, parseSync } from 'vite'
import { apiModuleId } from '../api/api-module-id.ts'

export const pageEntryPrefix = '\0ps:page:'
const emptyId = '\0ps:empty'
const declarationPrefix = '\0ps:declaration:'

type PageModulesPlugin = Plugin & {
    hotUpdate(event: {
        file: string
        type: 'create' | 'update' | 'delete'
        modules: string[]
    }): Promise<string[] | undefined>
}

/** Selects page roots without changing how their ordinary imports are resolved. */
export async function createPageModulesPlugin(
    root: string,
    entryId: string,
    invalidate: (file: string) => void
): Promise<PageModulesPlugin> {
    const sourceDir = normalizePath(path.resolve(root, 'src'))
    // The manifest owns page membership. File events update individual routes after discovery.
    const routes = await discoverRoutes(sourceDir)

    return {
        name: 'ps:modules',
        buildStart() {
            this.addWatchFile(sourceDir)
        },
        async hotUpdate({ file, type, modules }) {
            if (modules.length > 0) {
                invalidate(file)
            }
            if (!isPageSource(file, sourceDir)) {
                return
            }

            const route = routeOf(file, sourceDir)
            const previous = routes.has(route)
            const candidate = type !== 'delete' && ((await importsPageApi(file)) ?? previous)
            if (candidate === previous) {
                return
            }
            if (candidate) {
                routes.add(route)
            } else {
                routes.delete(route)
            }
            if (modules.length === 0) {
                invalidate(file)
            }
            return [...modules, entryId]
        },
        resolveId(id, importer) {
            if (
                id === entryId ||
                id === emptyId ||
                id.startsWith(pageEntryPrefix) ||
                id.startsWith(declarationPrefix)
            ) {
                return id
            }
            if (id === apiModuleId && importer) {
                if (!isPageSource(importer, sourceDir)) {
                    return emptyId
                }
                return declarationPrefix + routeOf(importer, sourceDir)
            }
        },
        load(id) {
            if (id === entryId) {
                const imports = [...routes]
                    .sort()
                    .map((route) => `() => import(${JSON.stringify(pageEntryPrefix + route)})`)
                return `export default [${imports.join(',')}]`
            }
            if (id === emptyId) {
                return 'export function defineVptPage() {}'
            }
            if (id.startsWith(pageEntryPrefix)) {
                const route = id.slice(pageEntryPrefix.length)
                // A deletion invalidates both the page entry and the manifest.
                if (!routes.has(route)) {
                    return 'export default undefined;'
                }
                return `
                    import ${JSON.stringify(`${sourceDir}/${route}.tsx`)};
                    export { factory as default } from ${JSON.stringify(declarationPrefix + route)};
                `
            }
            if (id.startsWith(declarationPrefix)) {
                return `
                    export let factory;
                    export function defineVptPage(declare) {
                        if (factory !== undefined) {
                            throw new Error(${JSON.stringify(`Only one defineVptPage declaration is allowed for ${id.slice(declarationPrefix.length)}`)});
                        }
                        factory = declare;
                    }
                `
            }
        }
    }
}

async function discoverRoutes(sourceDir: string): Promise<Set<string>> {
    const files = await Array.fromAsync(
        glob('**/*.tsx', {
            cwd: sourceDir,
            exclude: ['**/node_modules'],
            withFileTypes: true
        })
    )
    const entries = await Promise.all(
        files
            .filter((file) => file.isFile())
            .map(async ({ parentPath, name }) => {
                const file = normalizePath(path.join(parentPath, name))
                return isPageSource(file, sourceDir) && (await importsPageApi(file))
                    ? routeOf(file, sourceDir)
                    : undefined
            })
    )
    return new Set(entries.filter((route) => route !== undefined))
}

function routeOf(file: string, sourceDir: string): string {
    return file.slice(sourceDir.length + 1, -'.tsx'.length)
}

function isPageSource(file: string, sourceDir: string): boolean {
    return (
        file.startsWith(`${sourceDir}/`) &&
        file.endsWith('.tsx') &&
        !/(^|\/)(\.|node_modules\/)/.test(file.slice(sourceDir.length + 1))
    )
}

async function importsPageApi(file: string): Promise<boolean | undefined> {
    const source = await readFile(file, 'utf8')
    if (!source.includes(apiModuleId)) {
        return false
    }
    const { errors, module } = parseSync(file, source)
    // Keep the current membership on a syntax error and let the compiler report it.
    if (errors.length > 0) {
        return
    }
    return module.staticImports.some(
        ({ moduleRequest, entries }) => moduleRequest.value === apiModuleId && entries.some((entry) => !entry.isType)
    )
}
