import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createLogger, createServer, type Logger, type ViteDevServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'
import { type HmrInfo, hmrInfoFileName, hmrPatchesFileName } from './hmr-files.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const maximumWaitAttempts = 400
const stableReadCount = 10
const waitIntervalMilliseconds = 25

type DevFixture = Readonly<{
    close: () => Promise<void>
    infoPath: string
    appStylePath: string
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

function renderPage(marker: string): string {
    return `
        import { View } from '@tarojs/components'

        export default function Home() {
            return <View>${marker}</View>
        }
    `
}

async function startDevFixture(logger: Logger): Promise<DevFixture> {
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
        plugins: vpt(createOptions()),
        build: {
            outDir
        },
        server: {
            host: '127.0.0.1',
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
        pagePath,
        appStylePath: path.join(outDir, 'app.wxss'),
        infoPath: path.join(outDir, hmrInfoFileName),
        patchesPath: path.join(outDir, hmrPatchesFileName),
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

function parseHmrInfo(source: string): HmrInfo {
    const prefix = 'module.exports = Object.freeze('
    const suffix = ');\n'
    assert.ok(source.startsWith(prefix) && source.endsWith(suffix))
    return JSON.parse(source.slice(prefix.length, -suffix.length)) as HmrInfo
}

test('publishes and acknowledges cumulative wx patches without rotating the App heap', async (context) => {
    const fixture = await startDevFixture(createLogger('silent'))
    context.after(fixture.close)

    const initialInfoSource = await waitForFile(
        fixture.infoPath,
        (source) => source.includes('buildId'),
        maximumWaitAttempts
    )
    const initialAppStyle = await readFile(fixture.appStylePath, 'utf8')
    const info = parseHmrInfo(initialInfoSource)

    await writeFile(fixture.pagePath, renderPage('first hot generation'))
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

    const response = await fetch(info.endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            buildId: info.buildId,
            kind: 'applied',
            seq: Math.max(...sequences)
        })
    })
    assert.equal(response.status, 200)

    // Runtime receipts are intentionally conflated for one short quiet window before the next source generation is admitted.
    await delay(50)
    await writeFile(fixture.pagePath, renderPage('second hot generation'))
    const secondPatches = await waitForFile(
        fixture.patchesPath,
        (source) => source.includes('second hot generation'),
        maximumWaitAttempts
    )

    assert.doesNotMatch(secondPatches, /first hot generation/)
    assert.equal(await readFile(fixture.infoPath, 'utf8'), initialInfoSource)
    assert.equal(await readFile(fixture.appStylePath, 'utf8'), initialAppStyle)
})

test('resumes wx patch publication after a transient syntax error', async (context) => {
    // This request-local trace proves the invalid generation reached the host before recovery is attempted.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    const fixture = await startDevFixture(logger)
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
