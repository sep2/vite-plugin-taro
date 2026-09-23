import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type LoanHmrDevTools, waitFor } from './hmr-devtools.ts'
import type { LoanHmrFixture } from './hmr-fixture.ts'

const calculatorMarker = 'src/pages/calculator/hmr-marker.ts'
const calculatorRoute = 'pages/calculator/index'
const primaryInput = '#loan-input-loanAmount'

type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

type LoanRestartContext = Readonly<{
    devTools: LoanHmrDevTools
    fixture: LoanHmrFixture
    restartServer: () => Promise<void>
}>

/** Verifies restart recovery in the real application without reopening or manually compiling DevTools. */
export async function runLoanHmrRestartCase(context: LoanRestartContext): Promise<void> {
    const { devTools, fixture } = context
    const originalMarker = await fixture.read(calculatorMarker)
    const infoPath = path.join(fixture.outDir, 'hmr/info.js')
    const appStylePath = path.join(fixture.outDir, 'app.wxss')
    const obsoletePath = path.join(fixture.outDir, 'obsolete-restart-output.txt')
    const projectConfigPaths = ['project.config.json', 'project.private.config.json'].map((fileName) =>
        path.join(fixture.outDir, fileName)
    )

    const publishMarker = async (marker: string): Promise<void> => {
        console.log(`[loan-hmr] restart: waiting for rendered marker:${marker}`)
        await fixture.publishMarker(calculatorMarker, marker)
        await waitForMarker(devTools, marker)
        console.log(`[loan-hmr] restart: rendered marker:${marker}`)
    }

    try {
        await devTools.navigate('reLaunch', `/${calculatorRoute}`)
        await waitForCalculator(devTools, '0')
        await waitForMarker(devTools, 'baseline')
        await waitForRuntimeStartup(fixture, infoPath)

        // Establish ordinary state-retaining HMR before replacing the development process.
        await setInput(devTools, '777')
        await publishMarker('restart-before')
        await assertInput(devTools, '777')
        const before = await readHmrInfo(infoPath)
        await writeFile(obsoletePath, 'obsolete output from the previous server')

        console.log('[loan-hmr] restart: replacing Vite without reopening or compiling DevTools')
        // This observation spans the delayed replacement build; checking only afterward could miss deletion and recreation.
        let projectConfigMissing = false
        const configMonitor = setInterval(() => {
            projectConfigMissing ||= projectConfigPaths.some((fileName) => !existsSync(fileName))
        }, 1)
        try {
            await context.restartServer()
        } finally {
            clearInterval(configMonitor)
        }
        assert.equal(projectConfigMissing, false, 'Restart cleanup must retain both DevTools project config files')

        const restarted = await waitForNewBuild(infoPath, before.buildId)
        await assert.rejects(stat(obsoletePath), { code: 'ENOENT' })
        await waitForRuntimeStartup(fixture, infoPath)
        // A development restart intentionally replaces the App heap. The same open DevTools window must load the new baseline.
        await waitForCalculator(devTools, '0')
        await waitForMarker(devTools, 'restart-before')
        const appStyle = await readFile(appStylePath, 'utf8')
        assert.ok(appStyle.includes(restarted.buildId))

        await setInput(devTools, '999')
        for (const marker of ['restart-after-1', 'restart-after-2']) {
            await publishMarker(marker)
            await assertInput(devTools, '999')
            assert.equal((await readHmrInfo(infoPath)).buildId, restarted.buildId)
            assert.equal(await readFile(appStylePath, 'utf8'), appStyle, 'A full reload must not mask broken HMR')
        }
        assert.equal(await devTools.readConsoleErrors(), '')
        console.log('[loan-hmr] development-server restart passed')
    } finally {
        await fixture.write(calculatorMarker, originalMarker)
    }
}

async function waitForNewBuild(infoPath: string, previousBuildId: string): Promise<HmrInfo> {
    let current: HmrInfo | undefined
    await waitFor(
        async () => {
            try {
                current = await readHmrInfo(infoPath)
                return current.buildId !== previousBuildId
            } catch (error) {
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    return false
                }
                throw error
            }
        },
        12_000,
        20
    )
    assert.ok(current)
    return current
}

async function waitForRuntimeStartup(fixture: LoanHmrFixture, infoPath: string): Promise<HmrInfo> {
    const info = await readHmrInfo(infoPath)
    await waitFor(
        async () => (await fixture.read('vite.log')).includes(`[loan-hmr] runtime ready ${info.buildId}`),
        12_000,
        100
    )
    return info
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

async function waitForCalculator(devTools: LoanHmrDevTools, inputValue: string): Promise<void> {
    await waitFor(
        async () =>
            (await devTools.readCurrentPage()).path === calculatorRoute &&
            (await devTools.readElement(primaryInput, 'value')) === inputValue,
        20_000,
        100
    )
}

async function setInput(devTools: LoanHmrDevTools, value: string): Promise<void> {
    await devTools.inputElement(primaryInput, value)
    await waitFor(async () => (await devTools.readElement(primaryInput, 'value')) === value, 5_000, 75)
}

async function assertInput(devTools: LoanHmrDevTools, value: string): Promise<void> {
    assert.equal(await devTools.readElement(primaryInput, 'value'), value)
}

async function waitForMarker(devTools: LoanHmrDevTools, marker: string): Promise<void> {
    await waitFor(async () => (await devTools.readElement('#loan-hmr-marker', 'text')) === marker, 8_000, 75)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
