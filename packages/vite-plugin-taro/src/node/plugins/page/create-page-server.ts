import path from 'node:path'
import { compileFunction } from 'node:vm'
import type { OutputChunk, PluginContext } from 'rolldown'
import type { DevOptions } from 'rolldown/experimental'
import { catchError, defer, EMPTY, Subject, switchMap, tap } from 'rxjs'
import { normalizePath } from 'vite'
import type { VptPageDeclaration, VptPageOption, VptTarget } from '../../../options.ts'
import { dev, viteImportGlobPlugin } from '../../utils/vite-rolldown.ts'
import { apiModuleId } from '../api/api-module-id.ts'

const entryId = '\0ps:entry'
const registryId = '\0ps:registry'
const apiSidecarPrefix = '\0ps:api:'

type Output = Parameters<NonNullable<DevOptions['onOutput']>>[0]
type Props = Readonly<{
    root: string
    target: VptTarget
    /** Applies a snapshot synchronously. */
    publish: (pages: readonly VptPageOption[]) => void
    onError: (error: unknown) => void
}>

/** Builds the page entry incrementally with Vite's glob plugin and tree-shaking. */
export async function createPageServer({ root, target, publish, onError }: Props): Promise<{ close(): Promise<void> }> {
    const outputs = new Subject<Output>()

    const subscription = outputs
        .pipe(
            switchMap((result) =>
                defer(() => {
                    if (result instanceof Error) {
                        throw result
                    }
                    return evaluatePages(result.output.find((file) => file.type === 'chunk')!, target)
                }).pipe(
                    tap(publish),
                    catchError((error: unknown) => {
                        onError(error)
                        return EMPTY
                    })
                )
            )
        )
        .subscribe()

    const engine = await dev(
        {
            cwd: root,
            input: entryId,
            treeshake: true,
            resolve: { alias: { '/src': path.join(root, 'src') } },
            plugins: [
                viteImportGlobPlugin({ root }),
                createGlobUpdatesPlugin(root),
                {
                    name: 'ps:entry',
                    resolveId(id, importer) {
                        if (id === entryId || id === registryId) {
                            return id
                        }
                        if (id === apiModuleId && importer) {
                            return apiSidecarPrefix + path.relative(root, importer).split(path.sep).join('/')
                        }
                    },
                    load(id) {
                        if (id === entryId) {
                            return `
                                import.meta.glob('/src/**/*.tsx', { eager: true });
                                export { factories as default } from ${JSON.stringify(registryId)};
                            `
                        }
                        if (id === registryId) {
                            return 'export const factories = {};'
                        }
                        if (id.startsWith(apiSidecarPrefix)) {
                            const filename = JSON.stringify(`/${id.slice(apiSidecarPrefix.length)}`)
                            return `
                                import { factories } from ${JSON.stringify(registryId)};
                                export function defineVptPage(factory) { factories[${filename}] = factory; }
                            `
                        }
                    }
                }
            ]
        },
        { format: 'cjs', exports: 'named', codeSplitting: false },
        {
            onOutput: (result) => outputs.next(result),
            rebuildStrategy: 'never',
            hotUpdate: true,
            watch: { skipWrite: true },
            onHmrUpdates: (result) => {
                return result instanceof Error
                    ? outputs.next(result)
                    : void engine.ensureLatestBuildOutput().catch(onError)
            }
        }
    )

    await engine.run()

    return {
        close() {
            subscription.unsubscribe()
            return engine.close()
        }
    }
}

/** Re-expands the page glob when a matching file is added or removed. */
function createGlobUpdatesPlugin(root: string) {
    const sourceDir = normalizePath(path.resolve(root, 'src'))

    return {
        name: 'ps:glob-updates',
        buildStart(this: PluginContext) {
            this.addWatchFile(sourceDir)
        },
        hotUpdate({ file, type, modules }: { file: string; type: 'create' | 'update' | 'delete'; modules: string[] }) {
            if (type === 'update' || !file.startsWith(`${sourceDir}/`)) {
                return
            }
            const relative = file.slice(sourceDir.length + 1)
            if (relative.endsWith('.tsx') && !/(^|\/)(\.|node_modules\/)/.test(relative)) {
                return [...modules, entryId]
            }
        }
    }
}

function evaluatePages(chunk: Pick<OutputChunk, 'code' | 'fileName'>, target: VptTarget): Promise<VptPageOption[]> {
    // Each evaluation gets fresh CommonJS exports in the host realm.
    const module = { exports: {} as { default: Record<string, VptPageDeclaration> } }

    compileFunction(chunk.code, ['module', 'exports'], { filename: chunk.fileName })(module, module.exports)

    return Array.fromAsync(Object.entries(module.exports.default), async ([filename, factory]) => ({
        ...(await factory({ target })),
        path: filename.slice('/src/'.length, -'.tsx'.length)
    }))
}
