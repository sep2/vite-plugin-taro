import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { createLogger, createServer, type Logger, normalizePath, type Plugin, type ViteDevServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { runtimeReportEvent } from '../../../../runtime/mini/dev/hmr-protocol.ts'
import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import { createNativeDevRuntime } from '../../../tests/create-native-dev-runtime.ts'
import { publishSourceGeneration } from '../../../tests/publish-source-generation.ts'
import { packageRequire, resolveVptRuntime } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'
import type { MiniContract, RuntimeContract } from '../mini-contract.ts'
import { miniAppCapsuleId, miniPageCapsuleId } from '../module/module.ts'
import { createMiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevHost } from './dev-host.ts'
import { hmrInfoFileName } from './hmr-files.ts'
import type { HmrInfo, RuntimeReport } from './hmr-protocol.ts'
import type { BundledDev } from './mini-dev-options.ts'
import { createDevtoolsHmrMode, devtoolsPatchesFileName } from './modes/devtools/devtools-hmr-mode.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
// Instrumented DevEngine rebuilds can exceed the previous 10-second polling limit under the full coverage suite.
// Observations still require the actual published file, rather than sleeping for a fixed settle period.
const maximumWaitAttempts = 1_200
const stableReadCount = 10
const waitIntervalMilliseconds = 25
const pageCapsuleFileName = 'pages/home/index-capsule.js'

const runtimeModules = {
    devtoolsHmrRuntime: resolveVptRuntime('wx/dev/devtools-runtime'),
    interpreterHmrRuntime: resolveVptRuntime('wx/dev/interpreter-runtime')
} satisfies RuntimeContract

type DevFixture = Readonly<{
    close: () => Promise<void>
    restart: () => Promise<void>
    outDir: string
    infoPath: string
    appStylePath: string
    bundledDev: BundledDev
    pagePath: string
    patchesPath: string
    readJavaScript: () => Promise<readonly string[]>
    server: ViteDevServer
}>

function createOptions(): VptOptions {
    return {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index'
            }
        ],
        appJson: {},
        projectConfigJson: {
            appid: 'dev-fixture'
        }
    }
}

function createInterpreterOptions(): VptOptions {
    return {
        ...createOptions(),
        hmr: { mode: 'interpreter' }
    }
}

function createRebuildOptions(): VptOptions {
    return {
        ...createOptions(),
        hmr: { mode: 'rebuild' }
    }
}

function renderPage(marker: string): string {
    return `
        import { View } from '@tarojs/components'
        import { suffix } from './suffix'

        export default function Home() {
            return <View>{${JSON.stringify(marker)} + suffix}</View>
        }
    `
}

