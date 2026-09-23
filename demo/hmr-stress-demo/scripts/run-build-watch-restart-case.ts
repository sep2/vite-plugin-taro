import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DevToolsHarness } from './devtools-harness.ts'
import { waitFor } from './devtools-harness.ts'

const markerPattern = /export const hmrMarker = '[^']*'/

/** Verifies automatic full reloads before and after replacing a production build-watch process. */
export async function runBuildWatchRestartCase(harness: DevToolsHarness): Promise<void> {
    const originalSource = await readFile(harness.markerPath, 'utf8')
    assert.match(originalSource, markerPattern)
    const watchMarkerPath = path.join(harness.outDir, 'hmr/watch.js')
    // This mutable frontier identifies the exact completed watch generation following each source write.
    let watchMarker = await readFile(watchMarkerPath, 'utf8')

    const publishMarker = async (marker: string) => {
        await writeFile(
            harness.markerPath,
            originalSource.replace(markerPattern, `export const hmrMarker = '${marker}'`)
        )
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
        await waitForRenderedMarker(marker, harness)
        console.log(`[build-watch] rendered marker:${marker}`)
    }

    try {
        await waitForRenderedMarker('baseline', harness)
        await publishMarker('watch-before')
        console.log('[build-watch] replacing the watch process without reopening or compiling DevTools')

        const projectConfigPaths = ['project.config.json', 'project.private.config.json'].map((fileName) =>
            path.join(harness.outDir, fileName)
        )
        // Record current cleanup behavior without making config deletion part of the public test contract.
        const missingProjectConfigs = new Set<string>()
        const configMonitor = setInterval(() => {
            for (const fileName of projectConfigPaths) {
                if (!existsSync(fileName)) {
                    missingProjectConfigs.add(path.basename(fileName))
                }
            }
        }, 1)
        try {
            await harness.restartServer()
        } finally {
            clearInterval(configMonitor)
        }
        watchMarker = await readFile(watchMarkerPath, 'utf8')
        console.log(`[build-watch] configs absent during restart: ${JSON.stringify([...missingProjectConfigs])}`)
        await waitForRenderedMarker('watch-before', harness)

        await publishMarker('watch-after-1')
        await publishMarker('watch-after-2')
        assert.equal(await harness.readConsoleErrors(), '')
    } finally {
        await writeFile(harness.markerPath, originalSource)
    }
}

async function waitForRenderedMarker(marker: string, harness: DevToolsHarness): Promise<void> {
    await waitFor(async () => (await harness.readElement('#hmr-status', 'text')) === `marker:${marker}`, 30_000, 100)
}
