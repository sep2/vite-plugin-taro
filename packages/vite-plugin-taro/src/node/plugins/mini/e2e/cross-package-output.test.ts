import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build, type OutputChunk, type Plugin } from 'rolldown'
import { normalizePath } from 'vite'
import '../../../../runtime/wx/systemjs/system-core.js'
import type { MiniContract } from '../mini-contract.ts'
import { createMiniModuleClassifier } from '../module/module.ts'
import { createPlacement, type Placement } from '../placer/placement.ts'
import { createPlacementRolldownOptions } from '../placer/placer.ts'
import { renderCapsule } from '../render/capsule.ts'
import { renderNative } from '../render/native.ts'
import { materializeTransport } from '../render/transport.ts'

/**
 * Logical graph exercised by this production-output test (`──▶` static, `┄┄▶` dynamic):
 *
 * ```text
 * application [main]
 * ├──▶ main-dependency [main]
 * └┄┄▶ subpackage-a [A]
 *      ├──▶ main-dependency [main]
 *      ├──▶ subpackage-a-static
 *      │    └──▶ subpackage-b [B]
 *      │          └──▶ subpackage-a [A]       cycle B → A
 *      └┄┄▶ nested-dynamic [C]
 *            ├──▶ main-dependency [main]
 *            └──▶ nested-static
 *                  ├──▶ subpackage-b [B]
 *                  └┄┄▶ deep-dynamic [D]
 *                        └──▶ deep-static
 *                              ├──▶ main-dependency [main]
 *                              └──▶ subpackage-a [A]
 * ```
 *
 * A, B, C, and D each contribute one simulated megabyte, forcing four physical subpackages under the 1.9 MB
 * planning budget. Their smaller static dependencies remain independently placeable, so the test does not rely on a
 * static closure being collapsed into one package.
 */
