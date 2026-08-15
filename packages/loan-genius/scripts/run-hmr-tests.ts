import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { runLoanHmrCases } from './hmr-cases.ts'
import { createLoanHmrDevTools } from './hmr-devtools.ts'
import { startLoanHmrServer, stopLoanHmrServer, withLoanHmrFixture } from './hmr-fixture.ts'

await withLoanHmrFixture(async (fixture) => {
    const server = await startLoanHmrServer(fixture)
    try {
        const devTools = createLoanHmrDevTools(fixture)
        await devTools.openProject()
        try {
            // The first App service reload follows project compilation; interactions begin only after that runtime is stable.
            await delay(5_000)
            console.log(`[loan-hmr] running 25 flows in ${fixture.root}`)
            await runLoanHmrCases({ devTools: devTools, fixture: fixture })
            console.log('[loan-hmr] all 25 complex flows passed')
        } catch (error) {
            console.error(
                `[loan-hmr] Vite log before cleanup:\n${await readFile(path.join(fixture.root, 'vite.log'), 'utf8')}`
            )
            throw error
        } finally {
            await devTools.closeProject()
        }
    } finally {
        await stopLoanHmrServer(server)
    }
})