async function startDevFixture(
    logger: Logger,
    host: string,
    options: VptOptions,
    bundleOutput: 'memory' | 'capsule' | 'disk',
    publicAsset?: { fileName: string; source: string },
    initialSources?: Readonly<Record<string, string>>,
    cssCodeSplit?: boolean
): Promise<DevFixture> {
    const persistedBundleFiles = bundleOutput === 'capsule' ? [pageCapsuleFileName] : []
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-dev-test-'))
    const outDir = path.join(root, 'dist')
    const oldDirectory = path.join(outDir, 'obsolete/nested')
    await mkdir(oldDirectory, { recursive: true })
    const directoryInode = (await stat(oldDirectory)).ino
    const oldFile = path.join(oldDirectory, 'old.js')
    await writeFile(oldFile, 'previous dev session')
    const oldAppStyle = path.join(outDir, 'app.wxss')
    const oldPageShell = path.join(outDir, 'pages/home/index.js')
    const oldPatchFile = path.join(outDir, devtoolsPatchesFileName)
    await mkdir(path.dirname(oldPageShell), { recursive: true })
    await mkdir(path.dirname(oldPatchFile), { recursive: true })
    await writeFile(oldAppStyle, 'previous App stylesheet')
    await writeFile(oldPageShell, 'previous Page shell')
    await writeFile(oldPatchFile, 'previous patch dependency')
    const projectConfigPath = path.join(outDir, 'project.config.json')
    const projectPrivateConfigPath = path.join(outDir, 'project.private.config.json')
    await writeFile(projectConfigPath, 'previous project config')
    await writeFile(projectPrivateConfigPath, 'previous private config')
    const pagePath = path.join(root, 'src/pages/home/index.tsx')
    await mkdir(path.dirname(pagePath), { recursive: true })
    await writeFile(
        path.join(root, 'src/app.tsx'),
        `
            import type { PropsWithChildren } from 'react'

            export default function App({ children }: PropsWithChildren) {
                return children
            }
        `
    )
    await writeFile(path.join(path.dirname(pagePath), 'suffix.ts'), 'export const suffix = "";\n')
    await writeFile(pagePath, renderPage('initial page marker'))
    for (const [fileName, source] of Object.entries(initialSources ?? {})) {
        const filePath = path.join(root, fileName)
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, source)
    }
    if (publicAsset) {
        const assetPath = path.join(root, 'public', publicAsset.fileName)
        await mkdir(path.dirname(assetPath), { recursive: true })
        await writeFile(assetPath, publicAsset.source)
    }

    // Each complete build replaces this fixture-local snapshot; HMR assertions do not need physical runtime bundles.
    let javaScriptOutput: readonly string[] = []
    const createFixtureServer = () =>
        createServer({
            root,
            configFile: false,
            logLevel: 'silent',
            customLogger: logger,
            plugins: [
                vpt(options),
                {
                    name: 'test:capsule-layout',
                    configureServer(server) {
                        // Capture before Mini's post-ordered host installation, then check again after every configure hook.
                        const bundledDev = requireBundledDev(server.environments.client.bundledDev)
                        const original = bundledDev.getRolldownOptions
                        return () => {
                            assert.equal(
                                bundledDev.getRolldownOptions,
                                original,
                                'Vite must retain its options factory'
                            )
                        }
                    },
                    generateBundle: {
                        order: 'post',
                        handler(_output, bundle) {
                            const app = bundle['app-capsule.js']
                            const page = bundle[pageCapsuleFileName]
                            assert.ok(app?.type === 'chunk' && page?.type === 'chunk')
                            assert.ok(app.moduleIds.includes(normalizePath(path.join(root, 'src/app.tsx'))))
                            assert.ok(app.moduleIds.includes(miniAppCapsuleId))
                            assert.ok(page.moduleIds.includes(normalizePath(pagePath)))
                            assert.ok(page.moduleIds.includes(`${miniPageCapsuleId}?route=pages%2Fhome%2Findex`))
                            assert.match(page.code, /resolvePageComponent\([`"']src\/pages\/home\/index\.tsx[`"']/)
                            assert.ok(bundle['app.js'])
                            assert.ok(bundle['pages/home/index.js'])
                            javaScriptOutput = Object.values(bundle).flatMap((item) =>
                                item.type === 'chunk' ? [item.code] : []
                            )
                            if (bundleOutput !== 'disk') {
                                // Only the directory-preservation case needs a complete physical project. Capsule cases keep
                                // their real write/read assertions without also rewriting unrelated vendor and template files.
                                for (const fileName of Object.keys(bundle)) {
                                    if (!persistedBundleFiles.includes(fileName)) {
                                        delete bundle[fileName]
                                    }
                                }
                            }
                        }
                    }
                }
            ],
            build: {
                outDir,
                cssCodeSplit
            },
            server: {
                host,
                port: 0,
                strictPort: true
            }
        })

    // Restarts replace the server with fresh plugin instances, just like restarting the Vite process from its config file.
    let server = await createFixtureServer()
    try {
        assert.equal(await readFile(oldAppStyle, 'utf8'), 'previous App stylesheet')
        assert.equal(await readFile(oldPageShell, 'utf8'), 'previous Page shell')
        assert.equal(await readFile(oldPatchFile, 'utf8'), 'previous patch dependency')
        assert.equal(await readFile(oldFile, 'utf8'), 'previous dev session')
        assert.equal(await readFile(projectConfigPath, 'utf8'), 'previous project config')
        assert.equal(await readFile(projectPrivateConfigPath, 'utf8'), 'previous private config')
        assert.equal((await stat(oldDirectory)).ino, directoryInode, 'Startup must preserve watched directories')
        await server.listen()
        // listen() binds before its metadata transaction finishes; the App marker is the completed baseline boundary.
        await waitForFile(oldAppStyle, (source) => source.includes('vpt-build:'), maximumWaitAttempts)
        assert.equal(await readExistingFile(oldFile), undefined, 'Initial output must remove obsolete files')
    } catch (error) {
        await server.close()
        await rm(root, { force: true, recursive: true })
        throw error
    }

    return {
        get server() {
            return server
        },
        outDir,
        get bundledDev() {
            return requireBundledDev(server.environments.client.bundledDev)
        },
        restart: async () => {
            await server.close()
            server = await createFixtureServer()
            await server.listen()
        },
        pagePath,
        appStylePath: path.join(outDir, 'app.wxss'),
        infoPath: path.join(outDir, hmrInfoFileName),
        patchesPath: path.join(outDir, devtoolsPatchesFileName),
        readJavaScript: async () => (bundleOutput === 'disk' ? readJavaScriptOutput(outDir) : javaScriptOutput),
        close: async () => {
            try {
                await server.close()
                if (bundleOutput !== 'disk') {
                    // Check after shutdown drains atomic writes. Even recovery builds must respect the selected file set.
                    const allowedFiles = new Set([
                        'app.wxss',
                        'assets/global.wxss',
                        ...options.pages.map((page) => `${page.path}.wxss`),
                        'project.config.json',
                        'project.private.config.json',
                        hmrInfoFileName,
                        devtoolsPatchesFileName,
                        ...persistedBundleFiles
                    ])
                    const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
                        .filter((entry) => entry.isFile())
                        .map((entry) => normalizePath(path.relative(outDir, path.join(entry.parentPath, entry.name))))
                    assert.deepEqual(
                        files.filter((fileName) => !allowedFiles.has(fileName)),
                        [],
                        'Only explicitly selected bundle files, host styles and HMR metadata may reach disk'
                    )
                }
            } finally {
                await rm(root, { force: true, recursive: true })
            }
        }
    }
}

async function readExistingFile(fileName: string): Promise<string | undefined> {
    try {
        return await readFile(fileName, 'utf8')
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return undefined
        }
        throw error
    }
}

async function waitForFile(
    fileName: string,
    predicate: (source: string) => boolean,
    attemptsRemaining: number
): Promise<string> {
    const source = await readExistingFile(fileName)
    if (source !== undefined && predicate(source)) {
        return source
    }
    if (attemptsRemaining === 0) {
        assert.fail(`Timed out waiting for ${fileName}`)
    }
    await delay(waitIntervalMilliseconds)
    return waitForFile(fileName, predicate, attemptsRemaining - 1)
}

async function readJavaScriptOutput(directory: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { withFileTypes: true })
    const sources = await Promise.all(
        entries.map(async (entry): Promise<readonly string[]> => {
            const entryPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                return readJavaScriptOutput(entryPath)
            }
            if (entry.isFile() && path.extname(entry.name) === '.js') {
                return [await readFile(entryPath, 'utf8')]
            }
            return []
        })
    )
    return sources.flat()
}

async function waitForJavaScriptOutput(fixture: DevFixture, marker: string, attemptsRemaining: number): Promise<void> {
    const sources = await fixture.readJavaScript()
    if (sources.some((source) => source.includes(marker))) {
        return
    }
    if (attemptsRemaining === 0) {
        assert.fail(`Timed out waiting for JavaScript output containing ${marker}`)
    }
    await delay(waitIntervalMilliseconds)
    return waitForJavaScriptOutput(fixture, marker, attemptsRemaining - 1)
}

async function waitForStableFile(
    fileName: string,
    previousSource: string,
    stableReadsRemaining: number,
    attemptsRemaining: number
): Promise<string> {
    if (attemptsRemaining === 0) {
        assert.fail(`Timed out waiting for stable output: ${fileName}`)
    }
    await delay(waitIntervalMilliseconds)
    const source = await readExistingFile(fileName)
    if (source === undefined || source !== previousSource) {
        return waitForStableFile(fileName, source ?? previousSource, stableReadCount, attemptsRemaining - 1)
    }
    if (stableReadsRemaining === 1) {
        return source
    }
    return waitForStableFile(fileName, source, stableReadsRemaining - 1, attemptsRemaining - 1)
}

async function waitForCondition(predicate: () => boolean, attemptsRemaining: number): Promise<void> {
    if (predicate()) {
        return
    }
    if (attemptsRemaining === 0) {
        assert.fail('Timed out waiting for development host state')
    }
    await delay(waitIntervalMilliseconds)
    return waitForCondition(predicate, attemptsRemaining - 1)
}

