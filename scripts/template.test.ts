import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

test('the generated template passes strict typechecks and all target builds', () => {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./test-template.ts', import.meta.url))], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30_000
    })
    assert.match(output, /strict typechecks passed/)
    assert.match(output, /zfb custom tab-bar files passed/)
    for (const target of ['wx', 'zfb', 'tt', 'h5']) {
        assert.ok(output.includes(`[template] ${target} build passed`))
    }
    assert.match(output, /PASS: generated template/)
})
