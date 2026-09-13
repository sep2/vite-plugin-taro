import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'
import { createBundleDependenciesPlugin } from './create-bundle-dependencies-plugin.ts'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))

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
            assert.ok(modules.length > 0)
            assert.ok(!modules.some((id) => id.includes('/rxjs/dist/cjs/')))
            assert.ok(!modules.some((id) => id.includes('/@weapp-tailwindcss/postcss-calc/')))
            if (suite.startsWith('dev/')) {
                assert.ok(modules.some((id) => id.includes('/rxjs/dist/esm/')))
                assert.ok(!modules.some((id) => id.includes('/internal/observable/dom/')))
            }
            execFileSync(process.execPath, ['--test', output], { timeout: 20_000, stdio: 'pipe' })
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
}