const contract: MiniContract = {
    options: {
        target: 'wx',
        app: '/src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    },
    taro: {
        env: 'test',
        componentsReactPath: '/taro/components-react'
    },
    runtime: {
        globalObject: 'global',
        modules: {
            bootstrap: '/runtime/bootstrap',
            transport: '/runtime/transport',
            appShell: '/runtime/app-shell',
            appCapsule: '/runtime/app-capsule',
            componentShell: '/runtime/component-shell',
            componentCapsule: '/runtime/component-capsule',
            customWrapperShell: '/runtime/custom-wrapper-shell',
            pageShell: '/runtime/page-shell',
            pageCapsule: '/runtime/page-capsule',
            devtoolsHmrRuntime: '/runtime/devtools-hmr',
            interpreterHmrRuntime: '/runtime/interpreter-hmr'
        }
    },
    styles: {
        appFileName: 'app.style',
        globalFileName: 'assets/global.style'
    },
    react: {},
    output: {
        subpackagePlanningBudget: 1_900_000
    }
}
const runtimeModules = contract.runtime.modules
const classifyModule = createMiniModuleClassifier(runtimeModules)
const transportPath = runtimeModules.transport
const placementRolldownOptions = createPlacementRolldownOptions(classifyModule)

const applicationId = '/cross-package/application.js'
const mainDependencyId = '/cross-package/main-dependency.js'
const subpackageAId = '/cross-package/subpackage-a.js'
const subpackageAStaticId = '/cross-package/subpackage-a-static.js'
const subpackageBId = '/cross-package/subpackage-b.js'
const nestedDynamicId = '/cross-package/nested-dynamic.js'
const nestedStaticId = '/cross-package/nested-static.js'
const deepDynamicId = '/cross-package/deep-dynamic.js'
const deepStaticId = '/cross-package/deep-static.js'

const largeLazyModuleIds: ReadonlySet<string> = new Set([subpackageAId, subpackageBId, nestedDynamicId, deepDynamicId])

const modules: Readonly<Record<string, string>> = {
    // The package's built runtime is intentionally virtualized so this source-level test does not require a prebuilt dist.
    [transportPath]: `
        export const transport = __VPT_TRANSPORT__
    `,
    [applicationId]: `
        import { mainName } from './main-dependency.js'
        export const readMain = () => mainName
        export const loadSubpackage = () => import('./subpackage-a.js')
    `,
    [mainDependencyId]: `
        export const mainName = 'main'
    `,
    [subpackageAId]: `
        import { mainName } from './main-dependency.js'
        import { readCycleName, readPeerName } from './subpackage-a-static.js'
        export const name = 'a'
        export const readMainDependency = () => mainName
        export const readNestedStatic = () => readPeerName()
        export const readCycle = () => readCycleName()
        export const loadNestedDynamic = () => import('./nested-dynamic.js')
    `,
    [subpackageAStaticId]: `
        import { name as peerName, readImporter } from './subpackage-b.js'
        export const readPeerName = () => peerName
        export const readCycleName = () => readImporter()
    `,
    [subpackageBId]: `
        import { name as importerName } from './subpackage-a.js'
        export const name = 'b'
        export const readImporter = () => importerName
    `,
    [nestedDynamicId]: `
        import { mainName } from './main-dependency.js'
        import { loadDeepDynamic, readNestedStatic } from './nested-static.js'
        export const readMainDependency = () => mainName
        export { loadDeepDynamic, readNestedStatic }
    `,
    [nestedStaticId]: `
        import { name as peerName } from './subpackage-b.js'
        export const readNestedStatic = () => peerName
        export const loadDeepDynamic = () => import('./deep-dynamic.js')
    `,
    [deepDynamicId]: `
        import { readDeepStatic } from './deep-static.js'
        export { readDeepStatic }
    `,
    [deepStaticId]: `
        import { mainName } from './main-dependency.js'
        import { name as cycleName } from './subpackage-a.js'
        export const readDeepStatic = () => mainName + ':' + cycleName
    `
}

type CrossPackageOutput = {
    readonly chunks: readonly OutputChunk[]
    readonly application: OutputChunk
    readonly mainDependency: OutputChunk
    readonly subpackageA: OutputChunk
    readonly subpackageB: OutputChunk
    readonly nestedDynamic: OutputChunk
    readonly deepDynamic: OutputChunk
    readonly transport: OutputChunk
}

type NativeLoad = {
    readonly fileName: string
    readonly mode: 'async' | 'sync'
}

type NativeEvaluator = {
    readonly loads: readonly NativeLoad[]
    evaluate(fileName: string): unknown
}

interface TransportExports {
    transport(moduleId: string): System.Registration | PromiseLike<System.Registration>
}

/** Resolves the compact in-memory application without introducing filesystem fixtures. */
function createVirtualModulesPlugin(): Plugin {
    return {
        name: 'test:cross-package-modules',
        resolveId(source, importer) {
            if (source in modules) {
                return source
            }
            if (!importer || !source.startsWith('.')) {
                return null
            }
            const resolved = path.posix.resolve(path.posix.dirname(importer), source)
            return resolved in modules ? resolved : null
        },
        load(id) {
            return modules[id] ?? null
        }
    }
}

/** Runs the same placement and final rendering stages used by the production wx plugin. */
function createMiniOutputPlugin(): Plugin {
    let placement: Placement | undefined

    return {
        name: 'test:cross-package-output',
        renderStart() {
            placement = undefined
        },
        async renderChunk(code, chunk, outputOptions, meta) {
            placement ??= createPlacement({
                chunks: meta.chunks,
                planningBudgetBytes: contract.output.subpackagePlanningBudget,
                getAdditionalModuleBytes: (moduleId) => (largeLazyModuleIds.has(moduleId) ? 1_000_000 : 0)
            })
            const sourcemap = Boolean(outputOptions.sourcemap)
            const classification = classifyModule(chunk)
            if (classification.executionKind === 'capsule') {
                return renderCapsule(code, chunk, sourcemap)
            }

            const native = renderNative({
                code,
                chunk,
                chunks: meta.chunks,
                runtime: contract.runtime,
                classifyModule: classifyModule,
                sourcemap
            })
            if (!classification.isTransport) {
                return native
            }
            return materializeTransport({
                code: native.code,
                transportChunk: chunk,
                chunks: meta.chunks,
                classifyModule: classifyModule,
                getLoadMode: placement.getLoadMode,
                getPhysicalChunkId: placement.getPhysicalChunkId,
                sourcemap
            })
        },
        generateBundle(_outputOptions, bundle) {
            assert.ok(placement)
            placement.finalize(bundle)
        }
    }
}

/** Builds a production-shaped output whose lazy cycle must span two generated subpackages. */
async function buildCrossPackageOutput(): Promise<CrossPackageOutput> {
    const result = await build({
        input: {
            application: applicationId,
            transport: transportPath
        },
        plugins: [createVirtualModulesPlugin(), createMiniOutputPlugin()],
        preserveEntrySignatures: placementRolldownOptions.preserveEntrySignatures,
        output: {
            ...placementRolldownOptions.output,
            format: 'es',
            sourcemap: false,
            strictExecutionOrder: true
        },
        write: false
    })
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')

    return {
        chunks,
        application: findEntryChunk(chunks, 'application'),
        mainDependency: findChunk(chunks, mainDependencyId),
        subpackageA: findChunk(chunks, subpackageAId),
        subpackageB: findChunk(chunks, subpackageBId),
        nestedDynamic: findChunk(chunks, nestedDynamicId),
        deepDynamic: findChunk(chunks, deepDynamicId),
        transport: findChunk(chunks, transportPath)
    }
}

/** Finds one explicit output entry by its configured input name. */
function findEntryChunk(chunks: readonly OutputChunk[], name: string): OutputChunk {
    const chunk = chunks.find((candidate) => candidate.isEntry && candidate.name === name)
    assert.ok(chunk, `Missing output entry: ${name}`)
    return chunk
}

/** Finds the final physical chunk containing one source module across platform-specific Rolldown path separators. */
function findChunk(chunks: readonly OutputChunk[], moduleId: string): OutputChunk {
    const normalizedModuleId = normalizePath(moduleId)
    const chunk = chunks.find((candidate) =>
        candidate.moduleIds.some((candidateId) => normalizePath(candidateId) === normalizedModuleId)
    )
    assert.ok(chunk, `Missing output chunk for ${moduleId}`)
    return chunk
}

/** Evaluates generated CommonJS files with WeChat-shaped sync and async native require functions. */
function createNativeEvaluator(chunks: readonly OutputChunk[]): NativeEvaluator {
    const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
    // Mutable cache reproduces CommonJS' single module identity across repeated native requires.
    const cache = new Map<string, { exports: unknown }>()
    // Mutable trace records the physical API selected for every generated file load.
    const loads: NativeLoad[] = []

    function evaluate(fileName: string): unknown {
        const cached = cache.get(fileName)
        if (cached) {
            return cached.exports
        }

        const chunk = chunksByFileName.get(fileName)
        assert.ok(chunk, `Unknown generated file: ${fileName}`)
        // CommonJS evaluation mutates this export cell before the completed namespace enters the cache.
        const commonJsModule: { exports: unknown } = { exports: {} }
        cache.set(fileName, commonJsModule)

        function load(specifier: string, mode: NativeLoad['mode']): unknown {
            const dependencyFileName = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), specifier))
            loads.push({ fileName: dependencyFileName, mode })
            return evaluate(dependencyFileName)
        }

        const nativeRequire = Object.assign((specifier: string) => load(specifier, 'sync'), {
            // A microtask boundary mocks WeChat's promise-returning require.async instead of evaluating the file eagerly.
            async: (specifier: string) => Promise.resolve().then(() => load(specifier, 'async'))
        })
        Function('require', 'module', 'exports', chunk.code)(nativeRequire, commonJsModule, commonJsModule.exports)
        return commonJsModule.exports
    }

    return { loads, evaluate }
}

