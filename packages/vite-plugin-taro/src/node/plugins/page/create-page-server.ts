import { createRequire } from 'node:module'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { compileFunction } from 'node:vm'
import type { OutputChunk } from 'rolldown'
import type { DevOptions } from 'rolldown/experimental'
import {
    buffer,
    catchError,
    concatMap,
    defer,
    EMPTY,
    filter,
    firstValueFrom,
    ignoreElements,
    merge,
    of,
    ReplaySubject,
    Subject,
    startWith,
    switchMap,
    tap,
    withLatestFrom,
    zip
} from 'rxjs'
import type { VptPageDeclaration, VptPageOption, VptTarget } from '../../../options.ts'
import { dev } from '../../utils/vite-rolldown.ts'
import { createPageModulesPlugin, pageEntryPrefix } from './create-page-modules-plugin.ts'
import { orderPages } from './order-pages.ts'

const entryId = '\0ps:entry'

type Props = Readonly<{
    root: string
    target: VptTarget
    publish: (pages: readonly VptPageOption[]) => void
    onError: (error: unknown) => void
}>

type HotUpdate = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type BuildOutput = Parameters<NonNullable<DevOptions['onOutput']>>[0]
type PageResult = Readonly<{ fileName: string; page: VptPageOption | undefined }>
type Snapshot = Readonly<{ pages: readonly VptPageOption[]; results: ReadonlyMap<string, PageResult> }>

/** Evaluates page declarations in an incremental, tree-shaken Node bundle. */
export async function createPageServer({ root, target, publish, onError }: Props): Promise<{ close(): Promise<void> }> {
    const changedFiles = new Subject<string>()
    const updates = new Subject<HotUpdate>()
    const outputs = new Subject<BuildOutput>()

    const pageModules = await createPageModulesPlugin(root, entryId, (file) => changedFiles.next(file))

    const engine = await dev(
        {
            cwd: root,
            input: entryId,
            platform: 'node',
            treeshake: true,
            resolve: { alias: { '/src': path.join(root, 'src') } },
            plugins: [pageModules]
        },
        { format: 'cjs', exports: 'named', dynamicImportInCjs: false, chunkFileNames: '[name]-[hash:16].cjs' },
        {
            watch: { skipWrite: true },
            hotUpdate: true,
            rebuildStrategy: 'never',
            onHmrUpdates: (result) => updates.next(result),
            onOutput: (result) => outputs.next(result)
        }
    )

    // Each HMR result closes one batch, including empty and failed batches.
    const rebuilds = zip(updates, changedFiles.pipe(buffer(updates))).pipe(
        concatMap(([update, files]) => {
            if (update instanceof Error) {
                return of(update)
            }
            if (files.length === 0) {
                return EMPTY
            }
            return defer(() => engine.ensureLatestBuildOutput()).pipe(
                ignoreElements(),
                catchError((error: unknown) => of(error instanceof Error ? error : new Error(String(error))))
            )
        })
    )

    // The first snapshot completes startup; subsequent snapshots also serve as the reuse baseline.
    const snapshots = new ReplaySubject<Snapshot>(1)
    const initial = firstValueFrom(snapshots)

    const subscription = merge(rebuilds, outputs)
        .pipe(
            withLatestFrom(snapshots.pipe(startWith(undefined))),
            switchMap(([output, previous]) =>
                defer(() => {
                    if (output instanceof Error) {
                        throw output
                    }
                    const chunks = output.output.filter((file): file is OutputChunk => file.type === 'chunk')
                    return evaluatePages(root, target, chunks, previous?.results)
                }).pipe(
                    filter((snapshot) => snapshot !== undefined),
                    tap((snapshot) => {
                        if (!isDeepStrictEqual(previous?.pages, snapshot.pages)) {
                            publish(snapshot.pages)
                        }
                    }),
                    catchError((error: unknown) => {
                        if (previous === undefined) {
                            throw error
                        }
                        onError(error)
                        return EMPTY
                    })
                )
            )
        )
        .subscribe(snapshots)

    function close(): Promise<void> {
        subscription.unsubscribe()
        snapshots.complete()
        return engine.close()
    }

    try {
        await Promise.all([engine.run(), initial])

        return { close }
    } catch (error) {
        await close()
        throw error
    }
}

async function evaluatePages(
    root: string,
    target: VptTarget,
    chunks: readonly OutputChunk[],
    previous: ReadonlyMap<string, PageResult> | undefined
): Promise<Snapshot | undefined> {
    const entries = new Map(
        chunks.flatMap(({ facadeModuleId, fileName }) =>
            facadeModuleId?.startsWith(pageEntryPrefix)
                ? [[facadeModuleId.slice(pageEntryPrefix.length), fileName] as const]
                : []
        )
    )
    const routes = [...entries.keys()]
    if (
        previous?.size === routes.length &&
        routes.every((route) => previous.get(route)?.fileName === entries.get(route))
    ) {
        return
    }

    const load = createChunkLoader(root, chunks)
    // Collect the results and ordered input for this build before the server accepts either.
    const results = new Map<string, PageResult>()
    const pages: VptPageOption[] = []
    for (const route of routes.sort()) {
        const fileName = entries.get(route)!
        const cached = previous?.get(route)
        const page =
            cached?.fileName === fileName ? cached.page : await evaluatePage(route, load(fileName).default, target)
        results.set(route, { fileName, page })
        if (page) {
            pages.push(page)
        }
    }
    return { pages: orderPages(pages), results }
}

async function evaluatePage(route: string, factory: VptPageDeclaration | undefined, target: VptTarget) {
    if (factory !== undefined) {
        return { ...(await factory({ target })), path: route }
    }
}

function createChunkLoader(root: string, chunks: readonly OutputChunk[]) {
    const files = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
    // Fresh CommonJS module instances are shared by all factories evaluated from this output.
    const loaded = new Map<string, { exports: { default?: VptPageDeclaration } }>()
    function load(fileName: string) {
        const cached = loaded.get(fileName)
        if (cached) {
            return cached.exports
        }
        const chunk = files.get(fileName)!
        const filename = path.resolve(root, fileName)
        const require = createRequire(filename)
        const module: { exports: { default?: VptPageDeclaration } } = { exports: {} }
        loaded.set(fileName, module)
        compileFunction(chunk.code, ['module', 'exports', 'require'], { filename })(
            module,
            module.exports,
            (id: string) => {
                const dependency = path.posix.join(path.posix.dirname(fileName), id)
                return id.startsWith('.') && files.has(dependency) ? load(dependency) : require(id)
            }
        )
        return module.exports
    }
    return load
}
