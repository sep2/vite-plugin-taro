import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { createMemoryBuildProject } from './create-memory-build-project.ts'

test('builds extensionless and directory imports while Vite owns query transforms', async () => {
    const root = await (async () => {
        using project = createMemoryBuildProject({
            'entry.ts': `
                import { value } from './value'
                import { suffix } from './directory'
                import text from './message.txt?raw'
                import image from './image.png'
                export const result = value + suffix + text
                export { image }
            `,
            'value.ts': 'export const value: string = "first"',
            'directory/index.ts': 'export const suffix = ":"',
            'message.txt': '<memory>',
            'image.png': Uint8Array.from([0, 255])
        })
        const { root } = project
        assert.deepEqual(readFileSync(path.join(root, 'image.png')), Buffer.from([0, 255]))
        for (const value of ['first', 'second']) {
            writeFileSync(path.join(root, 'value.ts'), `export const value: string = ${JSON.stringify(value)}`)
            const result = await build({
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: [project.plugin],
                build: {
                    write: false,
                    minify: false,
                    assetsInlineLimit: 0,
                    rolldownOptions: {
                        input: path.join(root, 'entry.ts'),
                        preserveEntrySignatures: 'strict',
                        output: { format: 'cjs', exports: 'named' }
                    }
                }
            })
            assert.ok(!Array.isArray(result) && 'output' in result)
            const entry = result.output.find((file) => file.type === 'chunk' && file.isEntry)
            assert.ok(entry?.type === 'chunk')
            // Each evaluation owns the CommonJS export object populated by the actual bundle.
            const module = { exports: {} }
            runInNewContext(entry.code, { module, exports: module.exports })
            assert.equal(Reflect.get(module.exports, 'result'), `${value}:<memory>`)
            const asset = result.output.find((file) => file.type === 'asset' && file.fileName.endsWith('.png'))
            assert.ok(asset?.type === 'asset')
            assert.deepEqual(asset.source, Buffer.from([0, 255]))
            assert.equal(Reflect.get(module.exports, 'image'), `/${asset.fileName}`)
            assert.equal(existsSync(path.join(root, 'dist')), false)
        }
        return root
    })()
    assert.equal(existsSync(root), false)
})

test('reports unresolved fixture imports through the real bundler', async () => {
    using project = createMemoryBuildProject({ 'entry.js': "import './missing.js'" })
    await assert.rejects(
        build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            plugins: [project.plugin],
            build: {
                write: false,
                rolldownOptions: { input: path.join(project.root, 'entry.js') }
            }
        }),
        /Could not resolve|Cannot resolve/
    )
})