function isBundledDev(value: unknown): value is BundledDev {
    return (
        typeof value === 'object' &&
        value !== null &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function' &&
        'listen' in value &&
        typeof value.listen === 'function' &&
        'triggerBundleRegenerationIfStale' in value &&
        typeof value.triggerBundleRegenerationIfStale === 'function'
    )
}

function requireBundledDev(value: unknown): BundledDev {
    if (!isBundledDev(value)) {
        throw new Error('Expected the WX bundled development adapter')
    }
    return value
}

function parseHmrInfo(source: string): HmrInfo {
    const prefix = 'module.exports = Object.freeze('
    const suffix = ');\n'
    assert.ok(source.startsWith(prefix) && source.endsWith(suffix))
    return JSON.parse(source.slice(prefix.length, -suffix.length)) as HmrInfo
}

async function sendRuntimeReport(info: HmrInfo, report: RuntimeReport): Promise<void> {
    const socket = await openHmrSocket(info)
    socket.send(JSON.stringify({ type: 'custom', event: runtimeReportEvent, data: report }))
    await delay(0)
    socket.close()
}

type ViteSocketEnvelope = Readonly<{
    type: string
    event?: string
    data?: InterpreterServerMessage
}>

async function openHmrSocket(info: HmrInfo): Promise<WebSocket> {
    const socket = new WebSocket(info.endpoint, ['vite-hmr'])
    const opened = Promise.withResolvers<void>()
    socket.addEventListener('open', () => opened.resolve(), { once: true })
    socket.addEventListener('error', () => opened.reject(new Error('Interpreter WebSocket failed to open.')), {
        once: true
    })
    await opened.promise
    return socket
}

function waitForInterpreterMessage(socket: WebSocket): Promise<InterpreterServerMessage> {
    const result = Promise.withResolvers<InterpreterServerMessage>()
    const receive = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') {
            return
        }
        const envelope = JSON.parse(event.data) as ViteSocketEnvelope
        if (envelope.type === 'custom' && envelope.event === interpreterServerEvent && envelope.data) {
            socket.removeEventListener('message', receive)
            result.resolve(envelope.data)
        }
    }
    socket.addEventListener('message', receive)
    return result.promise
}

test('rejects a server without Vite bundled development ownership', async (context) => {
    const contract = {
        options: createOptions(),
        styles: {
            appFileName: 'app.wxss',
            globalFileName: 'assets/global.wxss'
        }
    } satisfies Pick<MiniContract, 'options' | 'styles'>
    const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        // Ownership validation needs no watcher or dependency cache in the real workspace.
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { watch: null }
    })
    context.after(() => server.close())

    await assert.rejects(
        () =>
            createMiniDevHost({
                server: server,
                contract: contract,
                styles: createMiniStylePlugin(contract, createMiniStyleEntries(import.meta.filename, [])),
                hmrMode: createDevtoolsHmrMode(runtimeModules.devtoolsHmrRuntime)
            }),
        /Vite did not create the Mini Program bundled-development environment/
    )
})

test('rejects startup without removing the last complete output on failure', async () => {
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-output-failure-test-'))
    const pagePath = path.join(root, 'src/pages/home/index.tsx')
    await mkdir(path.dirname(pagePath), { recursive: true })
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App() { return null }\n')
    await writeFile(path.join(path.dirname(pagePath), 'suffix.ts'), 'export const suffix = "";\n')
    await writeFile(pagePath, renderPage('initial output failure'))
    const oldOutput = path.join(root, 'dist/old.js')
    const projectConfig = path.join(root, 'dist/project.config.json')
    const projectPrivateConfig = path.join(root, 'dist/project.private.config.json')
    await mkdir(path.dirname(oldOutput), { recursive: true })
    await writeFile(oldOutput, 'previous successful output')
    await writeFile(projectConfig, 'previous project config')
    await writeFile(projectPrivateConfig, 'previous private config')
    const failure = new Error('expected complete-output failure')
    const failOutput: Plugin = {
        name: 'test:fail-complete-output',
        generateBundle() {
            throw failure
        }
    }
    // This mutable journal proves the reducer logs the same output failure observed by startup.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        customLogger: logger,
        plugins: [failOutput, vpt(createOptions())],
        build: { outDir: path.join(root, 'dist') },
        server: { host: '127.0.0.1', port: 0, strictPort: true }
    })

    try {
        await assert.rejects(() => server.listen(), /expected complete-output failure/)
        assert.match(errors.join('\n'), /wx dev build failed/)
        assert.equal(await readFile(oldOutput, 'utf8'), 'previous successful output')
        assert.equal(await readFile(projectConfig, 'utf8'), 'previous project config')
        assert.equal(await readFile(projectPrivateConfig, 'utf8'), 'previous private config')
    } finally {
        await server.close()
        await rm(root, { force: true, recursive: true })
    }
})

test('patches a bundled utility without rewriting its Page capsule or rotating the App', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'capsule')
    context.after(fixture.close)
    const infoSource = await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    const info = parseHmrInfo(infoSource)
    const appStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source.includes(info.buildId),
        maximumWaitAttempts
    )
    const capsulePath = path.join(fixture.outDir, pageCapsuleFileName)
    const originalCapsule = await readFile(capsulePath, 'utf8')
    await publishSourceGeneration(
        path.join(path.dirname(fixture.pagePath), 'suffix.ts'),
        'export const suffix = "utility edit";\n'
    )
    await waitForFile(fixture.patchesPath, (source) => source.includes('utility edit'), maximumWaitAttempts)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle)
    assert.equal(await readFile(capsulePath, 'utf8'), originalCapsule)
})

