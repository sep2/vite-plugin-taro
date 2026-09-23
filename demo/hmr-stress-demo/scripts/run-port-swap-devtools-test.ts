import { withPortSwapHarness } from './devtools-harness.ts'
import { runPortSwapCase } from './run-port-swap-case.ts'

await withPortSwapHarness(runPortSwapCase)
