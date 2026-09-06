import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { packageRequire } from '../utils/packages.ts'

const execute = promisify(execFile)
const pluginRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const runtimeRoot = path.resolve(path.dirname(packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini')), '../..')
const tsc = path.join(path.dirname(packageRequire.resolve('typescript/package.json')), 'bin/tsc')

/** Copies the published declaration graph outside the workspace so Taro's build dependencies cannot mask missing types. */
async function prepareConsumer(root: string): Promise<void> {
    const modules = path.join(root, 'node_modules')
    const plugin = path.join(modules, 'vite-plugin-taro')
    const runtime = path.join(modules, 'vite-plugin-taro-runtime')
    await Promise.all([mkdir(plugin, { recursive: true }), mkdir(runtime, { recursive: true })])
    await Promise.all([
        cp(path.join(runtimeRoot, 'package.json'), path.join(runtime, 'package.json')),
        cp(path.join(runtimeRoot, 'dist'), path.join(runtime, 'dist'), { recursive: true }),
        cp(path.join(pluginRoot, 'client.d.ts'), path.join(plugin, 'client.d.ts')),
        writeFile(
            path.join(plugin, 'package.json'),
            JSON.stringify({ exports: { './client': { types: './client.d.ts' } } })
        )
    ])
    await Promise.all(
        ['@tarojs/shared', '@types/react'].map(async (dependency) => {
            const destination = path.join(modules, dependency)
            await mkdir(path.dirname(destination), { recursive: true })
            await symlink(path.dirname(packageRequire.resolve(`${dependency}/package.json`)), destination, 'dir')
        })
    )
    await writeFile(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                noEmit: true,
                // Matches generated applications; negative assertions catch declarations silently degrading to any.
                skipLibCheck: true,
                module: 'ESNext',
                moduleResolution: 'Bundler',
                types: ['vite-plugin-taro/client']
            },
            files: ['consumer.ts']
        })
    )
}

test('preserves API and router types without upstream Taro packages or Vite aliases', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-consumer-types-'))
    try {
        await prepareConsumer(root)
        await writeFile(
            path.join(root, 'consumer.ts'),
            `
                import Taro from 'virtual:taro/api'
                import type { MapProps } from 'virtual:taro/components'
                import type { SpaRouterConfig } from 'vite-plugin-taro-runtime/router/types/router'

                const marker: MapProps.marker = { id: 1, latitude: 1, longitude: 2, iconPath: '/marker.png' }
                Taro.createMapContext('map').addMarkers({ markers: [marker] })
                // @ts-expect-error Marker coordinates must stay numeric.
                Taro.createMapContext('map').addMarkers({ markers: [{ ...marker, latitude: 'invalid' }] })
                // @ts-expect-error Marker definitions cannot silently become any.
                Taro.createMapContext('map').addMarkers({ markers: [{}] })

                const prerender: boolean = Taro.options.prerender
                Taro.options.debug = prerender
                // @ts-expect-error Runtime options must retain their property types.
                Taro.options.debug = 'invalid'
                // @ts-expect-error Runtime options have no arbitrary methods.
                Taro.options.notARealOption()

                const mode: SpaRouterConfig['router']['mode'] = 'hash'
                // @ts-expect-error Router config must retain the copied compiler configuration types.
                const invalidMode: SpaRouterConfig['router']['mode'] = 'invalid'
            `
        )
        const { stdout, stderr } = await execute(process.execPath, [tsc, '--project', path.join(root, 'tsconfig.json')])
        assert.equal(stdout, '')
        assert.equal(stderr, '')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