for (const cssCodeSplit of [true, false]) {
    test(`publishes styles before patches and clears removed imports with cssCodeSplit=${cssCodeSplit}`, async (context) => {
        const fixture = await startDevFixture(
            createLogger('silent'),
            '127.0.0.1',
            createOptions(),
            'memory',
            undefined,
            undefined,
            cssCodeSplit
        )
        context.after(fixture.close)
        const infoSource = await readFile(fixture.infoPath, 'utf8')
        const appStyle = await readFile(fixture.appStylePath, 'utf8')
        const globalPath = path.join(fixture.outDir, 'assets/global.wxss')
        const initialGlobalCss = await readFile(globalPath, 'utf8')
        const stylePath = path.join(path.dirname(fixture.pagePath), 'index.css')
        const pagePath = path.join(fixture.outDir, 'pages/home/index.wxss')
        const outputPath = cssCodeSplit ? pagePath : globalPath
        const unchangedPath = cssCodeSplit ? globalPath : pagePath
        const unchangedInode = (await stat(unchangedPath)).ino
        assert.equal(await readFile(pagePath, 'utf8'), '')

        await writeFile(stylePath, '.page-local { padding: 4px; }')
        await publishSourceGeneration(fixture.pagePath, `import './index.css';\n${renderPage('page CSS added')}`)
        await waitForFile(fixture.patchesPath, (source) => source.includes('page CSS added'), maximumWaitAttempts)
        const css = await readFile(outputPath, 'utf8')
        assert.match(css, /\.page-local\s*\{\s*padding:\s*4rpx/)
        assert.equal(css.includes('.h5-span'), !cssCodeSplit)
        assert.equal((await stat(unchangedPath)).ino, unchangedInode)

        await publishSourceGeneration(fixture.pagePath, renderPage('page CSS removed'))
        await waitForFile(fixture.patchesPath, (source) => source.includes('page CSS removed'), maximumWaitAttempts)
        assert.equal(await readFile(pagePath, 'utf8'), '')
        assert.equal(await readFile(globalPath, 'utf8'), initialGlobalCss)
        assert.equal((await stat(unchangedPath)).ino, unchangedInode)
        assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource)
        assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle)
    })
}

// TODO: Re-enable once cold imports select the latest acknowledged factory instead of the disk baseline.
// https://github.com/sep2/vite-plugin-taro/issues/32
/*
test('first native lazy import uses edits acknowledged before its physical chunk loaded', async (context) => {
    const lazyModuleId = 'src/pages/home/lazy-feature.ts'
    const renderLazy = (marker: string) => `
        export default function LazyFeature() { return ${JSON.stringify(marker)} }
        if (import.meta.hot) { import.meta.hot.accept() }
    `
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'disk', undefined, {
        'src/pages/home/index.tsx': `${renderPage('lazy import fixture')}\nexport const loadLazyEntry = () => import('./lazy-entry')`,
        'src/pages/home/lazy-entry.ts': `export const loadLazy = () => import('./lazy-feature')`,
        [lazyModuleId]: renderLazy('initial lazy generation')
    })
    context.after(fixture.close)
    const infoSource = await readFile(fixture.infoPath, 'utf8')
    const info = parseHmrInfo(infoSource)
    const appStyle = await readFile(fixture.appStylePath, 'utf8')
    const runtime = createNativeDevRuntime(fixture.outDir, info)
    // Load only the dynamic-import caller so the assertion exercises generated import() code, not a hand-written resolver.
    const entry: unknown = await runtime.run(`System.import('common/lazy-entry.js')`)
    assert.ok(entry && typeof entry === 'object' && 'loadLazy' in entry && typeof entry.loadLazy === 'function')
    const lazyPath = path.join(path.dirname(fixture.pagePath), 'lazy-feature.ts')
    assert.equal(runtime.run(`globalThis.__rolldown_runtime__.isExecuted(${JSON.stringify(lazyModuleId)})`), false)

    // Both edits are installed and acknowledged while the lazy chunk is still cold; replaying only the first is also stale.
    for (const marker of ['intermediate lazy generation', 'latest lazy generation']) {
        await publishSourceGeneration(lazyPath, renderLazy(marker))
        const patches = await waitForFile(fixture.patchesPath, (source) => source.includes(marker), maximumWaitAttempts)
        const seq = [...patches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1])).at(-1)
        assert.ok(seq)
        const previousReportCount = runtime.reports.length
        runtime.applyPatches(patches)
        assert.equal(runtime.reports.length, previousReportCount + 1)
        assert.deepEqual(runtime.reports.at(-1), { buildId: info.buildId, kind: 'applied', seq })
        assert.equal(runtime.run(`globalThis.__rolldown_runtime__.isExecuted(${JSON.stringify(lazyModuleId)})`), false)
        await sendRuntimeReport(info, { buildId: info.buildId, kind: 'applied', seq })
        // Allow the host's receipt-conflation window to prune this generation before the next edit.
        await delay(50)
    }

    // The emitted caller goes through native require.async and SystemJS before returning its lazy module namespace.
    const namespace: unknown = await entry.loadLazy()
    assert.ok(
        namespace && typeof namespace === 'object' && 'default' in namespace && typeof namespace.default === 'function'
    )
    assert.equal(
        namespace.default(),
        'latest lazy generation',
        'First lazy import must not resurrect the original disk exports'
    )
    assert.strictEqual(await entry.loadLazy(), namespace, 'Repeated imports must reuse the current lazy namespace')
    assert.doesNotMatch(JSON.stringify(runtime.reports), /"kind":"rebuild"/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle)
})

*/

