import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'
import { createBundleDependenciesPlugin } from './create-bundle-dependencies-plugin.ts'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))

function assertBundledDependencies(moduleIds: readonly string[], requiresRxjs: boolean): void {
    // Rolldown module IDs use native separators; all dependency checks below use forward slashes.
    const modules = moduleIds.map((id) => id.replaceAll('\\', '/'))
    assert.ok(modules.length > 0)
    assert.ok(!modules.some((id) => id.includes('/rxjs/dist/cjs/')))
    assert.ok(!modules.some((id) => id.includes('/@weapp-tailwindcss/postcss-calc/')))
    if (requiresRxjs) {
        assert.ok(modules.some((id) => id.includes('/rxjs/dist/esm/')))
        assert.ok(!modules.some((id) => id.includes('/internal/observable/dom/')))
    }
}

for (const [platform, paths] of [
    ['POSIX', path.posix],
    ['Windows', path.win32]
] as const) {
    test(`bundle dependency assertions recognize ${platform} module paths`, () => {
        const root = 'C:/workspace/node_modules'
        const esmModule = paths.join(root, 'rxjs/dist/esm/index.js')
        assertBundledDependencies([esmModule], true)
        for (const dependency of [
            'rxjs/dist/cjs/index.js',
            '@weapp-tailwindcss/postcss-calc/dist/index.js',
            'rxjs/dist/esm/internal/observable/dom/WebSocketSubject.js'
        ]) {
            assert.throws(() => assertBundledDependencies([esmModule, paths.join(root, dependency)], true), {
                code: 'ERR_ASSERTION'
            })
        }
    })
}

/** stdin retains a real, isolated node:test run without materializing a bundle; cwd resolves external packages. */
function runBundledTests(source: string): void {
    execFileSync(process.execPath, ['--input-type=module'], {
        cwd: packageRoot,
        input: source,
        env: { ...process.env, NODE_TEST_CONTEXT: undefined },
        timeout: 20_000,
        stdio: 'pipe'
    })
}

test('in-memory test execution propagates assertion failures', () => {
    assert.throws(
        () => runBundledTests("import test from 'node:test'; test('failure', () => { throw new Error('expected') })"),
        { status: 1 }
    )
})

// Execute the existing behavioral suites through the published bundle's dependency specialization,
// not just native TS imports: disabled dependency stubs must never be reached at runtime.
for (const suite of ['styles/create-mini-transformer', 'dev/create-hmr-results-stream', 'dev/host-actions']) {
    test(`bundled ${suite} preserves behavior without unused dependencies`, async () => {
        const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
            dependencies: Record<string, string>
            peerDependencies: Record<string, string>
        }
        const externalPackages = new Set([
            ...Object.keys(packageJson.dependencies),
            ...Object.keys(packageJson.peerDependencies)
        ])
        const result = await build({
            input: path.join(packageRoot, `src/node/plugins/mini/${suite}.test.ts`),
            platform: 'node',
            external(id) {
                const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]!
                return id.startsWith('node:') || externalPackages.has(packageName)
            },
            plugins: [createBundleDependenciesPlugin(packageRoot)],
            output: { format: 'esm', codeSplitting: false, minify: true },
            write: false
        })
        const modules = result.output.flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))
        assertBundledDependencies(modules, suite.startsWith('dev/'))
        assert.equal(result.output.length, 1)
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        runBundledTests(chunk.code)
    })
}
