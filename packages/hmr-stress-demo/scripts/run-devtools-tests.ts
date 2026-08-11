import { type DevToolsCase, runDevToolsCase } from './devtools-cases.ts'
import { withDevToolsHarness } from './devtools-harness.ts'

const requestedCase = process.argv[2] ?? 'all'
if (requestedCase === 'setup') {
    await withDevToolsHarness('setup', async () => {})
} else {
    if (!isDevToolsCase(requestedCase)) {
        throw new Error(`Unknown DevTools case: ${requestedCase}`)
    }
    await withDevToolsHarness(requestedCase, (harness) => runDevToolsCase(requestedCase, harness))
}

function isDevToolsCase(value: string): value is DevToolsCase {
    return ['all', 'burst', 'rebuild', 'recovery'].includes(value)
}