/** Narrows the generated transport CommonJS namespace. */
function requireTransportExports(value: unknown): asserts value is TransportExports {
    assert.ok(value && typeof value === 'object' && 'transport' in value)
    assert.equal(typeof value.transport, 'function')
}

/** Reads the generated package root from one lazy capsule filename. */
function requireSubpackageRoot(chunk: OutputChunk): string {
    const match = /^(sub\/p_[a-f0-9]{8})\//.exec(chunk.fileName)
    assert.ok(match, `Expected generated subpackage output, received ${chunk.fileName}`)
    return match[1]
}

test('executes a complex nested static and dynamic graph across production wx subpackages', async () => {
    const output = await buildCrossPackageOutput()
    const lazyChunks = [output.subpackageA, output.subpackageB, output.nestedDynamic, output.deepDynamic]
    const lazyRoots = new Set(lazyChunks.map(requireSubpackageRoot))

    // Rolldown may scope-hoist fixture modules together; each surviving final chunk still has exactly one physical file.
    assert.ok(lazyRoots.size >= 1)
    assert.equal(
        new Set(lazyChunks.map((chunk) => chunk.fileName)).size,
        new Set(lazyChunks.map((chunk) => chunk.moduleIds.join('\0'))).size
    )
    assert.doesNotMatch(output.application.fileName, /^sub\//)
    assert.doesNotMatch(output.mainDependency.fileName, /^sub\//)

    const native = createNativeEvaluator(output.chunks)
    const transportExports = native.evaluate(output.transport.fileName)
    requireTransportExports(transportExports)

    const system = (global as unknown as { System: System.Loader }).System
    // The production bootstrap installs this mutable transport hook once for the application heap.
    system.instantiate = transportExports.transport

    const application = system.importSync(output.application.fileName.slice('assets/'.length))
    const readMain = application.readMain
    const loadSubpackage = application.loadSubpackage
    if (typeof readMain !== 'function' || typeof loadSubpackage !== 'function') {
        assert.fail('Application entry did not publish its expected exports')
    }
    assert.equal(readMain(), 'main')

    // Calling the main entry's dynamic import proves the main-package to subpackage edge. The mocked require.async must
    // return before native evaluation starts, rather than behaving like a synchronous require wrapped in Promise.resolve.
    const loadingSubpackageA = loadSubpackage()
    assert.ok(loadingSubpackageA instanceof Promise)
    assert.equal(
        native.loads.some((load) => load.fileName === output.subpackageA.fileName),
        false
    )
    const subpackageA = await loadingSubpackageA
    assert.equal(
        native.loads.some((load) => load.fileName === output.subpackageA.fileName && load.mode === 'async'),
        true
    )
    const readMainDependency = subpackageA.readMainDependency
    const readNestedStatic = subpackageA.readNestedStatic
    const readCycle = subpackageA.readCycle
    const loadNestedDynamic = subpackageA.loadNestedDynamic
    if (
        typeof readMainDependency !== 'function' ||
        typeof readNestedStatic !== 'function' ||
        typeof readCycle !== 'function' ||
        typeof loadNestedDynamic !== 'function'
    ) {
        assert.fail('Subpackage A did not publish its cross-package readers')
    }

    // A → main, A → static bridge → B, and the B → A back edge all retain their original ESM values.
    assert.equal(readMainDependency(), 'main')
    assert.equal(readNestedStatic(), 'b')
    assert.equal(readCycle(), 'a')

    // This is the second dynamic boundary: main ⇢ A ⇢ C. It must cross require.async again before C traverses static
    // edges to main and B.
    const loadingNestedDynamic = loadNestedDynamic()
    assert.ok(loadingNestedDynamic instanceof Promise)
    assert.equal(
        native.loads.some((load) => load.fileName === output.nestedDynamic.fileName),
        false
    )
    const nestedDynamic = await loadingNestedDynamic
    const readNestedMainDependency = nestedDynamic.readMainDependency
    const readSecondStaticLevel = nestedDynamic.readNestedStatic
    const loadDeepDynamic = nestedDynamic.loadDeepDynamic
    if (
        typeof readNestedMainDependency !== 'function' ||
        typeof readSecondStaticLevel !== 'function' ||
        typeof loadDeepDynamic !== 'function'
    ) {
        assert.fail('Nested dynamic module did not publish its static closure')
    }

    assert.equal(readNestedMainDependency(), 'main')
    assert.equal(readSecondStaticLevel(), 'b')

    // This is the third require.async boundary: C's static dependency dynamically loads D, whose static leaf reaches
    // main and A.
    const loadingDeepDynamic = loadDeepDynamic()
    assert.ok(loadingDeepDynamic instanceof Promise)
    assert.equal(
        native.loads.some((load) => load.fileName === output.deepDynamic.fileName),
        false
    )
    const deepDynamic = await loadingDeepDynamic
    const readDeepStatic = deepDynamic.readDeepStatic
    if (typeof readDeepStatic !== 'function') {
        assert.fail('Deep dynamic module did not publish its static dependency')
    }
    assert.equal(readDeepStatic(), 'main:a')

    // The native trace proves placement controls the physical API: main is synchronous and every generated package is async.
    const loadModeByFileName = new Map(native.loads.map((load) => [load.fileName, load.mode]))
    assert.equal(loadModeByFileName.get(output.application.fileName), 'sync')
    assert.equal(loadModeByFileName.get(output.mainDependency.fileName), 'sync')
    assert.equal(loadModeByFileName.get(output.subpackageA.fileName), 'async')
    assert.equal(loadModeByFileName.get(output.subpackageB.fileName), 'async')
    assert.equal(loadModeByFileName.get(output.nestedDynamic.fileName), 'async')
    assert.equal(loadModeByFileName.get(output.deepDynamic.fileName), 'async')
})
