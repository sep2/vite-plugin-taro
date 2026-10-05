import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import series from '../patches/series.json' with { type: 'json' }
import { composePatchSeries } from './compose-patch-series.ts'
import { projectTempDir } from './project-temp-dir.ts'

const root = fileURLToPath(new URL('../', import.meta.url))

/** Every test owns its package and Git index, including paths with spaces as on Windows runners. */
function fixture(t: TestContext): { directory: string; packageDirectory: string } {
    const directory = mkdtempSync(path.join(projectTempDir, 'vpt patch series test '))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const packageDirectory = path.join(directory, 'package with spaces')
    mkdirSync(packageDirectory)
    writeFileSync(path.join(packageDirectory, 'value.txt'), 'one\n')
    return { directory, packageDirectory }
}

function change(file: string, before: string, after: string): string {
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${before}\n+${after}\n`
}

function git(directory: string, args: string[]): string {
    return execFileSync('git', args, { cwd: directory, encoding: 'utf8', timeout: 30000, stdio: 'pipe' })
}

test('composes overlapping feature patches into one upstream-relative patch', (t) => {
    const { directory, packageDirectory } = fixture(t)
    const first = path.join(directory, 'first.patch')
    const second = path.join(directory, 'second.patch')
    writeFileSync(first, change('value.txt', 'one', 'two'))
    writeFileSync(second, change('value.txt', 'two', 'three'))
    const combined = composePatchSeries(packageDirectory, [first, second])
    assert.match(combined, /-one\n\+three\n/)
    assert.doesNotMatch(combined, /^[+-]two$/m)
    assert.equal(readFileSync(path.join(packageDirectory, 'value.txt'), 'utf8'), 'three\n')

    const pristine = path.join(directory, 'pristine')
    mkdirSync(pristine)
    writeFileSync(path.join(pristine, 'value.txt'), 'one\n')
    const output = path.join(directory, 'combined.patch')
    writeFileSync(output, combined)
    // Keep Git inside this fixture rather than discovering the enclosing repository.
    git(pristine, ['init', '--quiet'])
    // Verify the generated patch bytes without the Windows host's automatic CRLF conversion.
    git(pristine, ['-c', 'core.autocrlf=false', 'apply', output])
    assert.equal(readFileSync(path.join(pristine, 'value.txt'), 'utf8'), 'three\n')

    // Recomposition from another extraction is byte-stable; no timestamps or temporary paths enter the patch.
    writeFileSync(path.join(pristine, 'value.txt'), 'one\n')
    assert.equal(composePatchSeries(pristine, [first, second]), combined)
})

test('rejects reversed or conflicting feature patches', (t) => {
    const { directory, packageDirectory } = fixture(t)
    const first = path.join(directory, 'first.patch')
    const second = path.join(directory, 'second.patch')
    writeFileSync(first, change('value.txt', 'one', 'two'))
    writeFileSync(second, change('value.txt', 'two', 'three'))
    assert.throws(() => composePatchSeries(packageDirectory, [second, first]), /patch does not apply/)
    assert.equal(readFileSync(path.join(packageDirectory, 'value.txt'), 'utf8'), 'one\n')
})

test('preserves additions, deletions and binary changes', (t) => {
    const { directory, packageDirectory } = fixture(t)
    const binary = Buffer.from([0, 1, 2, 3])
    const changedBinary = Buffer.from([0, 3, 2, 1, 4])
    writeFileSync(path.join(packageDirectory, 'image.bin'), binary)
    const pristine = path.join(directory, 'pristine')
    cpSync(packageDirectory, pristine, { recursive: true })
    composePatchSeries(packageDirectory, [])
    const baseline = git(packageDirectory, ['write-tree']).trim()
    // This isolated staging index produces a realistic feature patch including Git's binary payload.
    rmSync(path.join(packageDirectory, 'value.txt'))
    writeFileSync(path.join(packageDirectory, 'new.txt'), 'new\n')
    writeFileSync(path.join(packageDirectory, 'image.bin'), changedBinary)
    git(packageDirectory, ['add', '--force', '--all'])
    const feature = path.join(directory, 'binary.patch')
    writeFileSync(feature, git(packageDirectory, ['diff', '--cached', '--binary', '--full-index', baseline]))

    const combined = composePatchSeries(pristine, [feature])
    assert.match(combined, /GIT binary patch/)
    assert.match(combined, /new file mode/)
    assert.match(combined, /deleted file mode/)
    assert.equal(existsSync(path.join(pristine, 'value.txt')), false)
    assert.equal(readFileSync(path.join(pristine, 'new.txt'), 'utf8'), 'new\n')
    assert.deepEqual(readFileSync(path.join(pristine, 'image.bin')), changedBinary)
})

test('an empty series produces no changes', (t) => {
    const { packageDirectory } = fixture(t)
    assert.equal(composePatchSeries(packageDirectory, []), '')
})

test('the manifest accounts for every source/output patch and matches pnpm registration', () => {
    const workspace = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    const sources = series.flatMap((entry) => entry.patches)
    const outputs = series.map((entry) => entry.output)
    const files = globSync('patches/**/*.patch', { cwd: root }).map((file) => file.split(path.sep).join('/'))
    assert.equal(new Set(series.map((entry) => entry.package)).size, series.length)
    assert.equal(new Set(sources).size, sources.length)
    assert.equal(new Set(outputs).size, outputs.length)
    assert.deepEqual(files.toSorted(), [...sources, ...outputs].toSorted())
    for (const entry of series) {
        assert.ok(entry.patches.length > 0)
        const registration = `${entry.package}: ${entry.output}`
        assert.equal(
            workspace
                .split(/\r?\n/)
                .filter((line) => line.trim().replaceAll("'", '').replaceAll('"', '') === registration).length,
            1,
            entry.package
        )
    }
})

for (const args of [[], ['invalid'], ['check', 'missing@1.0.0'], ['check', 'one', 'two']]) {
    test(`rejects invalid patch CLI arguments: ${JSON.stringify(args)}`, () => {
        assert.throws(
            () =>
                execFileSync(process.execPath, [path.join(root, 'scripts/patches.ts'), ...args], {
                    cwd: root,
                    stdio: 'pipe',
                    timeout: 30000
                }),
            /Usage:|Unknown patch series:/
        )
    })
}
