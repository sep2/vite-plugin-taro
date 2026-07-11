import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { stripVirtualPrefix } from '../../module-paths.ts'
import { resolveTaroVirtualModule } from '../../taro-virtual-modules.ts'
import { emitWxCompanionAssets, type WxBundle } from './companion-assets.ts'
import { WxDevServerSession } from './dev-server/session.ts'
import { transformWxReactRefreshModule } from './react-refresh.ts'
import { emitWxEntryChunks, isWxVirtualModuleId, loadWxVirtualModule } from './virtual-modules.ts'

/** Creates the plugins that own the complete WX build and development lifecycle. */
export function createWxTargetPlugins(context: BuildContext): PluginOption[] {
    return [createWxTargetPlugin(context)]
}

function createWxTargetPlugin(context: BuildContext): Plugin {
    let session: WxDevServerSession | undefined

    return {
        name: 'vite-plugin-taro:wx',

        resolveId: {
            order: 'pre',
            handler(id) {
                return resolveTaroVirtualModule(id) ?? (isWxVirtualModuleId(id) ? `\0${id}` : undefined)
            }
        },

        load: {
            order: 'post',
            handler(id) {
                const cleanId = stripVirtualPrefix(id)
                emitWxEntryChunks(this, context, cleanId)
                return loadWxVirtualModule(cleanId, context)
            }
        },

        transform: {
            order: 'post',
            async handler(code, id) {
                if (!context.development) return
                const transformed = await transformWxReactRefreshModule(code, id, context.project.appComponentFile)
                return transformed === code ? undefined : transformed
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                emitWxCompanionAssets(this, bundle as WxBundle, context)
            }
        },

        configureServer: {
            order: 'post',
            handler(server) {
                session = new WxDevServerSession(context, server)
                session.install()
            }
        },

        closeBundle() {
            return session?.close()
        }
    }
}
