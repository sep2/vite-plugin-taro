import assert from 'node:assert/strict'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { DevToolsHarness } from './devtools-harness.ts'
import { isRecord, waitFor } from './devtools-harness.ts'
import { type HmrEditProfile, publishHmrEdits } from './publish-hmr-edits.ts'

export type DevToolsCase = 'all' | 'burst' | 'rebuild' | 'recovery'

type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

const runtimeReportEvent = 'vpt:mini-hmr:report'

const burstProfile: HmrEditProfile = {
    applicationDelayMilliseconds: 4_000,
    intervalMilliseconds: readPositiveInteger('VPT_HMR_STRESS_INTERVAL_MS', 8),
    restorationDelayMilliseconds: readPositiveInteger('VPT_HMR_STRESS_SETTLE_MS', 100),
    updateCount: readPositiveInteger('VPT_HMR_STRESS_UPDATES', 30)
}
const postRecoveryProfile: HmrEditProfile = {
    applicationDelayMilliseconds: 4_000,
    intervalMilliseconds: 40,
    restorationDelayMilliseconds: 100,
    updateCount: 5
}

/** Runs a named case; `all` reuses one compiled disposable project to keep the complete suite quick. */
export async function runDevToolsCase(caseName: DevToolsCase, harness: DevToolsHarness): Promise<void> {
    const cases: Readonly<Record<Exclude<DevToolsCase, 'all'>, () => Promise<void>>> = {
        burst: () => testStateRetention('burst', burstProfile, harness),
        rebuild: () => testRuntimeRebuild(harness),
        recovery: () => testSyntaxRecovery(harness)
    }
    if (caseName === 'all') {
        // One strict burst covers the paced path while retaining the failure-producing write interval.
        for (const selected of ['burst', 'rebuild', 'recovery'] as const) {
            console.log(`[hmr-devtools] case: ${selected}`)
            await cases[selected]()
        }
        return
    }
    await cases[caseName]()
}

async function testStateRetention(name: string, profile: HmrEditProfile, harness: DevToolsHarness): Promise<void> {
    const primaryValue = `${name}-primary`
    const mirrorValue = `${name}-mirror`
    await setPageState(primaryValue, harness)
    await harness.navigate('navigateTo', '/pages/mirror/index')
    await assertCurrentRoute('pages/mirror/index', harness)
    await setPageState(mirrorValue, harness)

    await publishHmrEdits(harness.markerPath, profile)

    await waitForBaselineMarker(harness)
    await assertAppProjectionBaseline(harness)
    const restoredMarkerSource = await readFile(harness.markerPath, 'utf8')
    assert.match(restoredMarkerSource, /hmrMarker = 'baseline'/)
    assert.match(restoredMarkerSource, /appOutletFirst = true/)
    await assertPageState(mirrorValue, harness)
    const stack = await harness.readPageStack()
    assert.equal(stack.length, 2)
    await assertCleanConsole(harness)

    await harness.navigate('navigateBack', undefined)
    await assertCurrentRoute('pages/index/index', harness)
    await assertPageState(primaryValue, harness)
}

async function testRuntimeRebuild(harness: DevToolsHarness): Promise<void> {
    const rounds = readPositiveInteger('VPT_HMR_REBUILD_ROUNDS', 1)
    const reportsPerRound = readPositiveInteger('VPT_HMR_REPORTS_PER_ROUND', 100)
    const infoPath = path.join(harness.outDir, 'hmr/info.js')
    const rebuildLogsBefore = await countLog(harness.serverLogPath, 'wx full rebuild required')

    for (let round = 1; round <= rounds; round++) {
        const before = await readHmrInfo(infoPath)
        await sendReportStorm(before, round, reportsPerRound)
        await waitFor(async () => (await readHmrInfo(infoPath)).buildId !== before.buildId, 6_000, 20)
        await assertWxss(harness.outDir)
    }

    assert.equal((await countLog(harness.serverLogPath, 'wx full rebuild required')) - rebuildLogsBefore, rounds)
    await delay(3_000)
    await harness.readCurrentPage()
    await assertCleanConsole(harness)
}

