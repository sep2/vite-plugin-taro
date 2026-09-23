import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runLoanHmrCases } from './hmr-cases.ts'
import { createLoanHmrDevTools } from './hmr-devtools.ts'
import { startLoanHmrServer, stopLoanHmrServer, withLoanHmrFixture } from './hmr-fixture.ts'
import { runLoanHmrRestartCase } from './hmr-restart-case.ts'

const requestedCase = process.argv[2] ?? 'all'
if (requestedCase !== 'all' && requestedCase !== 'restart') {
    throw new Error(`Unknown Loan Genius HMR case: ${requestedCase}`)
}

await withLoanHmrFixture(requestedCase === 'all' ? 'state-retention' : 'restart', async (fixture) => {
    // Ownership follows the replacement process so finalization always stops the currently running server.
    let server = await startLoanHmrServer(fixture)
    const restartServer = async (): Promise<void> => {
        await stopLoanHmrServer(server)
        server = await startLoanHmrServer(fixture)
    }
    try {
        const devTools = createLoanHmrDevTools(fixture)
        await devTools.openProject()
        try {
            if (requestedCase === 'all') {
                console.log(`[loan-hmr] running state-retention flows in ${fixture.root}`)
                await runLoanHmrCases({ devTools: devTools, fixture: fixture })
                console.log('[loan-hmr] all state-retention flows passed')
            } else {
                await runLoanHmrRestartCase({
                    devTools: devTools,
                    fixture: fixture,
                    restartServer: restartServer
                })
            }
        } catch (error) {
            console.error(
                `[loan-hmr] Vite log before cleanup:\n${await readFile(path.join(fixture.root, 'vite.log'), 'utf8')}`
            )
            console.error(`[loan-hmr] DevTools console before cleanup:\n${await devTools.readConsoleErrors()}`)
            throw error
        } finally {
            await devTools.closeProject()
        }
    } finally {
        await stopLoanHmrServer(server)
    }
})
