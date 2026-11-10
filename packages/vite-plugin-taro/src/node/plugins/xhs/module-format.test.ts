import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import vpt from '../../vpt.ts'

test('loads the XHS App and deferred main-package modules through CommonJS inside an ESM project', async () => {
    using project = createMemoryBuildProject({
        'src/app.tsx': `
            globalThis.xhsModuleEvents = []
            globalThis.loadXhsFeature = () => import('./feature.ts')
            export default function App({ children }) { return children }
        `,
        'src/feature.ts': `
            import { value } from './shared.ts'
            globalThis.xhsModuleEvents.push('feature')
            export const answer = value + 1
            export const loadNested = () => import('./nested.ts')
        `,
        'src/nested.ts': `
            import { value } from './shared.ts'
            globalThis.xhsModuleEvents.push('nested')
            export const answer = value + 2
        `,
        'src/shared.ts': `
            globalThis.xhsModuleEvents.push('shared')
            export const value = 40
        `
    })
    const result = await build({
        root: project.root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            project.plugin,
            vpt({ target: 'xhs', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
        ],
        build: { write: false }
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    assert.equal(
        result.output.some(({ fileName }) => fileName.startsWith('sub/')),
        false
    )
    const root = await createTestProject('xhs-module-scope-')
    const outDir = path.join(root, 'dist')
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    const packageAsset = result.output.find((output) => output.type === 'asset' && output.fileName === 'package.json')
    assert.ok(packageAsset?.type === 'asset')
    for (const output of result.output) {
        if (output.fileName === 'package.json') {
            continue
        }
        const filename = path.join(outDir, output.fileName)
        await mkdir(path.dirname(filename), { recursive: true })
        await writeFile(filename, output.type === 'chunk' ? output.code : output.source)
    }

    const runEntry = () =>
        spawnSync(process.execPath, ['--input-type=module', '--eval', probe, path.join(outDir, 'app.js')], {
            cwd: root,
            encoding: 'utf8',
            timeout: 25_000
        })
    const inheritedScope = runEntry()
    assert.notEqual(inheritedScope.status, 0)
    assert.match(inheritedScope.stderr, /ReferenceError: require is not defined/)

    await writeFile(path.join(outDir, 'package.json'), packageAsset.source)
    const nativeScope = runEntry()
    assert.equal(nativeScope.status, 0, nativeScope.stdout + nativeScope.stderr)
    assert.match(nativeScope.stdout, /XHS App registered/)
})

const probe = `
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
// The isolated native host records registration without starting the application's lifecycle.
const registrations = []
globalThis.App = (config) => registrations.push(config)
globalThis.xhs = {}
globalThis.getApp = () => ({})
globalThis.getCurrentPages = () => []
await import(pathToFileURL(process.argv[1]).href)
assert.equal(registrations.length, 1)
assert.equal(typeof registrations[0].onLaunch, 'function')
assert.deepEqual(globalThis.xhsModuleEvents, [])
const pending = globalThis.loadXhsFeature()
assert.ok(pending instanceof Promise)
assert.deepEqual(globalThis.xhsModuleEvents, [])
const feature = await pending
assert.equal(feature.answer, 41)
assert.deepEqual(globalThis.xhsModuleEvents, ['shared', 'feature'])
assert.strictEqual(await globalThis.loadXhsFeature(), feature)
assert.equal((await feature.loadNested()).answer, 42)
assert.deepEqual(globalThis.xhsModuleEvents, ['shared', 'feature', 'nested'])
console.log('XHS App registered')
`
