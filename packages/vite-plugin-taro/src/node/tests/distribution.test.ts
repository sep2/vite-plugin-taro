import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { h5AppPath } from '../plugins/h5/constant.ts'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const distRoot = path.join(packageRoot, 'dist')
const packageRequire = createRequire(import.meta.url)
const runtimePackageEntry = packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini')
const runtimePackageDistRoot = path.resolve(path.dirname(runtimePackageEntry), '..')
const runtimePackageRoot = path.resolve(runtimePackageDistRoot, '..')
const runtimePackageRequire = createRequire(runtimePackageEntry)
const compilerSizeLimit = 2_250_000
// Includes the modular APIs, eager components, router, and declarations formerly shipped in four upstream packages.
const runtimePackageSizeLimit = 5_000_000
const runtimeCjsFilePattern = /^index\.cjs\.(?:d\.ts|js(?:\.map)?)$/

const platformJavaScriptFiles: ReadonlyArray<readonly [dependencyId: string, outputPath: string]> = [
    ['@tarojs/plugin-platform-weapp/dist/runtime.js', 'plugin-platform-weapp/runtime.js'],
    ['@tarojs/plugin-platform-weapp/dist/components-react.js', 'plugin-platform-weapp/components-react.js'],
    ['@tarojs/plugin-platform-weapp/dist/runtime-utils.js', 'plugin-platform-weapp/runtime-utils.js'],
    ['@tarojs/plugin-platform-alipay/dist/runtime.js', 'plugin-platform-alipay/runtime.js'],
    ['@tarojs/plugin-platform-alipay/dist/components-react.js', 'plugin-platform-alipay/components-react.js'],
    ['@tarojs/plugin-platform-alipay/dist/runtime-utils.js', 'plugin-platform-alipay/runtime-utils.js']
]

function resolveAdapterDependencyRoot(dependency: string): string {
    return path.dirname(runtimePackageRequire.resolve(`${dependency}/package.json`))
}

async function listRelativeFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
}

async function assertFilesCopied(
    sourceRoot: string,
    outputRoot: string,
    relativeFiles: readonly string[]
): Promise<void> {
    await Promise.all(
        relativeFiles.map(async (relativePath) => {
            const [source, output] = await Promise.all([
                readFile(path.join(sourceRoot, relativePath)),
                readFile(path.join(outputRoot, relativePath))
            ])
            if (relativePath.endsWith('.d.ts')) {
                // Only declaration module identities may change; runtime JavaScript stays byte-for-byte upstream.
                assert.equal(
                    String(output)
                        .replaceAll('vite-plugin-taro-runtime/runtime/mini', '@tarojs/runtime')
                        .replaceAll('vite-plugin-taro-runtime/', '@tarojs/'),
                    String(source)
                )
            } else {
                assert.deepEqual(output, source)
            }
        })
    )
}

async function assertDirectoryCopied(sourceRoot: string, outputRoot: string): Promise<void> {
    await assertFilesCopied(sourceRoot, outputRoot, await listRelativeFiles(sourceRoot))
}

async function assertSelectedPackageFilesCopied(
    sourceRoot: string,
    outputRoot: string,
    selections: readonly string[]
): Promise<void> {
    const selectedFiles = (
        await Promise.all(
            selections.map(async (selection) => {
                const source = path.join(sourceRoot, selection)
                // Match listRelativeFiles: expectations use native relative paths, not raw package selectors.
                const relativeSource = path.relative(sourceRoot, source)
                if ((await stat(source)).isFile()) {
                    return [relativeSource]
                }
                return (await listRelativeFiles(source)).map((relativePath) => path.join(relativeSource, relativePath))
            })
        )
    ).flat()
    assert.deepEqual((await listRelativeFiles(outputRoot)).toSorted(), selectedFiles.toSorted())
    await assertFilesCopied(sourceRoot, outputRoot, selectedFiles)
}

