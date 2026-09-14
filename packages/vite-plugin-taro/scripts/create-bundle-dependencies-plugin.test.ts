import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

// Execute the existing behavioral suites through the published bundle's dependency specialization,
// not just native TS imports: disabled dependency stubs must never be reached at runtime.
for (const suite of ['styles/create-mini-transformer', 'dev/create-hmr-results-stream', 'dev/host-actions']) {
    test(`bundled ${suite} preserves behavior without unused dependencies`, async () => {
        const directory = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-bundle-test-'))
        try {
            const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
                dependencies: Record<string, string>
                peerDependencies: Record<string, string>
            }
            const externalPackages = new Set([
                ...Object.keys(packageJson.dependencies),
                ...Object.keys(packageJson.peerDependencies)
            ])
            const output = path.join(directory, 'test.mjs')
            const result = await build({
                input: path.join(packageRoot, `src/node/plugins/mini/${suite}.test.ts`),
                platform: 'node',
                external(id) {
                    const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]!
                    return id.startsWith('node:') || externalPackages.has(packageName)
                },
                plugins: [createBundleDependenciesPlugin(packageRoot)],
                output: { file: output, format: 'esm', codeSplitting: false, minify: true }
            })
            const modules = result.output.flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))
            assertBundledDependencies(modules, suite.startsWith('dev/'))
            execFileSync(process.execPath, ['--test', output], { timeout: 20_000, stdio: 'pipe' })
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
}
