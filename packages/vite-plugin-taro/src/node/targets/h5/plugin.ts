import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../context.ts'
import { stripVirtualPrefix } from '../../module-paths.ts'
import { resolvePublicVirtualModuleId } from '../../virtual-module-resolver.ts'
import { createWebIndexHtmlTags, isH5VirtualModule, loadH5VirtualModule } from './virtual-entries.ts'
import { createH5SupportPlugins } from './vite-config.ts'

/** Creates the plugins that own the complete H5 target lifecycle. */
export function createH5TargetPlugins(context: BuildContext): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(context)]
}

function createH5TargetPlugin(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:h5',

        resolveId: {
            order: 'pre',
            handler(id) {
                return resolvePublicVirtualModuleId(id) ?? (isH5VirtualModule(id) ? `\0${id}` : undefined)
            }
        },

        load: {
            order: 'post',
            handler(id) {
                return loadH5VirtualModule(stripVirtualPrefix(id), context)
            }
        },

        transformIndexHtml: {
            order: 'pre',
            handler() {
                return createWebIndexHtmlTags(context)
            }
        }
    }
}
