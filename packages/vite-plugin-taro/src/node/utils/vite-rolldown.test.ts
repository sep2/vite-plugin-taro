import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMemoryTestProject } from '../tests/create-memory-test-project.ts'
import * as compiler from './vite-rolldown.ts'

test('uses Vite-owned Rolldown constructors, native factories, and HMR runtime', () => {
    const viteRequire = createRequire(import.meta.resolve('vite'))
    const rolldown: typeof import('rolldown') = viteRequire('rolldown')
    const experimental: typeof import('rolldown/experimental') = viteRequire('rolldown/experimental')
    assert.strictEqual(compiler.build, rolldown.build)
    assert.strictEqual(compiler.RolldownMagicString, rolldown.RolldownMagicString)
    assert.strictEqual(compiler.RUNTIME_MODULE_ID, rolldown.RUNTIME_MODULE_ID)
    assert.strictEqual(compiler.dev, experimental.dev)
    assert.strictEqual(compiler.viteReporterPlugin, experimental.viteReporterPlugin)
    assert.strictEqual(compiler.viteTransformPlugin, experimental.viteTransformPlugin)
    assert.equal(compiler.rolldownRuntimePath, viteRequire.resolve('rolldown/experimental/runtime'))
})

test('resolves the compiler from Vite when the application has its own Rolldown installation', async (context) => {
    const root = createMemoryTestProject(context)
    const viteRoot = path.join(root, 'node_modules/vite')
    const applicationRolldownRoot = path.join(root, 'node_modules/rolldown')
    const viteRolldownRoot = path.join(viteRoot, 'node_modules/rolldown')
    await Promise.all([
        mkdir(applicationRolldownRoot, { recursive: true }),
        mkdir(viteRolldownRoot, { recursive: true })
    ])
    await Promise.all([
        writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' })),
        writeFile(path.join(viteRoot, 'package.json'), JSON.stringify({ name: 'vite', main: 'index.cjs' })),
        writeFile(path.join(viteRoot, 'index.cjs'), 'module.exports = {}'),
        ...[applicationRolldownRoot, viteRolldownRoot].flatMap((directory) => [
            writeFile(
                path.join(directory, 'package.json'),
                JSON.stringify({
                    name: 'rolldown',
                    exports: {
                        '.': './index.cjs',
                        './experimental': './experimental.cjs',
                        './experimental/runtime': './runtime.cjs'
                    }
                })
            ),
            writeFile(
                path.join(directory, 'index.cjs'),
                'exports.build = () => {}; exports.RolldownMagicString = class {}; exports.RUNTIME_MODULE_ID = "runtime"'
            ),
            writeFile(
                path.join(directory, 'experimental.cjs'),
                'exports.dev = () => {}; exports.viteReporterPlugin = () => {}; exports.viteTransformPlugin = () => {}'
            ),
            writeFile(path.join(directory, 'runtime.cjs'), 'exports.DevRuntime = class {}')
        ])
    ])
    const result = await compiler.build({
        input: fileURLToPath(new URL('./vite-rolldown.ts', import.meta.url)),
        platform: 'node',
        external: [/^node:/],
        output: { format: 'es' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk.type === 'chunk')
    const entry = path.join(root, 'compiler.js')
    await writeFile(entry, chunk.code)
    const loaded: typeof compiler = await import(pathToFileURL(entry).href)
    const applicationRequire = createRequire(entry)
    const viteRequire = createRequire(path.join(viteRoot, 'index.cjs'))
    const applicationRolldown: typeof import('rolldown') = applicationRequire('rolldown')
    const viteRolldown: typeof import('rolldown') = viteRequire('rolldown')
    const experimental: typeof import('rolldown/experimental') = viteRequire('rolldown/experimental')
    assert.notStrictEqual(loaded.build, applicationRolldown.build)
    assert.strictEqual(loaded.build, viteRolldown.build)
    assert.strictEqual(loaded.RolldownMagicString, viteRolldown.RolldownMagicString)
    assert.strictEqual(loaded.dev, experimental.dev)
    assert.strictEqual(loaded.viteReporterPlugin, experimental.viteReporterPlugin)
    assert.strictEqual(loaded.viteTransformPlugin, experimental.viteTransformPlugin)
    assert.equal(loaded.rolldownRuntimePath, path.join(viteRolldownRoot, 'runtime.cjs'))
})