test('applies native HMR once to an executed lazy module and reports a failed patch', async (context) => {
    const lazyModuleId = 'src/pages/home/lazy-feature.ts'
    const renderLazy = (marker: string) => `
        globalThis.__lazyExecutions += 1
        export default function LazyFeature() { return ${JSON.stringify(marker)} }
        if (import.meta.hot) {
            import.meta.hot.accept((next) => { globalThis.__lazyAccepted.push(next.default()) })
        }
    `
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'disk', undefined, {
        'src/pages/home/index.tsx': `${renderPage('warm lazy fixture')}\nexport const loadLazyEntry = () => import('./lazy-entry')`,
        'src/pages/home/lazy-entry.ts': `export const loadLazy = () => import('./lazy-feature')`,
        [lazyModuleId]: renderLazy('initial warm generation')
    })
    context.after(fixture.close)
    const infoSource = await readFile(fixture.infoPath, 'utf8')
    const info = parseHmrInfo(infoSource)
    const appStyle = await readFile(fixture.appStylePath, 'utf8')
    const runtime = createNativeDevRuntime(fixture.outDir, info)
    const lazyPath = path.join(path.dirname(fixture.pagePath), 'lazy-feature.ts')
    const compilerOptions = await fixture.bundledDev.getRolldownOptions()
    // Compiler identities are relative to its cwd, which differs from this disposable fixture's Vite root.
    const runtimeModuleId = normalizePath(path.relative(compilerOptions.cwd ?? process.cwd(), lazyPath))
    // These VM-local journals distinguish module execution from accept callbacks and detect duplicate patch application.
    runtime.run('globalThis.__lazyExecutions = 0; globalThis.__lazyAccepted = []')
    const entry: unknown = await runtime.run(`System.import('common/lazy-entry.js')`)
    assert.ok(entry && typeof entry === 'object' && 'loadLazy' in entry && typeof entry.loadLazy === 'function')
    const namespace: unknown = await entry.loadLazy()
    assert.ok(
        namespace && typeof namespace === 'object' && 'default' in namespace && typeof namespace.default === 'function'
    )
    assert.equal(namespace.default(), 'initial warm generation')
    assert.strictEqual(await entry.loadLazy(), namespace, 'Repeated initial imports must reuse the native namespace')
    assert.equal(runtime.run('globalThis.__lazyExecutions'), 1)
    assert.equal(runtime.run(`globalThis.__rolldown_runtime__.isExecuted(${JSON.stringify(runtimeModuleId)})`), true)

    const markers = ['first warm update', 'second warm update']
    for (const [index, marker] of markers.entries()) {
        const seq = index + 1
        await publishSourceGeneration(lazyPath, renderLazy(marker))
        const patches = await waitForFile(fixture.patchesPath, (source) => source.includes(marker), maximumWaitAttempts)
        runtime.applyPatches(patches)
        assert.deepEqual(runtime.reports.at(-1), { buildId: info.buildId, kind: 'applied', seq })
        assert.equal(
            runtime.run(`globalThis.__rolldown_runtime__.loadExports(${JSON.stringify(runtimeModuleId)}).default()`),
            marker
        )
        assert.equal(runtime.run('globalThis.__lazyExecutions'), seq + 1)
        assert.equal(runtime.run('JSON.stringify(globalThis.__lazyAccepted)'), JSON.stringify(markers.slice(0, seq)))

        runtime.applyPatches(patches)
        // Another Page may replay the delivery and repeat its ACK, but must not execute the module or accept callback again.
        assert.deepEqual(runtime.reports.at(-1), { buildId: info.buildId, kind: 'applied', seq })
        assert.equal(runtime.run('globalThis.__lazyExecutions'), seq + 1)
        assert.equal(runtime.run('JSON.stringify(globalThis.__lazyAccepted)'), JSON.stringify(markers.slice(0, seq)))
        await sendRuntimeReport(info, { buildId: info.buildId, kind: 'applied', seq })
        await delay(50)
    }
    assert.doesNotMatch(JSON.stringify(runtime.reports), /"kind":"rebuild"/)

    // A failing native installer must report recovery and close its socket instead of acknowledging a partial patch.
    const warning = context.mock.method(console, 'warn', () => {})
    runtime.applyPatches(`module.exports = {
        buildId: ${JSON.stringify(info.buildId)},
        patches: [{ seq: 3, changedIds: [], factory() { throw new Error('fixture patch failed') } }]
    }`)
    assert.deepEqual(runtime.reports.at(-1), {
        buildId: info.buildId,
        kind: 'rebuild',
        reason: 'fixture patch failed'
    })
    assert.equal(warning.mock.callCount(), 1)
    assert.match(String(warning.mock.calls[0]!.arguments[1]), /fixture patch failed/)
    const reportCount = runtime.reports.length
    runtime.applyPatches(`module.exports = { buildId: ${JSON.stringify(info.buildId)}, patches: [] }`)
    assert.equal(runtime.reports.length, reportCount, 'Failed installation must leave the socket closed')
    assert.equal(runtime.run('globalThis.__lazyExecutions'), 3)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle)
})

test('keeps last valid Page CSS and publishes contiguous JavaScript patches through native conversion repair', async (context) => {
    // Record diagnostics to verify native CSS errors are reported without rejecting the host publication.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions(), 'memory', undefined, {
        'src/pages/home/index.tsx': `import './index.css'\n${renderPage('styled baseline')}`,
        'src/pages/home/index.css': '.page-local { padding: 4px; }'
    })
    context.after(fixture.close)
    const infoSource = await readFile(fixture.infoPath, 'utf8')
    const appStyle = await readFile(fixture.appStylePath, 'utf8')
    const stylePath = path.join(path.dirname(fixture.pagePath), 'index.css')
    const outputPath = path.join(fixture.outDir, 'pages/home/index.wxss')

    await publishSourceGeneration(stylePath, '.page-local { padding: 8px; }')
    const firstPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('{seq:'),
        maximumWaitAttempts
    )
    const lastValidCss = await readFile(outputPath, 'utf8')
    assert.match(lastValidCss, /padding:\s*8rpx/)
    assert.deepEqual(
        [...firstPatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1])),
        [1]
    )

    const invalidCss = '.page-local { padding: 12px;'
    await publishSourceGeneration(stylePath, invalidCss)
    const invalidCssPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source !== firstPatches,
        maximumWaitAttempts
    )
    assert.ok(
        errors.some((message) =>
            /Native CSS update failed.*pages\/home\/index\.wxss[\s\S]*Unclosed block/.test(message)
        )
    )
    assert.equal(
        await readFile(outputPath, 'utf8'),
        lastValidCss,
        'Failed conversion must retain the last valid stylesheet without publishing failed CSS'
    )
    assert.deepEqual(
        [...invalidCssPatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1])),
        [1, 2],
        'A native CSS error must not discard the valid JavaScript patch'
    )
    assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle)

    await publishSourceGeneration(
        fixture.pagePath,
        `import './index.css'\n${renderPage('updated while CSS is invalid')}`
    )
    const javaScriptPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('updated while CSS is invalid'),
        maximumWaitAttempts
    )
    assert.equal(await readFile(outputPath, 'utf8'), lastValidCss)
    assert.deepEqual(
        [...javaScriptPatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1])),
        [1, 2, 3]
    )

    await publishSourceGeneration(stylePath, '.page-local { padding: 16px; }')
    const recoveredPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source !== javaScriptPatches,
        maximumWaitAttempts
    )
    assert.match(await readFile(outputPath, 'utf8'), /padding:\s*16rpx/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), infoSource, 'Repair must not rotate the App build identity')
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), appStyle, 'Repair must not force an App reload')
    const sequences = [...recoveredPatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1]))
    assert.deepEqual(sequences, [1, 2, 3, 4], 'Repair must preserve the patch sequence without forcing a rebuild')
    assert.ok(errors.every((message) => !message.includes('HMR publish failed')))
})

