import { withBuildWatchHarness } from './devtools-harness.ts'
import { runBuildWatchRestartCase } from './run-build-watch-restart-case.ts'

await withBuildWatchHarness('build-watch-restart', runBuildWatchRestartCase)
