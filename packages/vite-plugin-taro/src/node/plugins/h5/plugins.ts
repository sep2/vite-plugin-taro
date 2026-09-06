import tailwindcss from '@tailwindcss/vite'
import type { HtmlTagDescriptor, Plugin, PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { toViteFileImportPath } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { tailwindcssBasedir } from '../tailwind/tailwind-css.ts'
import { h5AppPath } from './constant.ts'
import { createStencilClientAdapter } from './create-stencil-client-adapter.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'

/** Creates the plugins that own the H5 target. */
export function createH5TargetPlugins(options: VptOptions): PluginOption[] {
    return [
        // Vite owns final H5 CSS optimization; disabling Tailwind's extra pass avoids duplicate transformations.
        ...tailwindcss({ optimize: false }),
        createStencilClientAdapter(),
        createH5Plugin(options)
    ]
}

/** Configures H5 resolution and supplies the specialized physical application entry. */
function createH5Plugin(options: VptOptions): Plugin {
    const moduleResolver = createModuleResolver(options)

    return {
        name: 'vpt:h5',

        config() {
            return {
                define: createH5Defines(),
                resolve: {
                    mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
                    alias: [
                        {
                            // Tailwind is compiler-owned, so application CSS does not depend on a project installation.
                            find: /^tailwindcss(?=\/|$)/,
                            replacement: tailwindcssBasedir
                        },
                        {
                            // Pin canonical and upstream requests to compiler-owned files, even when the consumer cannot
                            // resolve the runtime package directly. Both spellings must share one optimized module.
                            find: /^(?:@tarojs\/plugin-platform-h5\/dist|vite-plugin-taro-runtime\/plugin-platform-h5)\/runtime\/apis$/,
                            replacement: packageRequire.resolve(
                                'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'
                            )
                        },
                        {
                            find: /^(?:@tarojs\/plugin-platform-h5\/dist|vite-plugin-taro-runtime\/plugin-platform-h5)\/definition\.json$/,
                            replacement: packageRequire.resolve(
                                'vite-plugin-taro-runtime/plugin-platform-h5/definition.json'
                            )
                        },
                        {
                            find: /^(?:@tarojs\/plugin-framework-react\/dist|vite-plugin-taro-runtime\/plugin-framework-react)\/runtime$/,
                            replacement: packageRequire.resolve(
                                'vite-plugin-taro-runtime/plugin-framework-react/runtime'
                            )
                        },
                        {
                            find: /^(?:@tarojs\/runtime|vite-plugin-taro-runtime\/runtime\/h5)$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/runtime/h5')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/api$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/api')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/taro-h5\/dist\/api\/taro$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/taro-h5/dist/api/taro')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/taro-h5\/dist\/api\/index$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/taro-h5/dist/api/index')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/components\/global\.css$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/components/global.css')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/components\/dist\/taro-components\/taro-components\.css$/,
                            replacement: packageRequire.resolve(
                                'vite-plugin-taro-runtime/components/dist/taro-components/taro-components.css'
                            )
                        },
                        {
                            // The hidden App bootstrap and copied H5 APIs must share this stateful router instance.
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/router$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/router')
                        },
                        {
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/components$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/components')
                        },
                        {
                            // The React entry self-imports this Stencil index by package name. Pinning both entries to the
                            // runtime package prevents Vite from transforming a second component graph.
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/components\/dist\/components$/,
                            replacement: packageRequire.resolve('vite-plugin-taro-runtime/components/dist/components')
                        }
                    ]
                },
                optimizeDeps: {
                    // The injected H5 entry is outside Vite's initial scan, so pre-bundle its stateful graph and ReactDOM.
                    include: [
                        'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis',
                        'vite-plugin-taro-runtime/plugin-framework-react/runtime',
                        'vite-plugin-taro-runtime/router',
                        'vite-plugin-taro-runtime/runtime/h5',
                        'react-dom/client'
                    ],
                    // Dependency optimization is its own Rolldown build and does not run application transform plugins.
                    // Register the same adapter there so optimized Taro components cannot embed Stencil's original client.
                    rolldownOptions: {
                        plugins: [createH5TaroOptimizerResolver(), createStencilClientAdapter()]
                    }
                },
                build: {
                    target: esTarget
                }
            }
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return moduleResolver.resolveId({
                    id,
                    projectRoot: this.environment.config.root
                })
            }
        },

        transform: {
            order: 'pre',
            handler(code, id) {
                return moduleResolver.transform({
                    code,
                    id,
                    projectRoot: this.environment.config.root,
                    sourcemap: Boolean(this.environment.config.build.sourcemap)
                })
            }
        },

        transformIndexHtml: {
            order: 'pre',
            handler() {
                return createH5IndexHtmlTags()
            }
        }
    }
}

/** Injects the physical H5 App into the application document. */
function createH5IndexHtmlTags(): HtmlTagDescriptor[] {
    return [
        {
            tag: 'script',
            attrs: {
                type: 'module'
            },
            children: `import '${toViteFileImportPath(h5AppPath)}'`,
            injectTo: 'body'
        }
    ]
}

/**
 * Optimized Taro components need the H5 core object, not the generic Mini facade. Resolve directly to the ESM backend
 * instead of importing VPT's application namespace: that would pull framework initialization into the
 * components → H5 APIs → components cycle. Application exports share the same backend's API functions and state objects.
 */
function createH5TaroOptimizerResolver(): Plugin {
    return {
        name: 'vpt:h5-optimizer-taro',
        resolveId: resolveH5OptimizerTaro
    }
}

/** Resolves only the Taro request that must remain within optimized component chunks. */
export function resolveH5OptimizerTaro(id: string): string | undefined {
    if (id === '@tarojs/taro') {
        return packageRequire.resolve('vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis')
    }
}

/** Creates H5 Taro compile-time constants. */
function createH5Defines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('h5'),
        'process.env.TARO_PLATFORM': JSON.stringify('web'),
        // Eliminate the router's optional DingTalk requires; the runtime does not install that SDK.
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}