test('coalesces one full-file save into one wx patch', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)

    await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)

    await writeFile(fixture.pagePath, renderPage('one source generation'))
    const publishedPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('one source generation'),
        maximumWaitAttempts
    )
    const stablePatches = await waitForStableFile(
        fixture.patchesPath,
        publishedPatches,
        stableReadCount,
        maximumWaitAttempts
    )
    const sequences = [...stablePatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1]))

    assert.deepEqual(sequences, [1])
    assert.doesNotMatch(stablePatches, /window\.\$RefreshReg\$/)
})

test('publishes and acknowledges cumulative wx patches without replacing the App runtime', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)

    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    const info = parseHmrInfo(initialInfoSource)
    const initialAppStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source.includes(info.buildId),
        maximumWaitAttempts
    )

    await publishSourceGeneration(fixture.pagePath, renderPage('first hot generation'))
    const firstPublishedPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('first hot generation'),
        maximumWaitAttempts
    )
    const firstPatches = await waitForStableFile(
        fixture.patchesPath,
        firstPublishedPatches,
        stableReadCount,
        maximumWaitAttempts
    )
    const sequences = [...firstPatches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1]))
    assert.ok(sequences.length > 0)

    await sendRuntimeReport(info, {
        buildId: info.buildId,
        kind: 'applied',
        seq: Math.max(...sequences)
    })

    // Runtime receipts are intentionally conflated for one short quiet window before the next source generation is admitted.
    await delay(50)
    await publishSourceGeneration(fixture.pagePath, renderPage('second hot generation'))
    const secondPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('second hot generation'),
        maximumWaitAttempts
    )

    assert.doesNotMatch(secondPatches, /first hot generation/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), initialInfoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), initialAppStyle)
})

test('the Mini DevEngine emits public assets with their stable paths on startup and restart', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'disk', {
        fileName: 'icons/home.png',
        source: 'tab icon'
    })
    context.after(fixture.close)
    const icon = path.join(fixture.outDir, 'icons/home.png')
    assert.equal(await readFile(icon, 'utf8'), 'tab icon')

    await fixture.restart()
    assert.equal(await readFile(icon, 'utf8'), 'tab icon')
})

test('a Vite restart removes obsolete files and publishes a new baseline before subsequent patches', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'disk')
    context.after(fixture.close)
    const initial = await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    const sentinel = path.join(fixture.outDir, 'obsolete/nested/old.js')
    await writeFile(sentinel, 'obsolete file from the previous session')
    await fixture.restart()
    const next = parseHmrInfo(await waitForFile(fixture.infoPath, (source) => source !== initial, maximumWaitAttempts))
    assert.equal(await readExistingFile(sentinel), undefined)
    await waitForFile(fixture.appStylePath, (source) => source.includes(next.buildId), maximumWaitAttempts)
    await publishSourceGeneration(fixture.pagePath, renderPage('edit after server restart'))
    const patches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('edit after server restart'),
        maximumWaitAttempts
    )
    assert.match(patches, /\{seq: 1,/)
    assert.equal(parseHmrInfo(await readFile(fixture.infoPath, 'utf8')).buildId, next.buildId)
})

test('startup rebuilds after one published patch even when its complete history is retained', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)
    const info = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    )
    await publishSourceGeneration(fixture.pagePath, renderPage('applied before OPEN'))
    await waitForFile(fixture.patchesPath, (source) => source.includes('applied before OPEN'), maximumWaitAttempts)
    // No ACK was sent: retaining every patch must not turn startup into a replay optimization.
    await sendRuntimeReport(info, { buildId: info.buildId, kind: 'startup' })
    const freshInfo = parseHmrInfo(
        await waitForFile(
            fixture.infoPath,
            (source) => parseHmrInfo(source).buildId !== info.buildId,
            maximumWaitAttempts
        )
    )
    await waitForFile(fixture.appStylePath, (source) => source.includes(freshInfo.buildId), maximumWaitAttempts)
    await waitForJavaScriptOutput(fixture, 'applied before OPEN', maximumWaitAttempts)
    assert.doesNotMatch(await readFile(fixture.patchesPath, 'utf8'), /\{seq:/)

    // Baseline-only startup and delayed startup from the previous build must not cause a rebuild loop.
    await sendRuntimeReport(freshInfo, { buildId: freshInfo.buildId, kind: 'startup' })
    await sendRuntimeReport(freshInfo, { buildId: info.buildId, kind: 'startup' })
    await delay(100)
    assert.equal(parseHmrInfo(await readFile(fixture.infoPath, 'utf8')).buildId, freshInfo.buildId)
})

test('Compile after two acknowledged edits rebuilds the baseline and resumes HMR', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)
    const initialSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    const info = parseHmrInfo(initialSource)

    for (const seq of [1, 2]) {
        await publishSourceGeneration(fixture.pagePath, renderPage(`compile regression edit ${seq}`))
        const patches = await waitForFile(
            fixture.patchesPath,
            (source) => source.includes(`compile regression edit ${seq}`),
            maximumWaitAttempts
        )
        assert.deepEqual(
            [...patches.matchAll(/\{seq: (\d+)/g)].map((match) => Number(match[1])),
            [seq]
        )
        await sendRuntimeReport(info, { buildId: info.buildId, kind: 'applied', seq })
        await delay(50)
    }

    // Compile creates a new App runtime instance from the unchanged baseline, not the previously acknowledged runtime.
    await sendRuntimeReport(info, { buildId: info.buildId, kind: 'startup' })
    const freshInfo = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source !== initialSource, maximumWaitAttempts)
    )
    await waitForFile(fixture.appStylePath, (source) => source.includes(freshInfo.buildId), maximumWaitAttempts)
    await waitForJavaScriptOutput(fixture, 'compile regression edit 2', maximumWaitAttempts)
    assert.doesNotMatch(await readFile(fixture.patchesPath, 'utf8'), /\{seq:/)

    await sendRuntimeReport(freshInfo, { buildId: freshInfo.buildId, kind: 'startup' })
    await publishSourceGeneration(fixture.pagePath, renderPage('HMR after Compile recovery'))
    const resumed = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('HMR after Compile recovery'),
        maximumWaitAttempts
    )
    assert.match(resumed, /\{seq: 1,/)
    assert.equal(parseHmrInfo(await readFile(fixture.infoPath, 'utf8')).buildId, freshInfo.buildId)
})

