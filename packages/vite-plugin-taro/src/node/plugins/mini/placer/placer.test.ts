import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build, type InputOption, type OutputBundle, type OutputChunk, type Plugin } from 'rolldown'
import { appCapsulePath, appShellPath, bootstrapPath, transportPath } from '../module/module.ts'
import { createPlacement, type GeneratedSubpackage, type Placement } from './placement.ts'
import { createMiniPlacementPlugin, isMiniFrameworkVendorModule, placementRolldownOptions } from './placer.ts'

const fixtureRoot = '/placer-fixture'
const contentHashPattern = '[A-Za-z0-9_-]{8}'

type BuildFixture = {
    readonly modules: Readonly<Record<string, string>>
    readonly input: InputOption
    readonly additionalBytes?: Readonly<Record<string, number>>
}

type FixtureOutput = {
    readonly bundle: OutputBundle
    readonly chunks: readonly OutputChunk[]
    readonly placement: Placement
    readonly subpackages: readonly GeneratedSubpackage[]
}

/** Builds virtual modules through the real Rolldown output lifecycle used by the placer. */
async function buildFixture({ modules, input, additionalBytes }: BuildFixture): Promise<FixtureOutput> {
    let placement: Placement | undefined
    let subpackages: readonly GeneratedSubpackage[] = []
    const virtualModules: Plugin = {
        name: 'test:placer-fixture',
        resolveId(source, importer) {
            if (source in modules) {
                return source
            }
            if (!importer || !source.startsWith('.')) {
                return null
            }
            const resolvedId = path.posix.resolve(path.posix.dirname(importer), source)
            return resolvedId in modules ? resolvedId : null
        },
        load(moduleId) {
            return modules[moduleId] ?? null
        },
        renderStart() {
            placement = undefined
        },
        renderChunk(_code, _chunk, _outputOptions, meta) {
            placement ??= createPlacement({
                chunks: meta.chunks,
                getAdditionalModuleBytes: (moduleId) => additionalBytes?.[moduleId] ?? 0
            })
        },
        generateBundle(_outputOptions, bundle) {
            assert.ok(placement)
            subpackages = placement.finalize(bundle)
        }
    }
    const result = await build({
        input,
        plugins: [virtualModules],
        preserveEntrySignatures: placementRolldownOptions.preserveEntrySignatures,
        output: {
            ...placementRolldownOptions.output,
            format: 'es',
            sourcemap: false,
            strictExecutionOrder: true
        },
        write: false
    })
    const bundle: OutputBundle = Object.fromEntries(result.output.map((output) => [output.fileName, output]))
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')
    assert.ok(placement)

    return {
        bundle,
        chunks,
        placement,
        subpackages
    }
}

/** Finds the final physical chunk containing one fixture module. */
function findChunk(chunks: readonly OutputChunk[], moduleId: string): OutputChunk {
    const chunk = chunks.find((candidate) => candidate.moduleIds.includes(moduleId))
    assert.ok(chunk, `Missing output chunk for ${moduleId}`)
    return chunk
}

/** Extracts and validates one generated physical subpackage root. */
function getSubpackageRoot(chunk: OutputChunk): string {
    const match = /^(sub\/p_[a-f0-9]{8})\//.exec(chunk.fileName)
    assert.ok(match, `Expected generated subpackage output, received ${chunk.fileName}`)
    return match[1]
}

function moduleId(fileName: string): string {
    return `${fixtureRoot}/${fileName}`
}

test('rejects placement services and chunk delivery outside their lifecycle phases', async () => {
    const output = await buildFixture({
        input: { application: moduleId('lifecycle.js') },
        modules: {
            [moduleId('lifecycle.js')]: `export const value = 'lifecycle'`
        }
    })
    const chunk = output.chunks[0]
    assert.ok(chunk)
    const plugin = createMiniPlacementPlugin()

    assert.throws(() => plugin.getPackageLocation(chunk), /placement is unavailable/)
    assert.throws(() => plugin.getSubpackages(), /subpackages are unavailable/)

    const renderChunkHook = plugin.renderChunk
    assert.ok(renderChunkHook)
    const renderChunk = typeof renderChunkHook === 'function' ? renderChunkHook : renderChunkHook.handler
    assert.throws(
        () => Reflect.apply(renderChunk, {}, ['', chunk, {}, { chunks: {} }]),
        /received final chunks during the idle phase/
    )

    const renderStartHook = plugin.renderStart
    assert.ok(renderStartHook)
    const renderStart = typeof renderStartHook === 'function' ? renderStartHook : renderStartHook.handler
    Reflect.apply(renderStart, {}, [])
    assert.throws(() => plugin.getLoadMode(chunk), /placement is unavailable/)
})

