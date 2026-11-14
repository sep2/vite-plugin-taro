import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { createVirtualFileSystem } from 'typescript/unstable/fs'
import { API } from 'typescript/unstable/sync'
import { normalizePath } from 'vite'
import pluginPackage from '../../../package.json' with { type: 'json' }
import { packageRequire, resolveTaroRuntime } from '../utils/packages.ts'
import { projectTempDir } from './project-temp-dir.ts'

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

async function createConsumerFiles(
    root: string,
    distribution: 'workspace' | 'published'
): Promise<Record<string, string>> {
    const modules = `${root}/node_modules`
    const reactManifest = packageRequire.resolve('@types/react/package.json')
    const reactRequire = createRequire(reactManifest)
    const workspaceFiles =
        distribution === 'workspace'
            ? {
                  [`${modules}/vite-plugin-taro/src/runtime/client/taro/native.ts`]: await readFile(
                      path.join(pluginRoot, 'src/runtime/client/taro/native.ts'),
                      'utf8'
                  )
              }
            : {}
    const declarations = await Promise.all([
        readDeclarations(path.join(pluginRoot, 'dist'), `${modules}/vite-plugin-taro/dist`),
        readDeclarations(
            path.resolve(path.dirname(packageRequire.resolve('@vitejs/plugin-react')), '..'),
            `${modules}/@vitejs/plugin-react`
        ),
        readDeclarations(path.join(runtimeRoot, 'dist'), `${modules}/vite-plugin-taro-runtime/dist`),
        readDeclarations(
            path.dirname(packageRequire.resolve('@tarojs/shared/package.json')),
            `${modules}/@tarojs/shared`
        ),
        readDeclarations(path.dirname(reactManifest), `${modules}/@types/react`),
        readDeclarations(path.dirname(reactRequire.resolve('csstype/package.json')), `${modules}/csstype`)
    ])
    return {
        ...workspaceFiles,
        ...Object.fromEntries(declarations.flatMap(Object.entries)),
        [`${modules}/vite-plugin-taro-runtime/package.json`]: await readFile(
            path.join(runtimeRoot, 'package.json'),
            'utf8'
        ),
        [`${modules}/vite-plugin-taro/package.json`]: JSON.stringify({
            name: pluginPackage.name,
            type: pluginPackage.type,
            exports: distribution === 'workspace' ? pluginPackage.exports : pluginPackage.publishConfig.exports
        }),
        [`${root}/tsconfig.json`]: JSON.stringify({
            compilerOptions: {
                strict: true,
                noEmit: true,
                // Matches generated applications; negative assertions catch declarations silently degrading to any.
                skipLibCheck: true,
                target: 'ES2023',
                lib: ['ES2023', 'DOM'],
                module: 'ESNext',
                moduleResolution: 'Bundler',
                moduleDetection: 'force',
                types: ['vite-plugin-taro/client']
            },
            files: ['consumer.ts']
        }),
        [`${root}/consumer.ts`]: `
            import type { ComponentProps } from 'react'
            import Taro, { showToast } from 'virtual:taro/api'
            import type { MapProps } from 'virtual:taro/components'
            import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'
            import { defineVptPage } from 'virtual:vpt'
            import { box, toCamelCase, type Box } from 'virtual:taro/shared'
            import type { SpaRouterConfig } from 'vite-plugin-taro-runtime/router/types/router'

            // @ts-expect-error Page factories use explicit virtual-module imports.
            globalThis.defineVptPage(() => ({}))
            defineVptPage(() => ({ entry: true, config: { title: 'Home' } }))
            // @ts-expect-error Page declarations require configuration factories.
            defineVptPage({ entry: true })
            // @ts-expect-error Empty objects are not configuration factories.
            defineVptPage({})
            defineVptPage(({ target }) => {
                const platform: 'wx' | 'zfb' | 'tb' | 'tt' | 'xhs' | 'h5' = target
                // @ts-expect-error The inferred target is a string union.
                target.toFixed()
                return { entry: platform === 'wx' }
            })
            defineVptPage(async ({ target }) => ({ config: { title: target } }))
            // @ts-expect-error Routes are derived from source filenames.
            defineVptPage(() => ({ path: 'custom/path' }))
            // @ts-expect-error Entry selection is boolean.
            defineVptPage(() => ({ entry: 'yes' }))
            // @ts-expect-error Native configuration contains JSON values.
            defineVptPage(() => ({ config: { title: () => 'Home' } }))
            // @ts-expect-error Async factories must return page options.
            defineVptPage(async () => 42)

            // @ts-expect-error Upstream build dependencies must not leak into this consumer.
            import type {} from '@tarojs/taro'
            // @ts-expect-error Runtime types must resolve through the published package, not its build dependencies.
            import type {} from '@tarojs/runtime'

            showToast({ title: 'Hello' })
            // @ts-expect-error Named API exports retain their parameter types.
            showToast({ title: 42 })

            const Counter = defineNativeComponent<{ count: number }>(async () => ({}))
            const counterProps: ComponentProps<typeof Counter> = { count: 1 }
            // @ts-expect-error Native JSX interfaces retain their prop types.
            const invalidCounterProps: ComponentProps<typeof Counter> = { count: 'invalid' }
            const event: NativeComponentEvent<{ count: number }> = { detail: counterProps }
            // @ts-expect-error Native event details retain their declared shape.
            const invalidEvent: NativeComponentEvent<{ count: number }> = { detail: { count: 'invalid' } }

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

            const boxed: Box<string> = box(toCamelCase('shared-value'))
            const value: string = boxed.v
            // @ts-expect-error Shared utilities must retain their parameter types.
            toCamelCase(123)
            // @ts-expect-error Shared generic types must retain their value types.
            const invalidBox: Box<number> = boxed

            const mode: SpaRouterConfig['router']['mode'] = 'hash'
            // @ts-expect-error Router config must retain the published compiler configuration types.
            const invalidMode: SpaRouterConfig['router']['mode'] = 'invalid'
        `
    }
}

for (const distribution of ['workspace', 'published'] as const) {
    test(`${distribution}: preserves client types in an ES2023 application`, async () => {
        const root = normalizePath(path.join(projectTempDir, `vpt-consumer-types-${randomUUID()}`))
        const files = await createConsumerFiles(root, distribution)
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
            assert.ok(sourceFiles.includes(`${root}/node_modules/vite-plugin-taro/dist/client.d.ts`))
            assert.ok(sourceFiles.includes(`${root}/node_modules/vite-plugin-taro/dist/options.d.ts`))
            assert.equal(
                sourceFiles.some((file) => /\/vite-plugin-taro\/(?:src|dist)\/node\//.test(file)),
                false,
                'Client types must remain independent of the Node build implementation'
            )
            assert.ok(sourceFiles.some((file) => file.startsWith(`${root}/node_modules/vite-plugin-taro-runtime/`)))
            for (const file of sourceFiles) {
                assert.ok(file.startsWith(`${root}/`) || program.getSourceFileMetadata(file)?.isDefaultLibrary, file)
            }
            assert.equal(existsSync(root), false, 'The consumer project must remain entirely virtual')
        } finally {
            api.close()
        }
    })
}