test('publishes interpreter source through Vite WebSocket', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createInterpreterOptions(), 'memory')
    context.after(fixture.close)

    const info = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source.includes('token='), maximumWaitAttempts)
    )
    assert.equal(await readExistingFile(fixture.patchesPath), undefined)

    const socket = await openHmrSocket(info)
    context.after(() => socket.close())
    const firstMessagePromise = waitForInterpreterMessage(socket)
    await publishSourceGeneration(fixture.pagePath, renderPage('first interpreted generation'))
    const firstMessage = await firstMessagePromise
    assert.equal(firstMessage.kind, 'patches')
    if (firstMessage.kind !== 'patches') {
        assert.fail('Expected interpreter patch source')
    }
    assert.match(firstMessage.patches.map(({ code }) => code).join('\n'), /first interpreted generation/)

    const firstSeq = firstMessage.patches.at(-1)?.seq
    assert.ok(firstSeq)

    socket.send(
        JSON.stringify({
            type: 'custom',
            event: runtimeReportEvent,
            data: { buildId: info.buildId, kind: 'applied', seq: firstSeq }
        })
    )
    await delay(0)

    const secondMessagePromise = waitForInterpreterMessage(socket)
    await publishSourceGeneration(fixture.pagePath, renderPage('second interpreted generation'))
    const secondMessage = await secondMessagePromise
    assert.equal(secondMessage.kind, 'patches')
    if (secondMessage.kind !== 'patches') {
        assert.fail('Expected interpreter patch source')
    }
    const secondSource = secondMessage.patches.map(({ code }) => code).join('\n')
    assert.match(secondSource, /second interpreted generation/)
    assert.doesNotMatch(secondSource, /first interpreted generation/)
    assert.equal(await readExistingFile(fixture.patchesPath), undefined)
})

test('rebuild mode replaces complete output without creating patch transport artifacts', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createRebuildOptions(), 'capsule')
    context.after(fixture.close)

    const initialAppStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source.includes('vpt-build:'),
        maximumWaitAttempts
    )
    assert.equal(await readExistingFile(fixture.infoPath), undefined)
    assert.equal(await readExistingFile(fixture.patchesPath), undefined)

    const marker = 'complete rebuild generation'
    await publishSourceGeneration(fixture.pagePath, renderPage(marker))
    const rebuiltAppStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source !== initialAppStyle,
        maximumWaitAttempts
    )
    await waitForJavaScriptOutput(fixture, marker, maximumWaitAttempts)
    assert.ok((await readFile(path.join(fixture.outDir, pageCapsuleFileName), 'utf8')).includes(marker))

    const javaScriptOutput = (await fixture.readJavaScript()).join('\n')
    assert.match(rebuiltAppStyle, /vpt-build:/)
    assert.doesNotMatch(javaScriptOutput, /hmr\/(?:info|patches)\.js/)
    assert.equal(await readExistingFile(fixture.infoPath), undefined)
    assert.equal(await readExistingFile(fixture.patchesPath), undefined)
})

test('regenerates native transport routes when a complete rebuild adds or removes lazy chunks', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createRebuildOptions(), 'disk')
    context.after(fixture.close)
    const transportPath = path.join(fixture.outDir, 'common/vpt/transport.js')
    assert.doesNotMatch(await readFile(transportPath, 'utf8'), /require\.async/)
    const initialAppStyle = await readFile(fixture.appStylePath, 'utf8')

    await writeFile(path.join(path.dirname(fixture.pagePath), 'lazy-feature.ts'), 'console.log("lazy feature loaded")')
    await publishSourceGeneration(fixture.pagePath, `${renderPage('added lazy route')}\nvoid import('./lazy-feature')`)
    // Disk reads can observe a partial asset write; inspect routes only after the transport's closing delimiter.
    const added = await waitForFile(
        transportPath,
        (code) => code.endsWith('};') && code.includes('lazy-feature.js'),
        maximumWaitAttempts
    )
    assert.match(added, /require\.async\("\.\.\/\.\.\/sub\/p_[a-f0-9]{8}\/common\/lazy-feature\.js"\)/)
    assert.doesNotMatch(added, /registerModule|case ["']common\/vpt\/transport\.js/)
    // The transport is intermediate output. Await both host publication and engine completion: onOutput admits the host's
    // asynchronous writes before the native build has finished. This test changes routes between builds, not during a build.
    await waitForFile(fixture.appStylePath, (source) => source !== initialAppStyle, maximumWaitAttempts)
    const engine = fixture.bundledDev._devEngine
    assert.ok(engine)
    await engine.ensureCurrentBuildFinish()

    await publishSourceGeneration(fixture.pagePath, renderPage('removed lazy route'))
    const removed = await waitForFile(
        transportPath,
        (code) => code.endsWith('};') && !code.includes('lazy-feature.js'),
        maximumWaitAttempts
    )
    assert.doesNotMatch(removed, /require\.async/)
})

test('prints physical project paths without compromising later patch publication', async (context) => {
    // This mutable list captures the physical DevTools project banner.
    const infos: string[] = []
    const logger = createLogger('silent')
    logger.info = (message) => {
        infos.push(message)
    }
    const fixture = await startDevFixture(logger, '0.0.0.0', createOptions(), 'memory')
    context.after(fixture.close)
    const info = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    )

    assert.match(info.endpoint, /^ws:\/\/127\.0\.0\.1:/)
    assert.equal(await fixture.bundledDev.triggerBundleRegenerationIfStale(), false)
    fixture.server.printUrls()
    assert.match(stripVTControlCharacters(infos.join('\n')), /Mini Program project.*\.\/dist/)
    // Temporarily vary only the presentation path to exercise root and parent-relative DevTools banners.
    const originalOutDir = fixture.server.config.build.outDir
    const originalConfigFile = fixture.server.config.configFile
    Reflect.set(fixture.server.config, 'configFile', path.join(fixture.server.config.root, 'vite.config.ts'))
    fixture.server.printUrls()
    Reflect.set(fixture.server.config, 'configFile', originalConfigFile)
    fixture.server.config.build.outDir = fixture.server.config.root
    fixture.server.printUrls()
    fixture.server.config.build.outDir = path.dirname(fixture.server.config.root)
    fixture.server.printUrls()
    fixture.server.config.build.outDir = originalOutDir
    const devToolsOutput = stripVTControlCharacters(infos.join('\n'))
    assert.match(devToolsOutput, /Mini Program project.*: \./)
    assert.match(devToolsOutput, /Mini Program project.*: \.\./)

    await publishSourceGeneration(fixture.pagePath, renderPage('healthy generation after invalid control traffic'))
    const patches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('healthy generation after invalid control traffic'),
        maximumWaitAttempts
    )
    assert.match(patches, /healthy generation after invalid control traffic/)
})

