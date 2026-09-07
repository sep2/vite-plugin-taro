import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import config from '../.changeset/config.json' with { type: 'json' }

interface PackageManifest {
    name: string
    version: string
    private?: boolean
    dependencies?: Record<string, string>
}

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const cliPath = path.join(repoRoot, 'node_modules/@changesets/cli/bin.js')
const packageDirectories = ['docs', ...readdirSync(path.join(repoRoot, 'packages')).map((name) => `packages/${name}`)]
const publicNames = config.fixed.flat()
const execFileAsync = promisify(execFile)

function readPackage(root: string, directory: string): PackageManifest {
    const manifest: PackageManifest = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8'))
    return manifest
}

function writeJson(file: string, value: unknown): void {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(value, null, 4)}\n`)
}

function changeset(root: string, args: string[]): string {
    return execFileSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: 'utf8' })
}

/** Every versioning test mutates its own disposable Git workspace, never the real manifests or release state. */
function createWorkspace(t: TestContext, version: string): string {
    const root = mkdtempSync(path.join(tmpdir(), 'vpt-changesets-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    writeJson(path.join(root, 'package.json'), { name: 'release-fixture', private: true, type: 'module' })
    writeJson(path.join(root, '.changeset/config.json'), config)
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - docs\n')
    for (const directory of packageDirectories) {
        const manifest = readPackage(repoRoot, directory)
        writeJson(path.join(root, directory, 'package.json'), {
            ...manifest,
            version: manifest.private ? manifest.version : version
        })
    }
    execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: root, stdio: 'pipe' })
    commitWorkspace(root)
    return root
}

function commitWorkspace(root: string): void {
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync(
        'git',
        ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.com', 'commit', '-m', 'Fixture'],
        {
            cwd: root,
            stdio: 'pipe'
        }
    )
}

function addChangeset(root: string, name: string, packageName: string, bump: string, summary: string): void {
    writeFileSync(path.join(root, '.changeset', `${name}.md`), `---\n"${packageName}": ${bump}\n---\n\n${summary}\n`)
}

function assertVersions(root: string, version: string): void {
    const manifests = packageDirectories.map((directory) => readPackage(root, directory))
    assert.deepEqual(
        manifests.filter((manifest) => !manifest.private).map((manifest) => manifest.version),
        publicNames.map(() => version)
    )
    for (const directory of packageDirectories) {
        const original = readPackage(repoRoot, directory)
        if (original.private) {
            assert.equal(readPackage(root, directory).version, original.version)
            assert.equal(existsSync(path.join(root, directory, 'CHANGELOG.md')), false)
        }
    }
    assert.equal(
        readPackage(root, 'packages/vite-plugin-taro').dependencies?.['vite-plugin-taro-runtime'],
        'workspace:*'
    )
}

test('only the three public packages participate in the fixed release group', () => {
    assert.deepEqual(
        packageDirectories
            .map((directory) => readPackage(repoRoot, directory))
            .filter((manifest) => !manifest.private)
            .map((manifest) => manifest.name)
            .toSorted(),
        publicNames.toSorted()
    )
    const root: { private: boolean } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
    assert.equal(root.private, true)
    assert.deepEqual(config.privatePackages, { version: false, tag: false })
    assert.equal(config.commit, false)
})

test('continues the existing beta sequence, then promotes it with accumulated release notes', (t) => {
    const root = createWorkspace(t, '0.7.1-beta.1')
    changeset(root, ['pre', 'enter', 'beta'])
    addChangeset(root, 'first', 'create-vite-taro', 'patch', 'Match the scaffold plugin version.')
    changeset(root, ['version'])
    assertVersions(root, '0.7.1-beta.2')
    assert.equal(existsSync(path.join(root, '.changeset/first.md')), false)
    assert.equal(existsSync(path.join(root, '.changeset/pre/first.md')), true)

    addChangeset(root, 'second', 'create-vite-taro', 'patch', 'Keep beta scaffolds on the beta release.')
    changeset(root, ['version'])
    assertVersions(root, '0.7.1-beta.3')

    changeset(root, ['pre', 'exit'])
    changeset(root, ['version'])
    assertVersions(root, '0.7.1')
    assert.equal(existsSync(path.join(root, '.changeset/pre.json')), false)
    assert.equal(existsSync(path.join(root, '.changeset/pre/first.md')), false)
    const changelog = readFileSync(path.join(root, 'packages/create-vite-taro/CHANGELOG.md'), 'utf8')
    const stableEntry = changelog.split('## 0.7.1\n')[1].split('\n## ')[0]
    assert.match(stableEntry, /Match the scaffold plugin version/)
    assert.match(stableEntry, /Keep beta scaffolds on the beta release/)
})

test('a stable release combines bumps and preserves manifest formatting and private versions', (t) => {
    const root = createWorkspace(t, '1.2.3')
    addChangeset(root, 'fix', 'vite-plugin-taro-runtime', 'patch', 'Fix the shared runtime.')
    addChangeset(root, 'feature', 'vite-plugin-taro', 'minor', 'Add a compiler feature.')
    changeset(root, ['version'])
    assertVersions(root, '1.3.0')
    assert.equal(existsSync(path.join(root, '.changeset/fix.md')), false)
    assert.equal(existsSync(path.join(root, '.changeset/feature.md')), false)
    for (const directory of packageDirectories) {
        const source = readFileSync(path.join(root, directory, 'package.json'), 'utf8')
        assert.equal(source, `${JSON.stringify(JSON.parse(source), null, 4)}\n`)
    }
})

interface PublishPlan {
    plan: { name: string; version: string; tag: string; kind: string }[][]
}

/** A loopback registry keeps publication planning deterministic and never receives a publish request. */
async function createRegistry(t: TestContext, versions: Readonly<Record<string, readonly string[]>>): Promise<string> {
    // Test-local requests prove the CLI used this fixture registry rather than the public npm registry.
    const requestedPackages = new Set<string>()
    t.after(() => assert.deepEqual([...requestedPackages].toSorted(), publicNames.toSorted()))
    const server = createServer((request, response) => {
        assert.equal(request.method, 'GET')
        assert.ok(request.url)
        const name = decodeURIComponent(request.url.slice(1))
        assert.ok(publicNames.includes(name), `Unexpected registry lookup for ${name}`)
        requestedPackages.add(name)
        response.setHeader('Content-Type', 'application/json')
        response.end(
            JSON.stringify({
                name,
                'dist-tags': { latest: '0.7.0' },
                versions: Object.fromEntries(versions[name].map((version) => [version, { name, version }]))
            })
        )
    })
    t.after(() => server[Symbol.asyncDispose]())
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    return `http://127.0.0.1:${address.port}`
}