async function assertRuntimeDistCopied(sourceRoot: string, outputRoot: string): Promise<void> {
    const retainedFiles = (await listRelativeFiles(sourceRoot)).filter(
        (relativePath) => !runtimeCjsFilePattern.test(relativePath)
    )
    const outputFiles = await listRelativeFiles(outputRoot)
    assert.deepEqual(outputFiles.toSorted(), retainedFiles.toSorted())
    await assertFilesCopied(sourceRoot, outputRoot, retainedFiles)
}

test('compares selected package files using filesystem-relative paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-distribution-paths-'))
    const sourceRoot = path.join(root, 'source')
    const outputRoot = path.join(root, 'output')
    const files = ['lib/react/index.js', 'dist/taro-components/taro-components.css', 'global.css']
    try {
        await Promise.all(
            files.map(async (file) => {
                const source = path.join(sourceRoot, file)
                await mkdir(path.dirname(source), { recursive: true })
                await writeFile(source, file)
            })
        )
        await cp(sourceRoot, outputRoot, { recursive: true })
        await assertSelectedPackageFilesCopied(sourceRoot, outputRoot, [
            'lib/react',
            'dist/taro-components/taro-components.css',
            'global.css'
        ])
        // Redundant segments expose the raw-selector mismatch on POSIX too; Windows also normalizes separators.
        await assertSelectedPackageFilesCopied(sourceRoot, outputRoot, [
            './lib/react',
            'dist/taro-components/./taro-components.css',
            './global.css'
        ])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('publishes a compiler that depends on the unified Taro runtime package', async () => {
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
        devDependencies: Record<string, string>
        files: string[]
        main: string
        publishConfig: { main: string }
    }
    const compiler = await readFile(path.join(distRoot, 'index.js'), 'utf8')
    const componentFacade = await readFile(path.join(distRoot, 'runtime/client/taro/component.js'), 'utf8')
    const compilerModules = await readdir(path.join(distRoot, 'node'), { recursive: true })

    assert.equal(packageJson.main, './src/index.ts')
    assert.equal(packageJson.publishConfig.main, './dist/index.js')
    assert.ok(!packageJson.files.includes('src'))
    assert.match(h5AppPath, /\/src\/runtime\/h5\/app\.ts$/)
    assert.equal(packageJson.dependencies['@tailwindcss/vite'], '4.3.3')
    for (const name of ['helper', 'taro', 'api', 'components', 'router']) {
        assert.equal(packageJson.dependencies[`@tarojs/${name}`], undefined)
    }
    assert.equal(packageJson.dependencies['@tarojs/plugin-framework-react'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/react'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/runtime'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/taro-h5'], undefined)
    assert.equal(packageJson.dependencies['lodash-es'], undefined)
    assert.equal(packageJson.dependencies['vite-plugin-taro-runtime'], 'workspace:*')
    assert.equal(packageJson.dependencies['@tarojs/plugin-platform-alipay'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/plugin-platform-h5'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/plugin-platform-weapp'], undefined)
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-alipay'], undefined)
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-h5'], undefined)
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-weapp'], undefined)
    assert.equal(packageJson.devDependencies['@tailwindcss-mangle/engine'], '0.2.0')
    assert.equal(packageJson.devDependencies['@weapp-core/escape'], '8.0.0')
    assert.equal(packageJson.devDependencies['@weapp-tailwindcss/postcss'], '3.2.11')
    assert.equal(packageJson.devDependencies['weapp-tailwindcss'], undefined)
    assert.equal(packageJson.dependencies['weapp-tailwindcss'], undefined)
    assert.doesNotMatch(compiler, /from\s*['"]weapp-tailwindcss/)
    assert.doesNotMatch(compiler, /@tarojs\/helper/)
    assert.doesNotMatch(compiler, /\bfrom\s*['"]@tarojs\/plugin-platform-/)
    assert.match(compiler, /vite-plugin-taro-runtime\/plugin-platform-weapp\/runtime-utils/)
    assert.match(compiler, /vite-plugin-taro-runtime\/plugin-platform-alipay\/runtime-utils/)
    assert.match(compiler, /vite-plugin-taro-runtime\/plugin-platform-h5\/definition\.json/)
    assert.match(compiler, /@tailwindcss\/vite/)
    assert.ok(Buffer.byteLength(compiler) < compilerSizeLimit)
    assert.match(componentFacade, /from 'vite-plugin-taro-runtime\/components'/)
    assert.equal(
        compilerModules.some((file) => file.endsWith('.js')),
        false
    )
})

test('emits first-party runtime modules using canonical package imports', async () => {
    const runtimeRoot = path.join(distRoot, 'runtime')
    const runtimeFiles = await listRelativeFiles(runtimeRoot)
    await Promise.all(
        runtimeFiles
            .filter((file) => file.endsWith('.js'))
            .map(async (file) => {
                const source = await readFile(path.join(runtimeRoot, file), 'utf8')
                assert.doesNotMatch(source, /(?:from\s*|import\s*)['"]@tarojs\//, file)
            })
    )
})

test('builds exact size-bounded Taro runtime and platform artifacts into the runtime package', async () => {
    const packageJson = JSON.parse(await readFile(path.join(runtimePackageRoot, 'package.json'), 'utf8')) as {
        browser?: string
        dependencies: Record<string, string>
        devDependencies: Record<string, string>
        exports: Record<string, unknown>
        main?: string
        module?: string
        types?: string
    }

    assert.equal(packageJson.main, undefined)
    assert.equal(packageJson.module, undefined)
    assert.equal(packageJson.browser, undefined)
    assert.equal(packageJson.types, undefined)
    assert.deepEqual(Object.keys(packageJson.exports), [
        './runtime/mini',
        './runtime/h5',
        './api',
        './taro',
        './taro/package.json',
        './taro/types/compile',
        './components',
        './components/dist/components',
        './components/global.css',
        './components/dist/taro-components/taro-components.css',
        './router',
        './router/types/router',
        './taro-h5/dist/api/taro',
        './taro-h5/dist/api/index',
        './react',
        './plugin-framework-react/runtime',
        './plugin-framework-react/api-loader',
        './plugin-platform-weapp/runtime',
        './plugin-platform-weapp/components-react',
        './plugin-platform-weapp/runtime-utils',
        './plugin-platform-alipay/runtime',
        './plugin-platform-alipay/components-react',
        './plugin-platform-alipay/runtime-utils',
        './plugin-platform-h5/runtime/apis',
        './plugin-platform-h5/definition.json'
    ])
    assert.equal(packageJson.dependencies['@tarojs/runtime'], undefined)
    assert.equal(packageJson.dependencies['dingtalk-jsapi'], undefined)
    assert.equal(packageJson.dependencies['@tarojs/shared'], '4.2.1')
    for (const name of ['api', 'taro', 'components', 'router', 'taro-h5']) {
        assert.equal(packageJson.dependencies[`@tarojs/${name}`], undefined)
        assert.equal(packageJson.devDependencies[`@tarojs/${name}`], '4.2.1')
    }

    const apiSourceRoot = resolveAdapterDependencyRoot('@tarojs/api')
    const apiOutputRoot = path.join(runtimePackageDistRoot, 'api')
    const retainedApiFiles = (await listRelativeFiles(path.join(apiSourceRoot, 'dist')))
        .filter((relativePath) => !/^(?:index\.(?:cjs|esm)|taro)\.js(?:\.map)?$/.test(relativePath))
        .map((relativePath) => path.join('dist', relativePath))
    assert.deepEqual((await listRelativeFiles(apiOutputRoot)).toSorted(), retainedApiFiles.toSorted())
    await assertFilesCopied(apiSourceRoot, apiOutputRoot, retainedApiFiles)

    await assertSelectedPackageFilesCopied(
        resolveAdapterDependencyRoot('@tarojs/taro'),
        path.join(runtimePackageDistRoot, 'taro'),
        ['index.js', 'package.json', 'types']
    )
    await assertSelectedPackageFilesCopied(
        resolveAdapterDependencyRoot('@tarojs/components'),
        path.join(runtimePackageDistRoot, 'components'),
        ['lib/react', 'dist/components', 'types', 'global.css', 'dist/taro-components/taro-components.css']
    )

    const routerSourceRoot = resolveAdapterDependencyRoot('@tarojs/router')
    const routerOutputRoot = path.join(runtimePackageDistRoot, 'router')
    const retainedRouterFiles = (await listRelativeFiles(path.join(routerSourceRoot, 'dist')))
        .filter((relativePath) => relativePath.endsWith('.d.ts') || /^index\.esm\.js(?:\.map)?$/.test(relativePath))
        .map((relativePath) => path.join('dist', relativePath))
        .concat((await listRelativeFiles(path.join(routerSourceRoot, 'types'))).map((file) => path.join('types', file)))
    assert.deepEqual((await listRelativeFiles(routerOutputRoot)).toSorted(), retainedRouterFiles.toSorted())
    await assertFilesCopied(routerSourceRoot, routerOutputRoot, retainedRouterFiles)

    await assertSelectedPackageFilesCopied(
        resolveAdapterDependencyRoot('@tarojs/taro-h5'),
        path.join(runtimePackageDistRoot, 'taro-h5'),
        ['dist/api', 'dist/utils', 'dist/node_modules', 'types']
    )
    assert.equal(packageJson.dependencies['@tarojs/helper'], undefined)
    assert.equal(packageJson.dependencies['@swc/core'], undefined)
    assert.equal(packageJson.dependencies['lodash-es'], '4.17.21')
    assert.equal(packageJson.dependencies['react-reconciler'], '0.33.0')
    assert.equal(packageJson.devDependencies['@tarojs/plugin-framework-react'], '4.2.1')
    assert.equal(packageJson.devDependencies['@tarojs/react'], '4.2.1')
    assert.equal(packageJson.devDependencies['@tarojs/runtime'], '4.2.1')
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-weapp'], '4.2.1')
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-alipay'], '4.2.1')
    assert.equal(packageJson.devDependencies['@tarojs/plugin-platform-h5'], '4.2.1')

    const runtimeOutputRoot = path.join(runtimePackageDistRoot, 'runtime')
    await assertRuntimeDistCopied(path.join(resolveAdapterDependencyRoot('@tarojs/runtime'), 'dist'), runtimeOutputRoot)
    assert.equal(
        packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini'),
        path.join(runtimeOutputRoot, 'index.js')
    )
    assert.equal(
        packageRequire.resolve('vite-plugin-taro-runtime/runtime/h5'),
        path.join(runtimeOutputRoot, 'runtime.esm.js')
    )
    const copiedRuntimeExports = [
        ['api', 'api/dist/index.js'],
        ['taro', 'taro/index.js'],
        ['components', 'components/lib/react/index.js'],
        ['components/dist/components', 'components/dist/components/index.js'],
        ['router', 'router/dist/index.esm.js'],
        ['taro-h5/dist/api/taro', 'taro-h5/dist/api/taro.js'],
        ['taro-h5/dist/api/index', 'taro-h5/dist/api/index.js']
    ] as const
    copiedRuntimeExports.forEach(([request, output]) => {
        assert.equal(
            packageRequire.resolve(`vite-plugin-taro-runtime/${request}`),
            path.join(runtimePackageDistRoot, output)
        )
    })

    await assertDirectoryCopied(
        path.join(resolveAdapterDependencyRoot('@tarojs/react'), 'dist'),
        path.join(runtimePackageDistRoot, 'react')
    )
    await assertDirectoryCopied(
        path.join(resolveAdapterDependencyRoot('@tarojs/plugin-platform-weapp'), 'dist', 'types'),
        path.join(runtimePackageDistRoot, 'plugin-platform-weapp', 'types')
    )
    await assertDirectoryCopied(
        path.join(resolveAdapterDependencyRoot('@tarojs/plugin-platform-alipay'), 'dist', 'types'),
        path.join(runtimePackageDistRoot, 'plugin-platform-alipay', 'types')
    )
    await assertDirectoryCopied(
        path.join(resolveAdapterDependencyRoot('@tarojs/plugin-platform-h5'), 'dist', 'runtime', 'apis'),
        path.join(runtimePackageDistRoot, 'plugin-platform-h5', 'runtime', 'apis')
    )

    await Promise.all(
        platformJavaScriptFiles.flatMap(([dependencyId, outputPath]) => {
            return [[dependencyId, outputPath] as const, [`${dependencyId}.map`, `${outputPath}.map`] as const].map(
                async ([sourceId, relativeOutputPath]) => {
                    const [source, output] = await Promise.all([
                        readFile(runtimePackageRequire.resolve(sourceId)),
                        readFile(path.join(runtimePackageDistRoot, relativeOutputPath))
                    ])
                    assert.deepEqual(output, source)
                }
            )
        })
    )

    const frameworkDist = path.join(resolveAdapterDependencyRoot('@tarojs/plugin-framework-react'), 'dist')
    const [
        definition,
        copiedDefinition,
        frameworkRuntime,
        copiedFrameworkRuntime,
        apiLoader,
        copiedApiLoader,
        documentRuntime,
        rootRuntime,
        nodeRuntime,
        hydrateRuntime,
        reactRuntime
    ] = await Promise.all([
        readFile(runtimePackageRequire.resolve('@tarojs/plugin-platform-h5/dist/definition.json')),
        readFile(path.join(runtimePackageDistRoot, 'plugin-platform-h5', 'definition.json')),
        readFile(path.join(frameworkDist, 'runtime.js')),
        readFile(path.join(runtimePackageDistRoot, 'plugin-framework-react', 'runtime.js')),
        readFile(path.join(frameworkDist, 'api-loader.js')),
        readFile(path.join(runtimePackageDistRoot, 'plugin-framework-react', 'api-loader.cjs')),
        readFile(path.join(runtimePackageDistRoot, 'runtime', 'bom', 'document.js'), 'utf8'),
        readFile(path.join(runtimePackageDistRoot, 'runtime', 'dom', 'root.js'), 'utf8'),
        readFile(path.join(runtimePackageDistRoot, 'runtime', 'dom', 'node.js'), 'utf8'),
        readFile(path.join(runtimePackageDistRoot, 'runtime', 'hydrate.js'), 'utf8'),
        readFile(path.join(runtimePackageDistRoot, 'react', 'react.esm.js'), 'utf8')
    ])

    assert.deepEqual(copiedDefinition, definition)
    assert.deepEqual(copiedFrameworkRuntime, frameworkRuntime)
    assert.deepEqual(copiedApiLoader, apiLoader)
    assert.match(documentRuntime, /documentCreateElement\(ROOT_STR\)/)
    assert.match(rootRuntime, /\? 'app' : 'page'/)
    assert.match(nodeRuntime, /this\.nodeName === 'vpt_page_outlet'/)
    assert.match(hydrateRuntime, /nodeName === 'vpt_page_outlet'/)
    assert.match(reactRuntime, /reconcileVptPageOutletSpine/)
    assert.match(String(copiedFrameworkRuntime), /broadcastAppUpdate/)

    const runtimePackageFiles = await listRelativeFiles(runtimePackageDistRoot)
    const runtimePackageFileSizes = await Promise.all(
        runtimePackageFiles.map(async (relativePath) => {
            return (await readFile(path.join(runtimePackageDistRoot, relativePath))).byteLength
        })
    )
    assert.ok(runtimePackageFileSizes.reduce((total, size) => total + size, 0) < runtimePackageSizeLimit)
})
