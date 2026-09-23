import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type LoanHmrDevTools, waitFor } from './hmr-devtools.ts'
import type { LoanHmrFixture } from './hmr-fixture.ts'

const calculatorMarker = 'src/pages/calculator/hmr-marker.ts'
const calculatorRoute = 'pages/calculator/index'

type LoanBuildWatchContext = Readonly<{
    devTools: LoanHmrDevTools
    fixture: LoanHmrFixture
    restartWatcher: () => Promise<void>
}>

/** Verifies automatic native reloads before and after replacing a production build-watch process. */
export async function runLoanBuildWatchRestartCase(context: LoanBuildWatchContext): Promise<void> {
    const { devTools, fixture } = context
    const originalMarker = await fixture.read(calculatorMarker)
    const watchMarkerPath = path.join(fixture.outDir, 'hmr/watch.js')
    // This mutable frontier identifies the complete watch generation following each source publication.
    let watchMarker = await readFile(watchMarkerPath, 'utf8')

    const publishMarker = async (marker: string): Promise<void> => {
        await fixture.publishMarker(calculatorMarker, marker)
        await waitFor(
            async () => {
                const nextMarker = await readFile(watchMarkerPath, 'utf8')
                if (nextMarker === watchMarker) {
                    return false
                }
                watchMarker = nextMarker
                return true
            },
            30_000,
            20
        )
        await waitForRenderedMarker(devTools, marker)
        console.log(`[loan-watch] rendered marker:${marker}`)
    }

    try {
        await devTools.navigate('reLaunch', `/${calculatorRoute}`)
        await waitForRenderedMarker(devTools, 'baseline')
        await publishMarker('watch-before')
        console.log('[loan-watch] replacing build --watch without reopening or compiling DevTools')

        const projectConfigPaths = ['project.config.json', 'project.private.config.json'].map((fileName) =>
            path.join(fixture.outDir, fileName)
        )
        // Build-watch cleanup intentionally remains independently observable from development cleanup policy.
        const missingProjectConfigs = new Set<string>()
        const configMonitor = setInterval(() => {
            for (const fileName of projectConfigPaths) {
                if (!existsSync(fileName)) {
                    missingProjectConfigs.add(path.basename(fileName))
                }
            }
        }, 1)
        try {
            await context.restartWatcher()
        } finally {
            clearInterval(configMonitor)
        }
        watchMarker = await readFile(watchMarkerPath, 'utf8')
        console.log(`[loan-watch] configs absent during restart: ${JSON.stringify([...missingProjectConfigs])}`)
        await waitForRenderedMarker(devTools, 'watch-before')

        await publishMarker('watch-after-1')
        await publishMarker('watch-after-2')
        assert.equal(await devTools.readConsoleErrors(), '')
        console.log('[loan-watch] build-watch restart passed')
    } finally {
        await fixture.write(calculatorMarker, originalMarker)
    }
}

async function waitForRenderedMarker(devTools: LoanHmrDevTools, marker: string): Promise<void> {
    await waitFor(
        async () =>
            (await devTools.readCurrentPage()).path === calculatorRoute &&
            (await devTools.readElement('#loan-hmr-marker', 'text')) === marker,
        30_000,
        100
    )
}
