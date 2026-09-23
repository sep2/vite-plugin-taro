import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runLoanBuildWatchRestartCase } from './hmr-build-watch-restart-case.ts'
import { createLoanHmrDevTools } from './hmr-devtools.ts'
import { startLoanBuildWatcher, stopLoanHmrServer, withLoanHmrFixture } from './hmr-fixture.ts'

await withLoanHmrFixture('restart', async (fixture) => {
    // Ownership follows the replacement process so finalization always stops the current watcher.
    let watcher = await startLoanBuildWatcher(fixture)
    const restartWatcher = async (): Promise<void> => {
        await stopLoanHmrServer(watcher)
        watcher = await startLoanBuildWatcher(fixture)
    }
    try {
        const devTools = createLoanHmrDevTools(fixture)
        await devTools.openProject()
        try {
            console.log(`[loan-watch] running build-watch restart in ${fixture.root}`)
            await runLoanBuildWatchRestartCase({
                devTools: devTools,
                fixture: fixture,
                restartWatcher: restartWatcher
            })
        } catch (error) {
            console.error(
                `[loan-watch] Vite log before cleanup:\n${await readFile(path.join(fixture.root, 'vite.log'), 'utf8')}`
            )
            console.error(`[loan-watch] DevTools console before cleanup:\n${await devTools.readConsoleErrors()}`)
            throw error
        } finally {
            await devTools.closeProject()
        }
    } finally {
        await stopLoanHmrServer(watcher)
    }
})
