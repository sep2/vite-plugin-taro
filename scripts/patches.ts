import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import series from '../patches/series.json' with { type: 'json' }
import { composePatchSeries } from './compose-patch-series.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const [mode, selectedPackage, ...extra] = process.argv.slice(2)
if ((mode !== 'build' && mode !== 'check') || extra.length > 0) {
    throw new Error('Usage: node scripts/patches.ts <build|check> [package@version]')
}
const entries = series.filter((entry) => selectedPackage === undefined || entry.package === selectedPackage)
if (entries.length === 0) {
    throw new Error(`Unknown patch series: ${selectedPackage}`)
}

// Compose everything before publishing any output: a conflict must not leave a partially regenerated series.
const outputs = entries.map((entry) => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'vpt-patch-series-'))
    const packageDirectory = path.join(temporaryDirectory, 'package')
    try {
        // npm-installed pnpm can be a .cmd shim on Windows, matching the repository's other CLI launchers.
        const executable = process.platform === 'win32' ? 'cmd.exe' : 'pnpm'
        const prefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm'] : []
        // Use pnpm's pinned upstream tarball/cache, not the already-patched node_modules tree. pnpm requires an install first.
        execFileSync(
            executable,
            [...prefix, 'patch', entry.package, '--ignore-existing', '--edit-dir', packageDirectory],
            { cwd: root, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }
        )
        return {
            entry,
            patch: composePatchSeries(
                packageDirectory,
                entry.patches.map((file) => path.join(root, file))
            )
        }
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true })
    }
})

for (const { entry, patch } of outputs) {
    const output = path.join(root, entry.output)
    if (mode === 'check') {
        if (readFileSync(output, 'utf8') !== patch) {
            throw new Error(`Stale generated patch: ${entry.output}. Run pnpm patches:build.`)
        }
    } else {
        mkdirSync(path.dirname(output), { recursive: true })
        writeFileSync(output, patch)
    }
    console.log(
        `${mode === 'check' ? 'Verified' : 'Generated'} ${entry.package}: ${entry.patches.length} feature patches`
    )
}
