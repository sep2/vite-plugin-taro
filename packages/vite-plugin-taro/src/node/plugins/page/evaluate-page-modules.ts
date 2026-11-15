import { build, type Plugin, runnerImport } from 'vite'
import type { VptPageOption, VptTarget } from '../../../options.ts'
import { normalizeModuleId, resolvePageComponentPath } from '../../utils/modules.ts'
import { apiModuleId } from '../api/api-module-id.ts'
import { createClientTaroPlugin } from '../client/client-taro.ts'
import { createConditionalDirectivePlugin } from '../conditional/conditional-directives.ts'
import type { PageBuildConfig } from './page-build-config.ts'

const entryId = '\0vpt:page-entry'

/** Compiles candidates in one shared graph and evaluates their factories in candidate order. */
export async function evaluatePageModules(
    paths: readonly string[],
    { root, define, resolve }: PageBuildConfig,
    target: VptTarget
): Promise<VptPageOption[]> {
    if (paths.length === 0) {
        return []
    }

    // The build hook captures this invocation's compiled source for evaluation after the build completes.
    let code = ''

    await build({
        root,
        define,
        resolve,
        configFile: false,
        envDir: false,
        publicDir: false,
        logLevel: 'silent',
        ssr: { noExternal: true },
        plugins: [
            createConditionalDirectivePlugin(target),
            createClientTaroPlugin(target),
            createPageConfigurationPlugin(paths, root, target, (compiledCode) => {
                code = compiledCode
            })
        ],
        build: {
            ssr: true,
            target: 'esnext',
            write: false,
            rolldownOptions: { input: entryId, output: { codeSplitting: false } }
        }
    })

    const { module } = await runnerImport<{ default: VptPageOption[] }>(entryId, {
        root,
        publicDir: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'vpt:evaluate-page',
                resolveId: (id) => (id === entryId ? id : undefined),
                load: (id) => (id === entryId ? code : undefined)
            }
        ]
    })

    return module.default
}

/** Binds page APIs to source routes, collects factories and publishes the compiled source. */
function createPageConfigurationPlugin(
    paths: readonly string[],
    root: string,
    target: VptTarget,
    setCode: (code: string) => void
): Plugin {
    const pagePaths = new Map(
        paths.map((pagePath) => [resolvePageComponentPath({ pagePath, projectRoot: root }), pagePath])
    )

    const pageApiPrefix = `\0${apiModuleId}:`

    return {
        name: 'vpt:page-configuration',
        resolveId(id, importer) {
            if (id === entryId || id.startsWith(pageApiPrefix)) {
                return id
            }
            if (id !== apiModuleId) {
                return
            }
            if (importer === entryId || importer?.startsWith(pageApiPrefix)) {
                return id
            }
            const pagePath = importer === undefined ? undefined : pagePaths.get(normalizeModuleId(importer))
            if (pagePath === undefined) {
                throw new Error(`Page declarations must be imported by a candidate page module: ${importer}`)
            }
            return pageApiPrefix + encodeURIComponent(pagePath)
        },
        load(id) {
            if (id === entryId) {
                return `
                    import { evaluatePages } from ${JSON.stringify(apiModuleId)};
                    ${Array.from(pagePaths.keys(), (filename) => `import ${JSON.stringify(filename)};`).join('\n')}
                    export default await evaluatePages(${JSON.stringify(paths)}, ${JSON.stringify(target)});
                `
            }
            if (id === apiModuleId) {
                return `
                    // Each evaluation owns factories registered through path-bound page API modules.
                    const factories = new Map();
                    export function register(path, factory) {
                        if (factories.has(path)) {
                            throw new Error('Only one defineVptPage declaration is allowed for ' + path);
                        }
                        factories.set(path, factory);
                    }
                    export async function evaluatePages(paths, target) {
                        const pages = await Array.fromAsync(paths, async path => {
                            if (factories.has(path)) {
                                return { ...await factories.get(path)({ target }), path };
                            }
                        });
                        return pages.filter(page => page !== undefined);
                    }
                `
            }
            if (id.startsWith(pageApiPrefix)) {
                const pagePath = decodeURIComponent(id.slice(pageApiPrefix.length))
                return `
                    import { register } from ${JSON.stringify(apiModuleId)};
                    export function defineVptPage(factory) {
                        register(${JSON.stringify(pagePath)}, factory);
                    }
                `
            }
        },
        generateBundle(_options, bundle) {
            // A single entry with code splitting disabled produces exactly one JavaScript chunk.
            setCode(Object.values(bundle).find((output) => output.type === 'chunk')!.code)
        }
    }
}