test('extracts the recursive React/Taro vendor closure without absorbing application modules', async () => {
    const applicationId = moduleId('application.js')
    const reactId = '/workspace/node_modules/.pnpm/react@19.2.8/node_modules/react/index.js'
    const taroId = '/workspace/node_modules/.pnpm/@tarojs+runtime@4.2.1/node_modules/@tarojs/runtime/index.js'
    const frameworkDependencyId = '/workspace/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs'
    const applicationDependencyId = moduleId('application-dependency.js')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `
                import { react } from '${reactId}'
                import { application } from './application-dependency.js'
                export const value = react + application
            `,
            [reactId]: `
                import { taro } from '${taroId}'
                import { helper } from '${frameworkDependencyId}'
                export const react = taro + helper
            `,
            [taroId]: `export const taro = 'taro'`,
            [frameworkDependencyId]: `export const helper = 'helper'`,
            [applicationDependencyId]: `export const application = 'application'`
        }
    })

    const vendor = findChunk(output.chunks, reactId)
    const application = findChunk(output.chunks, applicationId)

    assert.match(vendor.fileName, new RegExp(`^assets/vendor-${contentHashPattern}\\.js$`))
    assert.ok(vendor.moduleIds.includes(taroId))
    assert.ok(vendor.moduleIds.includes(frameworkDependencyId))
    assert.ok(!vendor.moduleIds.includes(applicationId))
    assert.ok(!vendor.moduleIds.includes(applicationDependencyId))
    assert.ok(application.moduleIds.includes(applicationId))
    assert.ok(application.moduleIds.includes(applicationDependencyId))
    assert.equal(output.placement.getLoadMode(vendor), 'sync')
    assert.deepEqual(output.subpackages, [])
})

test('matches only explicit React and Taro framework package roots', () => {
    assert.equal(isMiniFrameworkVendorModule('/repo/node_modules/.pnpm/react@19.2.8/node_modules/react/index.js'), true)
    assert.equal(
        isMiniFrameworkVendorModule(
            '/repo/node_modules/.pnpm/@tarojs+runtime@4.2.1/node_modules/@tarojs/runtime/index.js'
        ),
        true
    )
    assert.equal(
        isMiniFrameworkVendorModule(
            '/repo/node_modules/.pnpm/vite-plugin-taro-runtime@0.6.6/node_modules/vite-plugin-taro-runtime/dist/index.js'
        ),
        true
    )
    assert.equal(isMiniFrameworkVendorModule('/repo/packages/taro-react/dist/react.esm.js'), true)
    assert.equal(isMiniFrameworkVendorModule('/repo/packages/taro-runtime/dist/index.js'), true)
    assert.equal(isMiniFrameworkVendorModule('/repo/src/react-feature.ts'), false)
    assert.equal(isMiniFrameworkVendorModule('/repo/src/taro-page.ts'), false)
})

test('emits an eager application closure entirely in the synchronous main package', async () => {
    const applicationId = moduleId('application.js')
    const eagerId = moduleId('eager.js')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `
                import { value } from './eager.js'
                export const eagerValue = value
            `,
            [eagerId]: `export const value = 'eager'`
        }
    })

    const application = findChunk(output.chunks, applicationId)
    assert.match(application.fileName, new RegExp(`^assets/application-${contentHashPattern}\\.js$`))
    assert.ok(application.moduleIds.includes(eagerId))
    assert.deepEqual(output.subpackages, [])
    assert.ok(output.chunks.every((chunk) => output.placement.getLoadMode(chunk) === 'sync'))
})

test('preserves Rolldown naming for one lazy static closure', async () => {
    const applicationId = moduleId('application.js')
    const featureId = moduleId('feature-panel.js')
    const dependencyId = moduleId('feature-data.js?variant=compact#summary')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `export const loadFeature = () => import('./feature-panel.js')`,
            [featureId]: `
                import { value } from './feature-data.js?variant=compact#summary'
                export const featureValue = value
            `,
            [dependencyId]: `export const value = 'feature'`
        }
    })

    const application = findChunk(output.chunks, applicationId)
    const feature = findChunk(output.chunks, featureId)
    const root = getSubpackageRoot(feature)

    assert.equal(feature.moduleIds[0], dependencyId)
    assert.ok(feature.moduleIds.includes(featureId))
    assert.match(feature.fileName, new RegExp(`^${root}/assets/feature-panel-${contentHashPattern}\\.js$`))
    assert.equal(output.placement.getLoadMode(application), 'sync')
    assert.equal(output.placement.getLoadMode(feature), 'async')
    assert.deepEqual(output.subpackages, [
        {
            name: root.slice('sub/'.length),
            root,
            pages: []
        }
    ])
})

