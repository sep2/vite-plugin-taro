import { hash } from 'node:crypto'
import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'
import { walk } from 'oxc-walker'
import type { Plugin, PluginContext } from 'rolldown'
import { normalizePath, parseSync } from 'vite'
import { apiModuleId } from '../api/api-module-id.ts'

export const pageEntryPrefix = '\0ps:page:'
const emptyId = '\0ps:empty'
const declarationPrefix = '\0ps:declaration:'

// A null signature means the page needs full bundle analysis on edits.
type PageSignature = string | null

type PageModulesPlugin = Plugin & {
    hotUpdate(
        this: PluginContext,
        event: {
            file: string
            type: 'create' | 'update' | 'delete'
            modules: string[]
        }
    ): Promise<string[] | undefined>
}

/** Selects page roots without changing how their ordinary imports are resolved. */
export async function createPageModulesPlugin(
    root: string,
    entryId: string,
    invalidate: (file: string) => void
): Promise<PageModulesPlugin> {
    const sourceDir = normalizePath(path.resolve(root, 'src'))
    // File events maintain page membership and the signature used to classify component edits.
    const routes = await discoverRoutes(sourceDir)

    return {
        name: 'ps:modules',
        buildStart() {
            this.addWatchFile(sourceDir)
        },
        async hotUpdate({ file, type, modules }) {
            if (!isPageSource(file, sourceDir)) {
                if (modules.length > 0) {
                    invalidate(file)
                }
                return
            }

            const route = routeOf(file, sourceDir)
            const previous = routes.get(route)
            const inspected = type === 'delete' ? false : await inspectPage(file)
            const signature = inspected === undefined && previous !== undefined ? null : inspected
            const isPage = signature !== false && signature !== undefined
            if (isPage) {
                routes.set(route, signature)
            } else {
                routes.delete(route)
            }
            if (isPage !== (previous !== undefined)) {
                invalidate(file)
                return [...modules, entryId]
            }
            if (modules.length > 0) {
                const info = this.getModuleInfo(file)
                // The page wrapper imports only for registration; another importer could observe the default export.
                const componentOnly =
                    typeof signature === 'string' &&
                    signature === previous &&
                    modules.length === 1 &&
                    modules[0] === file &&
                    info?.importers.length === 1 &&
                    info.importers[0] === pageEntryPrefix + route &&
                    info.dynamicImporters.length === 0
                if (!componentOnly) {
                    invalidate(file)
                }
            }
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
                const imports = [...routes.keys()]
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

async function discoverRoutes(sourceDir: string): Promise<Map<string, PageSignature>> {
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
                if (isPageSource(file, sourceDir)) {
                    const signature = await inspectPage(file)
                    if (signature !== false && signature !== undefined) {
                        return [routeOf(file, sourceDir), signature] as const
                    }
                }
            })
    )
    return new Map(entries.filter((entry) => entry !== undefined))
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

async function inspectPage(file: string): Promise<PageSignature | false | undefined> {
    const source = await readFile(file, 'utf8')
    if (!source.includes(apiModuleId)) {
        return false
    }
    const { errors, module, program } = parseSync(file, source)
    // Keep the current membership on a syntax error and let the compiler report it.
    if (errors.length > 0) {
        return
    }
    if (
        !module.staticImports.some(
            ({ moduleRequest, entries }) =>
                moduleRequest.value === apiModuleId && entries.some((entry) => !entry.isType)
        )
    ) {
        return false
    }
    return pageSignature(source, program)
}

function pageSignature(source: string, program: ReturnType<typeof parseSync>['program']): PageSignature {
    const component = program.body.find((node) => node.type === 'ExportDefaultDeclaration')?.declaration
    if (
        component?.type !== 'FunctionDeclaration' &&
        component?.type !== 'FunctionExpression' &&
        component?.type !== 'ArrowFunctionExpression'
    ) {
        return null
    }
    const body = component.body
    if (!body) {
        return null
    }
    // A named default component may be used by its own module, even without another importer.
    const binding = component.type === 'FunctionDeclaration' ? component.id : null
    if (binding) {
        let referenced = false
        walk(program, {
            enter(node) {
                if (referenced || node === body) {
                    this.skip()
                } else if (
                    node !== binding &&
                    (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
                    (node.name === binding.name || node.name === 'eval')
                ) {
                    referenced = true
                }
            }
        })
        if (referenced) {
            return null
        }
    }
    return hash('sha256', JSON.stringify([source.slice(0, body.start), source.slice(body.end)]))
}