test('preserves live files and directory identities across patches and recovery builds', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions(), 'disk')
    context.after(fixture.close)
    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    const initialInfo = parseHmrInfo(initialInfoSource)
    await waitForFile(fixture.appStylePath, (source) => source.includes(initialInfo.buildId), maximumWaitAttempts)
    const obsoleteDirectory = path.join(fixture.outDir, 'obsolete/nested')
    await mkdir(obsoleteDirectory, { recursive: true })
    const directoryInode = (await stat(obsoleteDirectory)).ino
    const obsoleteFile = path.join(obsoleteDirectory, 'old.js')
    await writeFile(obsoleteFile, 'live session file')
    const initialFiles = (await readdir(fixture.outDir, { recursive: true })).sort()
    assert.ok(initialFiles.includes(path.join('common', 'bootstrap.js')), JSON.stringify(initialFiles))
    assert.ok(initialFiles.includes(path.join('common', 'vpt', 'transport.js')), JSON.stringify(initialFiles))
    assert.ok(initialFiles.includes(path.join('common', 'vpt', 'global.js')), JSON.stringify(initialFiles))

    await publishSourceGeneration(fixture.pagePath, renderPage('changed before complete build'))
    await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('changed before complete build'),
        maximumWaitAttempts
    )
    assert.equal(await readFile(obsoleteFile, 'utf8'), 'live session file', 'Patches must not clean output')
    assert.ok((await readFile(fixture.appStylePath, 'utf8')).includes(initialInfo.buildId))
    await sendRuntimeReport(initialInfo, {
        buildId: initialInfo.buildId,
        kind: 'rebuild',
        reason: 'verify stable physical paths'
    })
    const nextInfo = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source !== initialInfoSource, maximumWaitAttempts)
    )
    await waitForFile(fixture.appStylePath, (source) => source.includes(nextInfo.buildId), maximumWaitAttempts)
    assert.deepEqual((await readdir(fixture.outDir, { recursive: true })).sort(), initialFiles)
    assert.equal((await stat(obsoleteDirectory)).ino, directoryInode)
    assert.equal(await readFile(obsoleteFile, 'utf8'), 'live session file')
    await waitForJavaScriptOutput(fixture, 'changed before complete build', maximumWaitAttempts)
})

test('rotates build identity on a current rebuild report and rejects delayed old-session reports', async (context) => {
    // This mutable journal records the one full-build command admitted for the active runtime session.
    const infos: string[] = []
    const logger = createLogger('silent')
    logger.info = (message) => {
        infos.push(message)
    }
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)

    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    const initialInfo = parseHmrInfo(initialInfoSource)
    const initialAppStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source.includes(initialInfo.buildId),
        maximumWaitAttempts
    )

    await sendRuntimeReport(initialInfo, {
        buildId: 'stale-build',
        kind: 'rebuild',
        reason: 'must be ignored'
    })
    await delay(50)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), initialInfoSource)
    assert.doesNotMatch(infos.join('\n'), /must be ignored/)

    await sendRuntimeReport(initialInfo, {
        buildId: initialInfo.buildId,
        kind: 'rebuild',
        reason: 'runtime graph lost its boundary'
    })

    const nextInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source !== initialInfoSource,
        maximumWaitAttempts
    )
    const nextInfo = parseHmrInfo(nextInfoSource)
    const nextAppStyle = await waitForFile(
        fixture.appStylePath,
        (source) => source.includes(nextInfo.buildId),
        maximumWaitAttempts
    )

    assert.notEqual(nextInfo.buildId, initialInfo.buildId)
    assert.notEqual(nextAppStyle, initialAppStyle)
    assert.match(infos.join('\n'), /wx full rebuild required: runtime graph lost its boundary/)
    assert.equal(await readFile(fixture.patchesPath, 'utf8'), 'module.exports = undefined;\n')
    const engine = fixture.bundledDev._devEngine
    assert.ok(engine)
    await engine.ensureCurrentBuildFinish()

    await publishSourceGeneration(fixture.pagePath, renderPage('first generation in the new build'))
    const firstPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('first generation in the new build'),
        maximumWaitAttempts
    )
    assert.match(firstPatches, new RegExp(`buildId: ${JSON.stringify(nextInfo.buildId)}`))

    await sendRuntimeReport(nextInfo, {
        buildId: initialInfo.buildId,
        kind: 'applied',
        seq: Number.MAX_SAFE_INTEGER
    })
    await delay(50)

    await publishSourceGeneration(fixture.pagePath, renderPage('second generation in the new build'))
    const secondPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('second generation in the new build'),
        maximumWaitAttempts
    )

    assert.match(secondPatches, /first generation in the new build/)
    assert.match(secondPatches, /second generation in the new build/)
})

test('reports a failed physical patch transaction through the serialized host boundary', async (context) => {
    // This mutable journal captures the host-action failure after the initial build is already healthy.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)
    await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    const hmrDirectory = path.dirname(fixture.infoPath)

    await rm(hmrDirectory, { force: true, recursive: true })
    await writeFile(hmrDirectory, 'blocks atomic HMR publication')
    await publishSourceGeneration(fixture.pagePath, renderPage('physical publication failure'))
    await waitForCondition(
        () => errors.some((message) => message.includes('[vpt] wx HMR publish failed')),
        maximumWaitAttempts
    )

    await rm(hmrDirectory, { force: true })
    await mkdir(hmrDirectory, { recursive: true })
})

test('resumes wx patch publication after a transient syntax error', async (context) => {
    // This request-local trace proves the invalid generation reached the host before recovery is attempted.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions(), 'memory')
    context.after(fixture.close)

    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    // Test two complete editor generations; truncate/write event coalescing has its own regression above.
    await publishSourceGeneration(
        fixture.pagePath,
        `
            import { View } from '@tarojs/components'
            export default function Home() {
                return <View>invalid generation
            }
        `
    )
    await waitForCondition(
        () => errors.some((message) => message.includes('[vpt] wx HMR update failed')),
        maximumWaitAttempts
    )

    await publishSourceGeneration(fixture.pagePath, renderPage('recovered hot generation'))
    const recoveredPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('recovered hot generation'),
        maximumWaitAttempts
    )

    assert.match(recoveredPatches, /recovered hot generation/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), initialInfoSource)
})
