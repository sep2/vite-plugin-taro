import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoot = path.join(repoRoot, 'packages/vite-plugin-taro/tmp')
const targets = ['wx', 'zfb', 'tb', 'tt', 'h5'] as const
const dependencies = ['react', 'react-dom', 'vite', 'rolldown', 'vite-plugin-taro']
const templateEnv = 'VITE_VPT_WECHAT_APP_ID=wx0000000000000000\nVITE_VPT_TIKTOK_APP_ID=testAppId\n'
const localEnv = 'VITE_VPT_WECHAT_APP_ID=wx1234567890abcdef\nVITE_VPT_TIKTOK_APP_ID=localAppId\n'

function writeFixtureFile(root: string, file: string, content: string): void {
    const destination = path.join(root, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, content)
}

function createFixture(t: TestContext): string {
    mkdirSync(temporaryRoot, { recursive: true })
    const root = mkdtempSync(path.join(temporaryRoot, 'template-build-test-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    writeFixtureFile(root, 'package.json', JSON.stringify({ type: 'module' }))
    for (const file of [
        'scripts/build-template.ts',
        'packages/create-vite-taro/index.js',
        'packages/create-vite-taro/package.json',
        'packages/create-vite-taro/templates/default/package.json',
        'packages/create-vite-taro/templates/pnpm/pnpm-workspace.yaml'
    ]) {
        const destination = path.join(root, file)
        mkdirSync(path.dirname(destination), { recursive: true })
        copyFileSync(path.join(repoRoot, file), destination)
    }
    writeFixtureFile(root, 'packages/create-vite-taro/templates/default/_env.local', templateEnv)
    writeFixtureFile(root, 'packages/create-vite-taro/templates/default/node_modules/fixture-only/index.js', '')
    writeFixtureFile(
        root,
        'packages/vite-plugin-taro/package.json',
        JSON.stringify({ name: 'vite-plugin-taro', exports: { './package.json': './package.json' } })
    )
    for (const name of dependencies.filter((name) => name !== 'vite-plugin-taro')) {
        writeFixtureFile(root, `packages/vite-plugin-taro/node_modules/${name}/package.json`, JSON.stringify({ name }))
    }
    // Lightweight runtime and Vite entrypoints exercise orchestration without rebuilding shared workspace artifacts.
    writeFixtureFile(
        root,
        'packages/taro-runtime/scripts/build.ts',
        `import { mkdirSync, writeFileSync } from 'node:fs'
const dist = new URL('../dist/', import.meta.url)
mkdirSync(dist, { recursive: true })
writeFileSync(new URL('ready', dist), '')
`
    )
    writeFixtureFile(
        root,
        'packages/vite-plugin-taro/node_modules/vite/bin/vite.js',
        `import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const root = ${JSON.stringify(root)}
assert.ok(existsSync(path.join(root, 'packages/taro-runtime/dist/ready')))
assert.ok(existsSync('.git'))
assert.equal(existsSync('node_modules/fixture-only'), false)
const target = process.env.VITE_VPT_TARGET
const output = path.join(root, 'dist', target)
assert.deepEqual(process.argv.slice(2), ['build', '--outDir', output, '--emptyOutDir'])
for (const name of ${JSON.stringify(dependencies)}) {
    const source = name === 'vite-plugin-taro'
        ? path.join(root, 'packages/vite-plugin-taro')
        : path.join(root, 'packages/vite-plugin-taro/node_modules', name)
    assert.equal(realpathSync(path.join('node_modules', name)), realpathSync(source))
}
mkdirSync(output, { recursive: true })
writeFileSync(path.join(output, 'env.txt'), readFileSync('.env.local'))
`
    )
    return root
}

function runBuild(root: string, args: string[]) {
    return spawnSync(process.execPath, [path.join(root, 'scripts/build-template.ts'), ...args], {
        // Resolve repository paths from the script, independently of the caller's working directory.
        cwd: temporaryRoot,
        env: { ...process.env, npm_config_user_agent: 'pnpm/12.15.0', VITE_VPT_TARGET: 'invalid' },
        encoding: 'utf8',
        timeout: 25_000
    })
}

function assertCleaned(root: string): void {
    assert.deepEqual(readdirSync(path.join(root, 'packages/vite-plugin-taro/tmp')), [])
}

for (const target of targets) {
    for (const useLocalEnv of [false, true]) {
        test(`builds ${target} with ${useLocalEnv ? 'local' : 'generated'} environment settings`, (t) => {
            const root = createFixture(t)
            if (useLocalEnv) {
                writeFixtureFile(root, 'packages/create-vite-taro/.env.local', localEnv)
            }
            assert.equal(existsSync(path.join(root, 'packages/taro-runtime/dist')), false)
            const result = runBuild(root, [target])
            assert.equal(result.status, 0, result.stderr)
            const env = readFileSync(path.join(root, 'dist', target, 'env.txt'), 'utf8')
            if (useLocalEnv) {
                assert.equal(env, localEnv)
            } else {
                assert.match(env, /^VITE_VPT_WECHAT_APP_ID=wx[0-9a-f]{16}$/m)
                assert.match(env, /^VITE_VPT_TIKTOK_APP_ID=testAppId$/m)
            }
            assert.equal(
                readFileSync(path.join(root, 'packages/create-vite-taro/templates/default/_env.local'), 'utf8'),
                templateEnv
            )
            assertCleaned(root)
        })
    }
}

for (const args of [[], ['invalid']]) {
    test(`rejects ${args.length === 0 ? 'missing' : 'unsupported'} targets before preparing artifacts`, (t) => {
        const root = createFixture(t)
        const result = runBuild(root, args)
        assert.equal(result.status, 1)
        assert.match(result.stderr, /Usage: node scripts\/build-template.ts <wx\|zfb\|tb\|tt\|h5>/)
        assert.equal(existsSync(path.join(root, 'packages/taro-runtime/dist')), false)
        assert.equal(existsSync(path.join(root, 'packages/vite-plugin-taro/tmp')), false)
        assert.equal(existsSync(path.join(root, 'dist')), false)
    })
}

test('stops when runtime preparation fails', (t) => {
    const root = createFixture(t)
    writeFixtureFile(root, 'packages/taro-runtime/scripts/build.ts', "throw new Error('Runtime preparation failed')\n")
    const result = runBuild(root, ['wx'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Runtime preparation failed/)
    assert.equal(existsSync(path.join(root, 'packages/vite-plugin-taro/tmp')), false)
    assert.equal(existsSync(path.join(root, 'dist')), false)
})

test('cleans the generated project when Vite fails', (t) => {
    const root = createFixture(t)
    writeFixtureFile(root, 'packages/create-vite-taro/.env.local', localEnv)
    writeFixtureFile(
        root,
        'packages/vite-plugin-taro/node_modules/vite/bin/vite.js',
        "throw new Error('Vite build failed')\n"
    )
    const result = runBuild(root, ['wx'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Vite build failed/)
    assertCleaned(root)
})
