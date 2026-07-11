import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../context.ts'
import { stripVirtualPrefix } from '../../module-paths.ts'
import { resolvePublicVirtualModuleId } from '../../virtual-module-resolver.ts'
import { emitWechatAssets, type WechatBundle } from './companion-assets.ts'
import { WxDevelopmentSession } from './development/session.ts'
import {
    emitWxImplicitChunks,
    isWxVirtualModule,
    loadWxVirtualModule,
    transformWxDevelopmentModule
} from './virtual-entries.ts'

/** Creates the plugins that own the complete WX build and development lifecycle. */
export function createWxTargetPlugins(context: BuildContext): PluginOption[] {
    return [createWxTargetPlugin(context)]
}

function createWxTargetPlugin(context: BuildContext): Plugin {
    let session: WxDevelopmentSession | undefined

    return {
        name: 'vite-plugin-taro:wx',

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
                return loadWxVirtualModule(cleanId, context)
            }
        },

        transform: {
            order: 'post',
            handler(code, id) {
                if (!context.behavior.reactRefresh) return
                const transformed = transformWxDevelopmentModule(code, id, context.project.appComponentFile)
                return transformed === code ? undefined : transformed
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                emitWechatAssets(this, bundle as WechatBundle, context)
                if (context.behavior.emitHmrRuntime) {
                    this.emitFile({ type: 'asset', fileName: '__wx_hmr__/update.js', source: 'void 0;\n' })
                }
            }
        },

        configureServer: {
            order: 'post',
            handler(server) {
                session = new WxDevelopmentSession(context, server)
                session.install()
            }
        },

        closeBundle() {
            return session?.close()
        }
    }
}
