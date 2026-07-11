import path from 'node:path'
import type { UserConfig } from 'vite'
import { nodeRequire } from '../constants.ts'
import { normalizeModuleId } from '../utils.ts'
import { virtualWxAppId } from './wx-virtual.ts'

const taroWechatComponentsReactPath = nodeRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
const vitePluginTaroSourcePath = normalizeModuleId(path.dirname(nodeRequire.resolve('vite-plugin-taro')))
const taroVersion = String(nodeRequire('@tarojs/runtime/package.json').version)

export function createWxViteConfig(production: boolean): UserConfig {
    return {
        define: createWechatTaroDefines(),
        css: {
            lightningcss: {
                visitor: {
                    Selector(selector) {
                        return selector.map((component) => {
                            if (
                                component.type === 'pseudo-element' &&
                                (component.kind === 'before' || component.kind === 'after')
                            ) {
                                return {
                                    type: 'pseudo-element' as const,
                                    kind: 'custom' as const,
                                    name: component.kind
                                }
                            }
                            return component
                        })
                    }
                }
            }
        },
        resolve: {
            alias: [{ find: /^@tarojs\/components$/, replacement: taroWechatComponentsReactPath }]
        },
        build: {
            target: 'es2018',
            assetsInlineLimit: 1024,
            cssCodeSplit: false,
            cssMinify: production ? 'lightningcss' : false,
            minify: production,
            rolldownOptions: {
                input: { app: virtualWxAppId },
                experimental: { attachDebugInfo: 'none' },
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js',
                    assetFileNames: 'assets/[name][extname]',
                    chunkFileNames: ({ name }) => `${name === 'rolldown-runtime' ? 'runtime' : name}.js`,
                    strictExecutionOrder: true,
                    codeSplitting: {
                        includeDependenciesRecursively: false,
                        minSize: 0,
                        groups: [
                            { name: 'taro', test: isWxTaroChunkModule, priority: 100 },
                            { name: 'vendors', test: isNodeModule, priority: 10 },
                            { name: 'common', minShareCount: 2, minModuleSize: 1, priority: 1 }
                        ]
                    }
                }
            }
        }
    }
}

function createWechatTaroDefines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('weapp'),
        'process.env.TARO_PLATFORM': JSON.stringify('mini'),
        'process.env.TARO_VERSION': JSON.stringify(taroVersion),
        ENABLE_ADJACENT_HTML: 'false',
        ENABLE_CLONE_NODE: 'false',
        ENABLE_CONTAINS: 'false',
        ENABLE_INNER_HTML: 'false',
        ENABLE_MUTATION_OBSERVER: 'false',
        ENABLE_SIZE_APIS: 'false',
        ENABLE_TEMPLATE_CONTENT: 'false'
    }
}

function isWxTaroChunkModule(id: string): boolean {
    const normalizedId = normalizeModuleId(id)
    return normalizedId.includes('/node_modules/@tarojs/') || normalizedId.startsWith(`${vitePluginTaroSourcePath}/`)
}

function isNodeModule(id: string): boolean {
    return normalizeModuleId(id).includes('/node_modules/')
}