async function testSyntaxRecovery(harness: DevToolsHarness): Promise<void> {
    const originalSource = await readFile(harness.markerPath, 'utf8')
    const infoPath = path.join(harness.outDir, 'hmr/info.js')
    const buildFailuresBefore = await countLog(harness.serverLogPath, 'wx dev build failed')
    const hmrFailuresBefore = await countLog(harness.serverLogPath, 'wx HMR update failed')
    const before = await readHmrInfo(infoPath)
    await setPageState('syntax-retained', harness)

    await writeFile(harness.markerPath, 'export const hmrMarker = ;\n')
    try {
        await waitFor(
            async () => (await countLog(harness.serverLogPath, 'wx HMR update failed')) > hmrFailuresBefore,
            5_000,
            20
        )
        // Invalid editor contents carry no patch and must leave both the build identity and live Page heap untouched.
        assert.equal((await readHmrInfo(infoPath)).buildId, before.buildId)
        await assertPageState('syntax-retained', harness)
    } finally {
        await writeFile(harness.markerPath, originalSource)
    }

    // The corrected save resumes ordinary HMR. Five real marker generations prove the stream remains live without rotating the
    // complete-build identity or resetting Page state.
    await publishHmrEdits(harness.markerPath, postRecoveryProfile)
    assert.equal((await readHmrInfo(infoPath)).buildId, before.buildId)
    await waitForBaselineMarker(harness)
    await assertAppProjectionBaseline(harness)
    await assertPageState('syntax-retained', harness)
    await assertWxss(harness.outDir)
    assert.equal(await countLog(harness.serverLogPath, 'wx dev build failed'), buildFailuresBefore)
    await assertCleanConsole(harness)
}

async function sendReportStorm(info: HmrInfo, round: number, reportCount: number): Promise<void> {
    const rebuildIndex = Math.floor(reportCount / 2)
    const reports = Array.from({ length: reportCount }, (_, index) =>
        index === rebuildIndex
            ? { kind: 'rebuild', buildId: info.buildId, reason: `automated-storm-${round}` }
            : { kind: 'applied', buildId: info.buildId, seq: reportCount - index }
    )
    const socket = await openReportSocket(info.endpoint)
    for (const report of reports) {
        socket.send(JSON.stringify({ type: 'custom', event: runtimeReportEvent, data: report }))
    }
    await waitFor(() => socket.bufferedAmount === 0, 1_000, 5)
    socket.close()
}

async function openReportSocket(endpoint: string): Promise<WebSocket> {
    const socket = new WebSocket(endpoint, ['vite-hmr'])
    await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true })
        socket.addEventListener('error', () => reject(new Error('HMR report socket failed to open')), { once: true })
    })
    return socket
}

async function readHmrInfo(infoPath: string): Promise<HmrInfo> {
    const source = await readFile(infoPath, 'utf8')
    const serialized = source.match(/Object\.freeze\((.*)\);/)?.[1]
    const value: unknown = serialized ? JSON.parse(serialized) : undefined
    if (!isRecord(value) || typeof value.buildId !== 'string' || typeof value.endpoint !== 'string') {
        throw new Error(`Invalid HMR info: ${source}`)
    }
    return { buildId: value.buildId, endpoint: value.endpoint }
}

async function assertCurrentRoute(expectedPath: string, harness: DevToolsHarness): Promise<void> {
    const currentPage = await harness.readCurrentPage()
    assert.equal(currentPage.path, expectedPath)
}

async function setPageState(value: string, harness: DevToolsHarness): Promise<void> {
    await harness.inputElement('#stress-input', value)
}

async function assertPageState(value: string, harness: DevToolsHarness): Promise<void> {
    assert.equal(await harness.readElement('#stress-input', 'value'), value)
}

async function waitForBaselineMarker(harness: DevToolsHarness): Promise<void> {
    await waitFor(async () => (await harness.readElement('#hmr-status', 'text')) === 'marker:baseline', 6_000, 100)
}

async function assertAppProjectionBaseline(harness: DevToolsHarness): Promise<void> {
    const appText = await harness.readElement('comp', 'text')
    assert.match(appText, /App marker: baseline/)
    assert.match(appText, /App outlet: first/)
}

async function assertCleanConsole(harness: DevToolsHarness): Promise<void> {
    assert.equal(await harness.readConsoleErrors(), '')
}

async function assertWxss(outDir: string): Promise<void> {
    assert.equal((await stat(path.join(outDir, 'assets/global.wxss'))).size > 0, true)
}

async function countLog(logPath: string, text: string): Promise<number> {
    return (await readFile(logPath, 'utf8')).split(text).length - 1
}

function readPositiveInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`)
    }
    return value
}
