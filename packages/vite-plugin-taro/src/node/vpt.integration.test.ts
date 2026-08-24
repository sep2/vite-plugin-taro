import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import type { OutputAsset, OutputChunk } from 'rolldown'
import { createLogger, build as viteBuild } from 'vite'
import type { VptOptions, VptTarget } from '../options.ts'
import vpt from '../vite.ts'
import { packageRequire } from './utils/packages.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const appSource = `
    import type { PropsWithChildren } from 'react'

    export default function App({ children }: PropsWithChildren) {
        return children
    }
`

type BuildOutput = readonly (OutputAsset | OutputChunk)[]

type BuildFixture = Readonly<{
    files: Readonly<Record<string, string | Uint8Array>>
    options: VptOptions
}>

/** Builds one disposable consumer project through Vite's public build API. */
async function inspectFixtureBuild<Result>(
    fixture: BuildFixture,
    inspect: (output: BuildOutput) => Result | Promise<Result>
): Promise<Result> {
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-build-test-'))
    try {
        await Promise.all(
            Object.entries(fixture.files).map(async ([fileName, source]) => {
                const filePath = path.join(root, fileName)
                await mkdir(path.dirname(filePath), { recursive: true })
                await writeFile(filePath, source)
            })
        )

        const result = await viteBuild({
            root,
            configFile: false,
            customLogger: createLogger('silent'),
            plugins: vpt(fixture.options),
            build: {
                minify: false,
                write: false
            }
        })
        if (Array.isArray(result) || !('output' in result)) {
            assert.fail('Expected one Vite environment build')
        }

        return await inspect(result.output)
    } finally {
        await rm(root, { force: true, recursive: true })
    }
}

function createOptions(target: VptTarget): VptOptions {
    return {
        target,
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index',
                config: {
                    navigationBarTitleText: 'Home'
                }
            }
        ],
        appJson: {
            pages: ['stale/route'],
            subPackages: [{ root: 'stale/package', pages: [] }],
            window: {
                navigationBarTitleText: 'Fixture App'
            }
        },
        projectConfigJson: {
            appid: 'fixture-app'
        }
    }
}

function requireAsset(output: BuildOutput, fileName: string): OutputAsset {
    const asset = output.find(
        (candidate): candidate is OutputAsset => candidate.type === 'asset' && candidate.fileName === fileName
    )
    assert.ok(asset, `Missing output asset: ${fileName}`)
    return asset
}

function requireChunk(output: BuildOutput, fileName: string): OutputChunk {
    const chunk = output.find(
        (candidate): candidate is OutputChunk => candidate.type === 'chunk' && candidate.fileName === fileName
    )
    assert.ok(chunk, `Missing output chunk: ${fileName}`)
    return chunk
}

function parseJsonAsset(output: BuildOutput, fileName: string): Record<string, unknown> {
    return JSON.parse(String(requireAsset(output, fileName).source)) as Record<string, unknown>
}

test('builds a routed H5 application through the public plugin entry', async () => {
    await inspectFixtureBuild(
        {
            options: createOptions('h5'),
            files: {
                'index.html': '<main id="app"></main>',
                'src/app.tsx': appSource,
                'src/pages/home/index.tsx': `
                    import Taro, { showToast } from '@tarojs/taro'
                    import { View } from '@tarojs/components'

                    export default function Home() {
                        const notify = () => {
                            void Taro.showToast({ title: 'default-api-marker' })
                            void showToast({ title: 'named-api-marker' })
                        }
                        return <View id="h5-home" onClick={notify}>H5 route marker</View>
                    }
                `
            }
        },
        (output) => {
            const html = String(requireAsset(output, 'index.html').source)
            const javascript = output
                .filter((candidate): candidate is OutputChunk => candidate.type === 'chunk')
                .map((chunk) => chunk.code)
                .join('\n')

            assert.match(html, /<script type="module" crossorigin src="\/assets\//)
            assert.match(javascript, /H5 route marker/)
            assert.match(javascript, /pages\/home\/index/)
            assert.match(javascript, /Fixture App/)
            assert.match(javascript, /default-api-marker/)
            assert.match(javascript, /named-api-marker/)
            assert.doesNotMatch(javascript, /stale\/route|virtual:taro/)
        }
    )
})

test('builds a complete native App and Page project for wx', async () => {
    await inspectFixtureBuild(
        {
            options: createOptions('wx'),
            files: {
                'src/app.tsx': appSource,
                'src/pages/home/index.tsx': `
                    import { View } from '@tarojs/components'

                    export default function Home() {
                        return <View id="wx-home">WX page marker</View>
                    }
                `
            }
        },
        (output) => {
            const fileNames = new Set(output.map((entry) => entry.fileName))
            const requiredFiles = [
                'app.js',
                'app.json',
                'app.wxss',
                'base.wxml',
                'comp.js',
                'comp.json',
                'comp.wxml',
                'custom-wrapper.js',
                'custom-wrapper.json',
                'custom-wrapper.wxml',
                'pages/home/index.js',
                'pages/home/index.json',
                'pages/home/index.wxml',
                'pages/home/index.wxss',
                'project.config.json',
                'utils.wxs'
            ]
            const appJson = parseJsonAsset(output, 'app.json')
            const pageJson = parseJsonAsset(output, 'pages/home/index.json')
            const javascript = output
                .filter((candidate): candidate is OutputChunk => candidate.type === 'chunk')
                .map((chunk) => chunk.code)
                .join('\n')

            assert.ok(requiredFiles.every((fileName) => fileNames.has(fileName)))
            assert.deepEqual(appJson, {
                window: {
                    navigationBarTitleText: 'Fixture App'
                },
                pages: ['pages/home/index']
            })
            assert.deepEqual(pageJson, {
                navigationBarTitleText: 'Home',
                usingComponents: {
                    comp: '../../comp',
                    'custom-wrapper': '../../custom-wrapper'
                }
            })
            assert.equal(String(requireAsset(output, 'app.json').source), JSON.stringify(appJson))
            assert.equal(String(requireAsset(output, 'pages/home/index.json').source), JSON.stringify(pageJson))
            assert.match(javascript, /WX page marker/)
            assert.doesNotMatch(requireChunk(output, 'app.js').code, /^\s*import\s/m)
            assert.doesNotMatch(requireChunk(output, 'pages/home/index.js').code, /^\s*import\s/m)
        }
    )
})

test('renders Page-local CustomWrapper through the standard recursive scopes', async () => {
    await inspectFixtureBuild(
        {
            options: createOptions('wx'),
            files: {
                'src/app.tsx': appSource,
                'src/pages/home/index.tsx': `
                    import { CustomWrapper, Text } from '@tarojs/components'
                    import { useState } from 'react'

                    export default function Home() {
                        const [count, setCount] = useState(0)
                        return (
                            <CustomWrapper id="page-wrapper">
                                <Text onClick={() => setCount((value) => value + 1)}>{count}</Text>
                            </CustomWrapper>
                        )
                    }
                `
            }
        },
        (output) => {
            const fileNames = new Set(output.map((entry) => entry.fileName))
            const baseTemplate = String(requireAsset(output, 'base.wxml').source)
            const customWrapperTemplate = String(requireAsset(output, 'custom-wrapper.wxml').source)
            const pageJson = parseJsonAsset(output, 'pages/home/index.json')
            const componentJson = parseJsonAsset(output, 'comp.json')
            const customWrapperJson = parseJsonAsset(output, 'custom-wrapper.json')
            const customWrapperDefinitions = baseTemplate.match(/<template name="tmpl_\d+_custom-wrapper">/g) ?? []
            const slotForwardingCalls =
                baseTemplate.match(
                    /<custom-wrapper i="{{i}}" l="{{l}}" id="{{i\.uid\|\|i\.sid}}" data-sid="{{i\.sid}}">\s*<slot wx:if="{{i\.vo}}" \/>/g
                ) ?? []

            assert.ok(fileNames.has('custom-wrapper.js'))
            assert.equal(customWrapperDefinitions.length, 15)
            assert.equal(slotForwardingCalls.length, 0)
            assert.match(customWrapperTemplate, /<import src="\.\/base\.wxml" \/>/)
            assert.match(customWrapperTemplate, /wx:for="{{i\.cn}}"/)
            assert.deepEqual(pageJson.usingComponents, {
                comp: '../../comp',
                'custom-wrapper': '../../custom-wrapper'
            })
            assert.deepEqual(componentJson, {
                component: true,
                styleIsolation: 'apply-shared',
                usingComponents: {
                    comp: './comp',
                    'custom-wrapper': './custom-wrapper'
                }
            })
            assert.deepEqual(customWrapperJson, {
                component: true,
                styleIsolation: 'apply-shared',
                usingComponents: {
                    comp: './comp',
                    'custom-wrapper': './custom-wrapper'
                }
            })
            assert.doesNotMatch(requireChunk(output, 'custom-wrapper.js').code, /^\s*import\s/m)
        }
    )
})

test('places a lazy wx feature in a declared code-only subpackage', async () => {
    await inspectFixtureBuild(
        {
            options: createOptions('wx'),
            files: {
                'src/app.tsx': appSource,
                'src/pages/home/index.tsx': `
                    import { lazy, Suspense } from 'react'

                    const Feature = lazy(() => import('./feature.tsx'))

                    export default function Home() {
                        return <Suspense fallback={null}><Feature /></Suspense>
                    }
                `,
                'src/pages/home/feature.tsx': `
                    import { View } from '@tarojs/components'

                    export default function Feature() {
                        return <View>Lazy wx feature marker</View>
                    }
                `
            }
        },
        (output) => {
            const chunks = output.filter((candidate): candidate is OutputChunk => candidate.type === 'chunk')
            const featureChunk = chunks.find((chunk) => chunk.code.includes('Lazy wx feature marker'))
            assert.ok(featureChunk)
            const rootMatch = /^(sub\/p_[a-f0-9]{8})\//.exec(featureChunk.fileName)
            assert.ok(rootMatch)
            const root = rootMatch[1]
            const appJson = parseJsonAsset(output, 'app.json')
            const transport = chunks.find((chunk) => chunk.code.includes('require.async'))

            assert.deepEqual(appJson.subPackages, [
                {
                    name: path.posix.basename(root),
                    root,
                    pages: []
                }
            ])
            assert.ok(transport)
            assert.match(transport.code, /require\.async/)
            assert.equal(
                chunks.some(
                    (chunk) => !chunk.fileName.startsWith(`${root}/`) && chunk.code.includes('Lazy wx feature marker')
                ),
                false
            )
        }
    )
})

test('copies and registers an opaque native wx component end to end', async () => {
    await inspectFixtureBuild(
        {
            options: createOptions('wx'),
            files: {
                'src/app.tsx': appSource,
                'src/pages/home/index.tsx': `
                    import { NativeCounter } from './native-counter.tsx'

                    export default function Home() {
                        return <NativeCounter count={1} />
                    }
                `,
                'src/pages/home/native-counter.tsx': `
                    import { defineNativeComponent } from 'virtual:taro/native'

                    export const NativeCounter = defineNativeComponent<{
                        count: number
                        onIncrement?: (event: { detail: { value: number } }) => void
                    }>(() => import('../../native/native-counter/counter.js'))
                `,
                'src/native/native-counter/counter.js': 'Component({ properties: { count: Number } })',
                'src/native/native-counter/counter.json': '{"component":true,"styleIsolation":"isolated"}',
                'src/native/native-counter/counter.wxml': '<view>Native counter marker</view>',
                'src/native/native-counter/counter.wxss': '.counter { color: red; }',
                'src/native/native-counter/payload.bin': Uint8Array.from([0, 1, 2, 255])
            }
        },
        (output) => {
            const nativeRoot = 'components/native-counter'
            const appJson = parseJsonAsset(output, 'app.json')
            const nativeJson = parseJsonAsset(output, `${nativeRoot}/counter.json`)
            const binary = requireAsset(output, `${nativeRoot}/payload.bin`).source

            assert.deepEqual(appJson.usingComponents, {
                'native-counter': '/components/native-counter/counter'
            })
            assert.deepEqual(nativeJson, {
                component: true,
                styleIsolation: 'isolated'
            })
            assert.equal(
                String(requireAsset(output, `${nativeRoot}/counter.wxml`).source),
                '<view>Native counter marker</view>'
            )
            assert.deepEqual(Buffer.from(binary), Buffer.from([0, 1, 2, 255]))
            assert.equal(
                output.some((entry) => entry.fileName.endsWith('native-counter.tsx')),
                false
            )
        }
    )
})
