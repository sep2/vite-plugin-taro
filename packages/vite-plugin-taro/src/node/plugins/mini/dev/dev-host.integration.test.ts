import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { createLogger, createServer, type Logger, type Plugin, type ViteDevServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import { runtimeReportEvent } from '../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import { packageRequire } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'
import { createWxStylePlugin } from '../styles/plugins.ts'
import { createWxDevHost } from './dev-host.ts'
import { hmrInfoFileName } from './hmr-files.ts'
import type { HmrInfo, RuntimeReport } from './hmr-protocol.ts'
import { createDevtoolsHmrMode, devtoolsPatchesFileName } from './modes/devtools/devtools-hmr-mode.ts'
import type { BundledDev } from './wx-dev-options.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const maximumWaitAttempts = 400
const stableReadCount = 10
const waitIntervalMilliseconds = 25

type DevFixture = Readonly<{
    close: () => Promise<void>
    infoPath: string
    appStylePath: string
    bundledDev: BundledDev
    pagePath: string
    patchesPath: string
    server: ViteDevServer
}>

function createOptions(): VptOptions {
    return {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index',
                config: {}
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

function renderPage(marker: string): string {
    return `
        import { View } from '@tarojs/components'

        export default function Home() {
            return <View>${marker}</View>
        }
    `
}

/** Publishes one complete editor generation without exposing writeFile's intermediate truncation state to the watcher. */
async function publishSourceGeneration(filePath: string, source: string): Promise<void> {
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.txt`)
    try {
        await writeFile(temporaryPath, source)
        await rename(temporaryPath, filePath)
    } finally {
        await rm(temporaryPath, { force: true })
    }
}

async function startDevFixture(logger: Logger, host: string, options: VptOptions): Promise<DevFixture> {
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-dev-test-'))
    const outDir = path.join(root, 'dist')
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
    await writeFile(pagePath, renderPage('initial page marker'))

    const server = await createServer({
        root,
        configFile: false,
        customLogger: logger,
        plugins: vpt(options),
        build: {
            outDir
        },
        server: {
            host,
            port: 0,
            strictPort: true
        }
    })

    try {
        await server.listen()
    } catch (error) {
        await server.close()
        await rm(root, { force: true, recursive: true })
        throw error
    }

    return {
        server,
        bundledDev: requireBundledDev(server.environments.client.bundledDev),
        pagePath,
        appStylePath: path.join(outDir, 'app.wxss'),
        infoPath: path.join(outDir, hmrInfoFileName),
        patchesPath: path.join(outDir, devtoolsPatchesFileName),
        close: async () => {
            try {
                await server.close()
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
    const server = await createServer({
        configFile: false,
        customLogger: createLogger('silent')
    })
    context.after(() => server.close())

    await assert.rejects(
        () =>
            createWxDevHost({
                server: server,
                options: createOptions(),
                styles: createWxStylePlugin([import.meta.filename]),
                hmrMode: createDevtoolsHmrMode()
            }),
        /Vite did not create the wx bundled-development environment/
    )
})

test('rejects startup with the original complete-output failure', async () => {
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-output-failure-test-'))
    const pagePath = path.join(root, 'src/pages/home/index.tsx')
    await mkdir(path.dirname(pagePath), { recursive: true })
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App() { return null }\n')
    await writeFile(pagePath, renderPage('initial output failure'))
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
        customLogger: logger,
        plugins: [failOutput, vpt(createOptions())],
        build: { outDir: path.join(root, 'dist') },
        server: { host: '127.0.0.1', port: 0, strictPort: true }
    })

    try {
        await assert.rejects(() => server.listen(), /expected complete-output failure/)
        assert.match(errors.join('\n'), /wx dev build failed/)
    } finally {
        await server.close()
        await rm(root, { force: true, recursive: true })
    }
})

test('coalesces one full-file save into one wx patch', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions())
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

test('publishes and acknowledges cumulative wx patches without rotating the App heap', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createOptions())
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

test('publishes interpreter source through Vite WebSocket', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'), '127.0.0.1', createInterpreterOptions())
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

test('prints physical project paths without compromising later patch publication', async (context) => {
    // This mutable list captures the physical DevTools project banner.
    const infos: string[] = []
    const logger = createLogger('silent')
    logger.info = (message) => {
        infos.push(message)
    }
    const fixture = await startDevFixture(logger, '0.0.0.0', createOptions())
    context.after(fixture.close)
    const info = parseHmrInfo(
        await waitForFile(fixture.infoPath, (source) => source.includes('buildId'), maximumWaitAttempts)
    )

    assert.match(info.endpoint, /^ws:\/\/127\.0\.0\.1:/)
    assert.equal(await fixture.bundledDev.triggerBundleRegenerationIfStale(), false)
    fixture.server.printUrls()
    assert.match(stripVTControlCharacters(infos.join('\n')), /WeChat DevTools.*\.\/dist/)
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
    assert.match(devToolsOutput, /WeChat DevTools.*: \./)
    assert.match(devToolsOutput, /WeChat DevTools.*: \.\./)

    await publishSourceGeneration(fixture.pagePath, renderPage('healthy generation after invalid control traffic'))
    const patches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('healthy generation after invalid control traffic'),
        maximumWaitAttempts
    )
    assert.match(patches, /healthy generation after invalid control traffic/)
})

test('rotates build identity on a current rebuild report and rejects delayed old-session reports', async (context) => {
    // This mutable journal records the one full-build command admitted for the active runtime session.
    const infos: string[] = []
    const logger = createLogger('silent')
    logger.info = (message) => {
        infos.push(message)
    }
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions())
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
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions())
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
    const fixture = await startDevFixture(logger, '127.0.0.1', createOptions())
    context.after(fixture.close)

    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    await writeFile(
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

    await writeFile(fixture.pagePath, renderPage('recovered hot generation'))
    const recoveredPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('recovered hot generation'),
        maximumWaitAttempts
    )

    assert.match(recoveredPatches, /recovered hot generation/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), initialInfoSource)
})
