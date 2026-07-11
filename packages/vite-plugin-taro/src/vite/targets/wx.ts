import type { Plugin, PluginOption, ResolvedConfig } from 'vite'
import { WxDevelopmentSession } from '../../wx-dev/session.ts'
import type { WxRuntimeClassNameTransformer } from '../taro-css.ts'
import type { VitePluginTaroBuildContext } from '../types.ts'
import { stripVirtualPrefix } from '../utils.ts'
import { resolvePublicVirtualModuleId } from '../virtual-modules.ts'
import { emitWechatAssets, type WechatBundle } from './wx-assets.ts'
import { createWxViteConfig } from './wx-config.ts'
import {
    emitWxImplicitChunks,
    isWxVirtualModule,
    loadWxVirtualModule,
    transformWxDevelopmentModule
} from './wx-virtual.ts'

/** Creates the plugins that own the complete WX build and development lifecycle. */
export function createWxTargetPlugins(
    context: VitePluginTaroBuildContext,
    transformRuntimeClassNames: WxRuntimeClassNameTransformer
): PluginOption[] {
    return [createWxTargetPlugin(context, transformRuntimeClassNames)]
}

function createWxTargetPlugin(
    context: VitePluginTaroBuildContext,
    transformRuntimeClassNames: WxRuntimeClassNameTransformer
): Plugin {
    let development = false
    let production = false
    let resolvedConfig: ResolvedConfig | undefined
    let session: WxDevelopmentSession | undefined

    return {
        name: 'vite-plugin-taro:wx',

        config: {
            order: 'pre',
            handler(_, environment) {
                development = environment.command === 'serve'
                production = environment.command === 'build'
                const config = createWxViteConfig(production)
                if (development) config.experimental = { bundledDev: true }
                return config
            }
        },

        configResolved(config) {
            resolvedConfig = config
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return resolvePublicVirtualModuleId(id) ?? (isWxVirtualModule(id) ? `\0${id}` : undefined)
            }
        },

        load: {
            order: 'post',
            handler(id) {
                const cleanId = stripVirtualPrefix(id)
                emitWxImplicitChunks(this, context, cleanId)
                return loadWxVirtualModule(cleanId, context, development)
            }
        },

        transform: {
            order: 'post',
            handler(code, id) {
                if (!development) return
                const transformed = transformWxDevelopmentModule(code, id, context.appComponentFile)
                return transformed === code ? undefined : transformed
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                emitWechatAssets(this, bundle as WechatBundle, context, production)
                if (development) {
                    this.emitFile({ type: 'asset', fileName: '__wx_hmr__/update.js', source: 'void 0;\n' })
                }
            }
        },

        configureServer: {
            order: 'post',
            handler(server) {
                if (!resolvedConfig) {
                    throw new Error('vite-plugin-taro expected Vite configuration before WX server setup.')
                }
                session = new WxDevelopmentSession(resolvedConfig, server, transformRuntimeClassNames)
                session.install()
            }
        },

        closeBundle() {
            return session?.close()
        }
    }
}
