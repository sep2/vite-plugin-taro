import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runLoanHmrCases } from './hmr-cases.ts'
import { createLoanHmrDevTools } from './hmr-devtools.ts'
import { startLoanHmrServer, stopLoanHmrServer, withLoanHmrFixture } from './hmr-fixture.ts'

await withLoanHmrFixture(async (fixture) => {
    const server = await startLoanHmrServer(fixture)
    try {
        const devTools = createLoanHmrDevTools(fixture)
        await devTools.openProject()
        try {
            console.log(`[loan-hmr] running state-retention flows in ${fixture.root}`)
            await runLoanHmrCases({ devTools: devTools, fixture: fixture })
            console.log('[loan-hmr] all state-retention flows passed')
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