async function publishPlan(root: string, registry: string): Promise<PublishPlan> {
    const output = path.join(root, 'publish-plan.json')
    // pnpm 11 reads registry settings from workspace YAML, not npm_config_* environment variables.
    appendFileSync(path.join(root, 'pnpm-workspace.yaml'), `registry: ${registry}\nfetchRetries: 0\n`)
    await execFileAsync(process.execPath, [cliPath, 'publish-plan', '--output', output], { cwd: root })
    return JSON.parse(readFileSync(output, 'utf8'))
}

test('publication planning skips existing versions and selects only public beta or stable releases', async (t) => {
    const registry = await createRegistry(
        t,
        Object.fromEntries(publicNames.map((name) => [name, ['0.7.0', '0.7.1-beta.1']]))
    )
    const publishedRoot = createWorkspace(t, '0.7.1-beta.1')
    changeset(publishedRoot, ['pre', 'enter', 'beta'])
    assert.deepEqual((await publishPlan(publishedRoot, registry)).plan, [])

    const betaRoot = createWorkspace(t, '0.7.1-beta.2')
    changeset(betaRoot, ['pre', 'enter', 'beta'])
    const betaPlan = (await publishPlan(betaRoot, registry)).plan
    assert.deepEqual(
        betaPlan
            .flat()
            .map((release) => release.name)
            .toSorted(),
        publicNames.toSorted()
    )
    for (const release of betaPlan.flat()) {
        assert.equal(release.version, '0.7.1-beta.2')
        assert.equal(release.tag, 'beta')
        assert.equal(release.kind, 'publish')
    }
    const runtimeGroup = betaPlan.findIndex((group) =>
        group.some((release) => release.name === 'vite-plugin-taro-runtime')
    )
    const pluginGroup = betaPlan.findIndex((group) => group.some((release) => release.name === 'vite-plugin-taro'))
    assert.ok(runtimeGroup < pluginGroup, 'The runtime must publish before its dependent plugin')

    const stableRoot = createWorkspace(t, '0.7.1')
    for (const release of (await publishPlan(stableRoot, registry)).plan.flat()) {
        assert.equal(release.version, '0.7.1')
        assert.equal(release.tag, 'latest')
    }
})

test('a partial-publish retry plans only the remaining package', async (t) => {
    const root = createWorkspace(t, '0.7.1-beta.2')
    changeset(root, ['pre', 'enter', 'beta'])
    const registry = await createRegistry(
        t,
        Object.fromEntries(
            publicNames.map((name) => [name, name === 'create-vite-taro' ? ['0.7.0'] : ['0.7.0', '0.7.1-beta.2']])
        )
    )
    const remaining = (await publishPlan(root, registry)).plan.flat()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].name, 'create-vite-taro')
    assert.equal(remaining[0].tag, 'beta')
})

function hasPendingRelease(root: string): boolean {
    const output = path.join(root, 'release-status.json')
    changeset(root, ['status', '--output', output])
    const status: { changesets: unknown[]; releases: unknown[] } = JSON.parse(readFileSync(output, 'utf8'))
    return status.changesets.length > 0 || status.releases.length > 0
}

test('release readiness blocks pending changesets and prerelease exits, but accepts versioned commits', (t) => {
    const root = createWorkspace(t, '0.7.1-beta.1')
    changeset(root, ['pre', 'enter', 'beta'])
    addChangeset(root, 'pending', 'create-vite-taro', 'patch', 'Prepare a release.')
    commitWorkspace(root)
    assert.equal(hasPendingRelease(root), true)

    changeset(root, ['version'])
    commitWorkspace(root)
    assert.equal(hasPendingRelease(root), false)

    changeset(root, ['pre', 'exit'])
    commitWorkspace(root)
    assert.equal(hasPendingRelease(root), true)

    changeset(root, ['version'])
    commitWorkspace(root)
    assert.equal(hasPendingRelease(root), false)
})

test('a new beta cycle starts at beta.0 and can be finalized without another changeset', (t) => {
    const root = createWorkspace(t, '1.2.3')
    changeset(root, ['pre', 'enter', 'beta'])
    addChangeset(root, 'next', 'vite-plugin-taro', 'patch', 'Prepare the next patch.')
    changeset(root, ['version'])
    assertVersions(root, '1.2.4-beta.0')
    changeset(root, ['pre', 'exit'])
    changeset(root, ['version'])
    assertVersions(root, '1.2.4')
})
