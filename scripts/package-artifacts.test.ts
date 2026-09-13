import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import creatorPackage from '../packages/create-vite-taro/package.json' with { type: 'json' }
import runtimePackage from '../packages/taro-runtime/package.json' with { type: 'json' }
import pluginPackage from '../packages/vite-plugin-taro/package.json' with { type: 'json' }

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const publicPackages = [runtimePackage, pluginPackage, creatorPackage]

function packArtifacts(root: string): void {
    // A local plan exercises the real Changesets/pnpm packing path without querying or publishing to npm.
    const plan = {
        version: 1,
        plan: publicPackages.map(({ name, version }) => [
            { kind: 'publish', name, version, access: 'public', tag: 'test' }
        ])
    }
    const planPath = path.join(root, 'plan.json')
    writeFileSync(planPath, JSON.stringify(plan))
    execFileSync(
        process.execPath,
        [
            path.join(repoRoot, 'node_modules/@changesets/cli/bin.js'),
            'pack',
            '--from-publish-plan',
            planPath,
            '--out-dir',
            root
        ],
        { cwd: repoRoot, stdio: 'pipe' }
    )
}

function extractArtifacts(root: string): void {
    // Extract each archive once: linear in total artifact size, without buffering compiler output through a subprocess.
    for (const pkg of publicPackages) {
        const directory = path.join(root, 'unpacked', pkg.name)
        mkdirSync(directory, { recursive: true })
        execFileSync('tar', ['-xf', path.join(root, 'packages', `${pkg.name}-${pkg.version}.tgz`), '-C', directory])
    }
}

function readPackedFile(root: string, pkg: { name: string }, file: string): string {
    return readFileSync(path.join(root, 'unpacked', pkg.name, 'package', file), 'utf8')
}

test('public packages preserve their published entrypoints and scaffold dependencies', async (t) => {
    // Packed files and generated projects are disposable; source manifests stay unchanged.
    const root = mkdtempSync(path.join(tmpdir(), 'vpt-package-artifacts-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    packArtifacts(root)
    extractArtifacts(root)

    await t.test('plugin entrypoints use dist and workspace dependencies resolve to the matching runtime', () => {
        const manifest: typeof pluginPackage = JSON.parse(readPackedFile(root, pluginPackage, 'package.json'))
        assert.equal(manifest.main, pluginPackage.publishConfig.main)
        assert.equal(manifest.module, pluginPackage.publishConfig.module)
        assert.equal(manifest.types, pluginPackage.publishConfig.types)
        assert.deepEqual(manifest.exports, pluginPackage.publishConfig.exports)
        assert.equal(manifest.dependencies['vite-plugin-taro-runtime'], runtimePackage.version)
        assert.ok(readPackedFile(root, pluginPackage, 'dist/index.js').length > 0)
        assert.ok(readPackedFile(root, runtimePackage, 'dist/runtime/index.js').length > 0)
        assert.ok(readPackedFile(root, pluginPackage, 'README.md').length > 0)
    })

    await t.test('all three packages are versioned together and remain public', () => {
        for (const pkg of publicPackages) {
            const manifest: { name: string; version: string; private?: boolean } = JSON.parse(
                readPackedFile(root, pkg, 'package.json')
            )
            assert.equal(manifest.name, pkg.name)
            assert.equal(manifest.version, pluginPackage.version)
            assert.notEqual(manifest.private, true)
        }
    })

    const generatorRoot = path.join(root, 'unpacked', creatorPackage.name, 'package')
    const manifestPath = path.join(generatorRoot, 'package.json')
    const manifest: typeof creatorPackage = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const version of [creatorPackage.version, '1.2.3', '1.2.4-beta.7']) {
        await t.test(`the packed generator scaffolds the plugin matching its own version ${version}`, () => {
            // Only the extracted package is varied to cover stable and beta scaffolding without source sync scripts.
            writeFileSync(manifestPath, JSON.stringify({ ...manifest, version }))
            const projectPath = path.join(root, `app-${version}`)
            execFileSync(process.execPath, [path.join(generatorRoot, 'index.js'), projectPath], { stdio: 'pipe' })
            const project: { private: boolean; version: string; devDependencies: Record<string, string> } = JSON.parse(
                readFileSync(path.join(projectPath, 'package.json'), 'utf8')
            )
            assert.equal(project.private, true)
            assert.equal(project.version, '0.0.0')
            assert.equal(project.devDependencies['vite-plugin-taro'], `^${version}`)
            assert.equal(project.devDependencies.vite, '8.3.0')
        })
    }
})
