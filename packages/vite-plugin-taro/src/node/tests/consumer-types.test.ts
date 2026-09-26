import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createVirtualFileSystem } from 'typescript/unstable/fs'
import { API } from 'typescript/unstable/sync'
import { normalizePath } from 'vite'
import { packageRequire, resolveTaroRuntime } from '../utils/packages.ts'

const pluginRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const runtimeRoot = path.resolve(path.dirname(resolveTaroRuntime('runtime/mini')), '../..')

/** Reads declarations into an isolated package tree without copying hundreds of files or following workspace symlinks. */
async function readDeclarations(sourceRoot: string, destinationRoot: string): Promise<Record<string, string>> {
    const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true })
    const files = entries.filter(
        (entry) => entry.isFile() && (/\.d\.[cm]?ts$/.test(entry.name) || entry.name === 'package.json')
    )
    return Object.fromEntries(
        await Promise.all(
            files.map(async (entry) => {
                const source = path.join(entry.parentPath, entry.name)
                const destination = normalizePath(path.join(destinationRoot, path.relative(sourceRoot, source)))
                return [destination, await readFile(source, 'utf8')]
            })
        )
    )
}

async function createConsumerFiles(root: string): Promise<Record<string, string>> {
    const modules = `${root}/node_modules`
    const reactManifest = packageRequire.resolve('@types/react/package.json')
    const reactRequire = createRequire(reactManifest)
    const declarations = await Promise.all([
        readDeclarations(path.join(runtimeRoot, 'dist'), `${modules}/vite-plugin-taro-runtime/dist`),
        readDeclarations(
            path.dirname(packageRequire.resolve('@tarojs/shared/package.json')),
            `${modules}/@tarojs/shared`
        ),
        readDeclarations(path.dirname(reactManifest), `${modules}/@types/react`),
        readDeclarations(path.dirname(reactRequire.resolve('csstype/package.json')), `${modules}/csstype`)
    ])
    return {
        ...Object.fromEntries(declarations.flatMap(Object.entries)),
        [`${modules}/vite-plugin-taro-runtime/package.json`]: await readFile(
            path.join(runtimeRoot, 'package.json'),
            'utf8'
        ),
        [`${modules}/vite-plugin-taro/client.d.ts`]: await readFile(path.join(pluginRoot, 'client.d.ts'), 'utf8'),
        [`${modules}/vite-plugin-taro/package.json`]: JSON.stringify({
            exports: { './client': { types: './client.d.ts' } }
        }),
        [`${root}/tsconfig.json`]: JSON.stringify({
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
        }),
        [`${root}/consumer.ts`]: `
            import Taro from 'virtual:taro/api'
            import type { MapProps } from 'virtual:taro/components'
            import type { SpaRouterConfig } from 'vite-plugin-taro-runtime/router/types/router'

            // @ts-expect-error Upstream build dependencies must not leak into this consumer.
            import type {} from '@tarojs/taro'
            // @ts-expect-error Runtime types must resolve through the published package, not its build dependencies.
            import type {} from '@tarojs/runtime'

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
            // @ts-expect-error Router config must retain the published compiler configuration types.
            const invalidMode: SpaRouterConfig['router']['mode'] = 'invalid'
        `
    }
}

test('preserves API and router types without upstream Taro packages or Vite aliases', async () => {
    const root = normalizePath(path.join(tmpdir(), `vpt-consumer-types-${randomUUID()}`))
    const files = await createConsumerFiles(root)
    const virtualFs = createVirtualFileSystem(files)
    // TypeScript 7's API runs the bundled tsc binary with virtual FS callbacks, retaining the real checker without disk fixtures.
    const api = new API({
        cwd: root,
        fs: {
            ...virtualFs,
            readFile(file) {
                // Missing consumer files must not fall back to the workspace; only tsc's own standard libraries live outside it.
                return files[file] ?? (file.startsWith(`${root}/`) ? null : undefined)
            },
            getAccessibleEntries(directory) {
                return virtualFs.getAccessibleEntries?.(directory) ?? { files: [], directories: [] }
            }
        }
    })
    try {
        using snapshot = api.updateSnapshot({ openProjects: [`${root}/tsconfig.json`] })
        const project = snapshot.getProject(`${root}/tsconfig.json`)
        assert.ok(project)
        const program = project.program
        assert.deepEqual(
            [
                ...program.getConfigFileParsingDiagnostics(),
                ...program.getProgramDiagnostics(),
                ...program.getSyntacticDiagnostics(),
                ...program.getGlobalDiagnostics(),
                ...program.getSemanticDiagnostics()
            ],
            []
        )
        const sourceFiles = program.getSourceFileNames()
        assert.ok(sourceFiles.includes(`${root}/consumer.ts`))
        assert.ok(sourceFiles.some((file) => file.startsWith(`${root}/node_modules/vite-plugin-taro-runtime/`)))
        for (const file of sourceFiles) {
            assert.ok(file.startsWith(`${root}/`) || program.getSourceFileMetadata(file)?.isDefaultLibrary, file)
        }
        assert.equal(existsSync(root), false, 'The consumer project must remain entirely virtual')
    } finally {
        api.close()
    }
})
