import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs'
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

function extractGenerator(root: string): string {
    // Only the generator must exist on disk to exercise real scaffolding; compiler/runtime archives stay compressed.
    const directory = path.join(root, 'unpacked', creatorPackage.name)
    mkdirSync(directory, { recursive: true })
    execFileSync('tar', [
        '-xf',
        path.join(root, 'packages', `${creatorPackage.name}-${creatorPackage.version}.tgz`),
        '-C',
        directory
    ])
    return path.join(directory, 'package')
}

function readPackedFile(root: string, pkg: { name: string; version: string }, file: string): string {
    // Inspect the actual archive member via stdout instead of unpacking entire dependency trees.
    return execFileSync(
        'tar',
        ['-xOf', path.join(root, 'packages', `${pkg.name}-${pkg.version}.tgz`), `package/${file}`],
        {
            encoding: 'utf8',
            maxBuffer: 4 * 1024 * 1024
        }
    )
}

/** Version and package-manager branches need only the real generator plus the two manifests they transform/select. */
function createManifestGenerator(root: string, generatorRoot: string): string {
    const directory = path.join(root, 'manifest-generator')
    for (const file of [
        'index.js',
        'package.json',
        'templates/default/package.json',
        'templates/pnpm/pnpm-workspace.yaml'
    ]) {
        const destination = path.join(directory, file)
        mkdirSync(path.dirname(destination), { recursive: true })
        copyFileSync(path.join(generatorRoot, file), destination)
    }
    return directory
}

function listFiles(root: string): string[] {
    return readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
        .sort()
}

function runGenerator(generatorRoot: string, projectPath: string, packageManager: string | undefined): string {
    return execFileSync(process.execPath, [path.join(generatorRoot, 'index.js'), projectPath], {
        encoding: 'utf8',
        env: {
            ...process.env,
            npm_config_user_agent: packageManager ? `${packageManager}/1.0.0` : undefined
        }
    })
}

test('public packages preserve their published entrypoints and scaffold dependencies', async (t) => {
    // Packed files and generated projects are disposable; source manifests stay unchanged.
    const root = mkdtempSync(path.join(tmpdir(), 'vpt-package-artifacts-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    packArtifacts(root)

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

    const generatorRoot = extractGenerator(root)
    assert.equal(existsSync(path.join(root, 'unpacked', pluginPackage.name)), false)
    assert.equal(existsSync(path.join(root, 'unpacked', runtimePackage.name)), false)
    await t.test('the packed generator copies the complete default and pnpm templates once', () => {
        const projectPath = path.join(root, 'complete-app')
        runGenerator(generatorRoot, projectPath, 'pnpm')
        const expectedFiles = ['default', 'pnpm']
            .flatMap((template) => listFiles(path.join(generatorRoot, 'templates', template)))
            .map((file) => (file === '_env.local' ? '.env.local' : file === '_gitignore' ? '.gitignore' : file))
            .sort()
        assert.deepEqual(listFiles(projectPath), expectedFiles)
        assert.equal(
            readFileSync(path.join(projectPath, 'src/app.tsx'), 'utf8'),
            readFileSync(path.join(generatorRoot, 'templates/default/src/app.tsx'), 'utf8')
        )
        assert.match(readFileSync(path.join(projectPath, '.env.local'), 'utf8'), /^VITE_VPT_TIKTOK_APP_ID=testAppId$/m)
        assert.match(readFileSync(path.join(projectPath, 'vite.config.ts'), 'utf8'), /env\.VITE_VPT_TIKTOK_APP_ID\b/)
        const project = JSON.parse(readFileSync(path.join(projectPath, 'package.json'), 'utf8'))
        assert.equal(project.name, 'complete-app')
        assert.equal(project.devDependencies['vite-plugin-taro'], `^${creatorPackage.version}`)
        assert.equal(project.scripts['dev:tt'], 'cross-env NODE_ENV=development VITE_VPT_TARGET=tt vite')
        assert.equal(project.scripts['build:tt'], 'cross-env NODE_ENV=production VITE_VPT_TARGET=tt vite build')
    })

    const manifestGenerator = createManifestGenerator(root, generatorRoot)
    const manifestPath = path.join(manifestGenerator, 'package.json')
    const manifest: typeof creatorPackage = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const version of [creatorPackage.version, '1.2.3', '1.2.4-beta.7']) {
        for (const packageManager of ['pnpm', 'npm', 'yarn', 'bun', undefined]) {
            const invocation = packageManager ?? 'node'
            await t.test(`the packed generator scaffolds version ${version} via ${invocation}`, () => {
                // Keep all version/manager combinations, but do not copy the same application tree fifteen times.
                writeFileSync(manifestPath, JSON.stringify({ ...manifest, version }))
                const projectPath = path.join(root, `app-${version}-${invocation}`)
                const output = runGenerator(manifestGenerator, projectPath, packageManager)
                assert.deepEqual(
                    listFiles(projectPath),
                    packageManager === 'pnpm' ? ['package.json', 'pnpm-workspace.yaml'] : ['package.json']
                )
                const project: { private: boolean; version: string; devDependencies: Record<string, string> } =
                    JSON.parse(readFileSync(path.join(projectPath, 'package.json'), 'utf8'))
                assert.equal(project.private, true)
                assert.equal(project.version, '0.0.0')
                assert.equal(project.devDependencies['vite-plugin-taro'], `^${version}`)
                assert.equal(project.devDependencies.vite, '8.3.0')
                assert.equal(project.devDependencies.rolldown, '1.2.8')
                assert.ok(output.includes(`  ${packageManager ?? 'npm'} install\n`))
                const run = packageManager === 'pnpm' || packageManager === 'yarn' ? '' : 'run '
                assert.ok(output.includes(`  ${packageManager ?? 'npm'} ${run}dev:tt\n`))
                assert.equal(existsSync(path.join(projectPath, 'pnpm-workspace.yaml')), packageManager === 'pnpm')
                if (packageManager === 'pnpm') {
                    // Check the emitted policy without launching pnpm's platform-specific command shim.
                    const workspace = readFileSync(path.join(projectPath, 'pnpm-workspace.yaml'), 'utf8')
                    assert.equal(
                        workspace.replaceAll('\r\n', '\n'),
                        [
                            'allowBuilds:',
                            '    # core-js postinstall only prints a donation banner; no build is needed.',
                            '    core-js: false',
                            ''
                        ].join('\n')
                    )
                }
            })
        }
    }
})