test('keeps same-named chunks from different source folders as distinct owners', async () => {
    const applicationId = moduleId('application.js')
    const accountId = moduleId('account/foo.js')
    const reportId = moduleId('report/foo.js')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `
                export const loadAccount = () => import('./account/foo.js')
                export const loadReport = () => import('./report/foo.js')
            `,
            [accountId]: `export const account = 'account'`,
            [reportId]: `export const report = 'report'`
        },
        additionalBytes: {
            [accountId]: 1_000_000,
            [reportId]: 1_000_000
        }
    })

    const account = findChunk(output.chunks, accountId)
    const report = findChunk(output.chunks, reportId)

    assert.notEqual(account.preliminaryFileName, report.preliminaryFileName)
    assert.notEqual(account.fileName, report.fileName)
    assert.equal(output.placement.getLoadMode(account), 'async')
    assert.equal(output.placement.getLoadMode(report), 'async')
    assert.equal(output.subpackages.length, 2)
})

test('keeps an eagerly shared dependency in main when a subpackage also imports it', async () => {
    const applicationId = moduleId('application.js')
    const sharedId = moduleId('shared.js')
    const featureId = moduleId('lazy-feature.js')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `
                import { shared } from './shared.js'
                export const mainValue = shared
                export const loadFeature = () => import('./lazy-feature.js')
            `,
            [sharedId]: `export const shared = 'shared'`,
            [featureId]: `
                import { shared } from './shared.js'
                export const lazyValue = shared
            `
        }
    })

    const shared = findChunk(output.chunks, sharedId)
    const feature = findChunk(output.chunks, featureId)

    assert.doesNotMatch(shared.fileName, /^sub\//)
    assert.match(feature.fileName, new RegExp(`^sub/p_[a-f0-9]{8}/assets/lazy-feature-${contentHashPattern}\\.js$`))
    assert.equal(output.placement.getLoadMode(shared), 'sync')
    assert.equal(output.placement.getLoadMode(feature), 'async')
    assert.equal(output.subpackages.length, 1)
})

test('emits independently named chunks when the package budget splits lazy roots', async () => {
    const applicationId = moduleId('application.js')
    const accountId = moduleId('account-panel.js')
    const reportId = moduleId('report-panel.js')
    const output = await buildFixture({
        input: { application: applicationId },
        modules: {
            [applicationId]: `
                export const loadAccount = () => import('./account-panel.js')
                export const loadReport = () => import('./report-panel.js')
            `,
            [accountId]: `export const account = 'account'`,
            [reportId]: `export const report = 'report'`
        },
        additionalBytes: {
            [accountId]: 1_000_000,
            [reportId]: 1_000_000
        }
    })

    const account = findChunk(output.chunks, accountId)
    const report = findChunk(output.chunks, reportId)
    const accountRoot = getSubpackageRoot(account)
    const reportRoot = getSubpackageRoot(report)

    assert.notEqual(accountRoot, reportRoot)
    assert.match(account.fileName, new RegExp(`^${accountRoot}/assets/account-panel-${contentHashPattern}\\.js$`))
    assert.match(report.fileName, new RegExp(`^${reportRoot}/assets/report-panel-${contentHashPattern}\\.js$`))
    assert.deepEqual(
        output.subpackages.map((subpackage) => subpackage.root),
        [accountRoot, reportRoot].sort()
    )
    assert.ok([account, report].every((chunk) => output.placement.getLoadMode(chunk) === 'async'))
})

test('preserves native shell paths while hashing real capsule and runtime entries in main', async () => {
    const output = await buildFixture({
        input: {
            'app.js': appShellPath,
            'app-capsule': appCapsulePath,
            bootstrap: bootstrapPath,
            transport: transportPath
        },
        modules: {
            [appShellPath]: `export const shell = 'app'`,
            [appCapsulePath]: `export default { name: 'app' }`,
            [bootstrapPath]: `export const bootstrap = true`,
            [transportPath]: `export const transport = true`
        }
    })

    const shell = findChunk(output.chunks, appShellPath)
    const capsule = findChunk(output.chunks, appCapsulePath)
    const bootstrap = findChunk(output.chunks, bootstrapPath)
    const transport = findChunk(output.chunks, transportPath)

    assert.equal(shell.fileName, 'app.js')
    assert.match(capsule.fileName, new RegExp(`^assets/app-capsule-${contentHashPattern}\\.js$`))
    assert.match(bootstrap.fileName, new RegExp(`^assets/bootstrap-${contentHashPattern}\\.js$`))
    assert.match(transport.fileName, new RegExp(`^assets/transport-${contentHashPattern}\\.js$`))
    assert.deepEqual(output.subpackages, [])
    assert.ok(output.chunks.every((chunk) => output.placement.getLoadMode(chunk) === 'sync'))
})
