import babel, { defineRolldownBabelPreset } from '@rolldown/plugin-babel'
import type { HtmlTagDescriptor, Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { toViteFileImportPath } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { clientTaroApiId } from '../client/client-taro.ts'
import { h5AppPath } from './constant.ts'
import { createStencilClientAdapter } from './create-stencil-client-adapter.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'

/** Creates the plugins that own the H5 target. */
export function createH5TargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(options)]
}

/** Configures H5 resolution and supplies the specialized physical application entry. */
function createH5TargetPlugin(options: VitePluginTaroOptions): Plugin {
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
                            find: /^@tarojs\/components$/,
                            replacement: packageRequire.resolve('@tarojs/components/lib/react')
                        },
                        {
                            find: /^@tarojs\/components\/dist\/components$/,
                            replacement: packageRequire.resolve('@tarojs/components/dist/components')
                        }
                    ]
                },
                optimizeDeps: {
                    // The compiler-owned H5 app and Taro facade are injected after Vite's initial HTML scan. Prebundle
                    // the facade's platform backend as one boundary so its CommonJS implementation details receive
                    // interop without duplicating their package list. ReactDOM needs the same treatment for the H5 app.
                    include: ['@tarojs/plugin-platform-h5/dist/runtime/apis', 'react-dom/client'],
                    // Dependency optimization is its own Rolldown build and does not run application transform plugins.
                    // Register the same adapter there so optimized Taro components cannot embed Stencil's original client.
                    rolldownOptions: {
                        plugins: [createStencilClientAdapter()]
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
 * Coarse source prefilter for the upstream Taro API transform.
 *
 * The plugin has two independent responsibilities: adapting imports from the compiler facade and normalizing camel-case
 * H5 ARIA attributes. Matching `aria` followed by any uppercase letter is intentionally broader than Taro's current
 * attribute table. A duplicated exact list would silently stop routing files through Babel when upstream adds another
 * attribute, while a broad false positive costs only one unnecessary transform. Ordinary application modules match
 * neither branch and remain entirely outside Babel's parser and generator.
 */
export const h5TaroApiTransformCodeFilter = /virtual:taro\/api|\baria[A-Z]/

/** Creates a filterable Babel preset containing Taro's upstream, scope-aware API transform. */
function createH5TaroApiPreset() {
    const transformTaroApiPath = packageRequire.resolve('babel-plugin-transform-taroapi')
    const definition = packageRequire(packageRequire.resolve('@tarojs/plugin-platform-h5/dist/definition.json'))

    return defineRolldownBabelPreset({
        preset: function h5TaroApiPreset() {
            return {
                plugins: [
                    [
                        transformTaroApiPath,
                        {
                            packageName: clientTaroApiId,
                            definition
                        }
                    ]
                ]
            }
        },
        rolldown: {
            // @rolldown/plugin-babel can lift a preset filter into its native transform hook. The Taro plugin must be
            // nested in this preset rather than passed through Babel's top-level `plugins`: explicit plugins may apply
            // to every module, so their presence deliberately disables Rolldown's preset-level code filtering.
            filter: { code: h5TaroApiTransformCodeFilter }
        }
    })
}

/** Creates H5-only transforms for Stencil CSS ordering and Taro API imports. */
function createH5SupportPlugins(): PluginOption[] {
    return [
        createStencilClientAdapter(),
        babel({
            presets: [createH5TaroApiPreset()]
        })
    ]
}

/** Creates H5 Taro compile-time constants. */
function createH5Defines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('h5'),
        'process.env.TARO_PLATFORM': JSON.stringify('web'),
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}
