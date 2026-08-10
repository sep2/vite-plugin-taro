import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build, type InputOption, type OutputBundle, type OutputChunk, type Plugin } from 'rolldown'
import { appCapsulePath, appShellPath, bootstrapPath, transportPath } from '../module.ts'
import { createPlacer, type GeneratedSubpackage } from './placer.ts'

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
    readonly placer: ReturnType<typeof createPlacer>
    readonly subpackages: readonly GeneratedSubpackage[]
}

/** Builds virtual modules through the real Rolldown output lifecycle used by the placer. */
async function buildFixture({ modules, input, additionalBytes }: BuildFixture): Promise<FixtureOutput> {
    const placer = createPlacer()
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
            placer.analyze({
                moduleIds: this.getModuleIds(),
                getModuleInfo: (moduleId) => this.getModuleInfo(moduleId),
                getAdditionalModuleBytes: (info) => additionalBytes?.[info.id] ?? 0
            })
        }
    }
    const result = await build({
        input,
        plugins: [virtualModules],
        preserveEntrySignatures: placer.rolldownOptions.preserveEntrySignatures,
        output: {
            ...placer.rolldownOptions.output,
            format: 'es',
            sourcemap: false,
            strictExecutionOrder: true
        },
        write: false
    })
    const bundle: OutputBundle = Object.fromEntries(result.output.map((output) => [output.fileName, output]))
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')

    return {
        bundle,
        chunks,
        placer,
        subpackages: placer.getSubpackages(bundle)
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
    assert.ok(output.chunks.every((chunk) => output.placer.getLoadMode(chunk) === 'sync'))
})

test('names a lazy static closure after the first file in its final module list', async () => {
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
    assert.match(feature.fileName, new RegExp(`^${root}/assets/feature-data-${contentHashPattern}\\.js$`))
    assert.equal(output.placer.getLoadMode(application), 'sync')
    assert.equal(output.placer.getLoadMode(feature), 'async')
    assert.deepEqual(output.subpackages, [
        {
            name: root.slice('sub/'.length),
            root,
            pages: []
        }
    ])
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
    assert.equal(output.placer.getLoadMode(shared), 'sync')
    assert.equal(output.placer.getLoadMode(feature), 'async')
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
    assert.ok([account, report].every((chunk) => output.placer.getLoadMode(chunk) === 'async'))
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
    assert.ok(output.chunks.every((chunk) => output.placer.getLoadMode(chunk) === 'sync'))
})
