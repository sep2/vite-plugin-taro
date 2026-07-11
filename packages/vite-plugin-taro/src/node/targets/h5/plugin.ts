import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { resolveTaroVirtualModule } from '../../taro-virtual-modules.ts'
import { stripVirtualPrefix } from '../../utils/modules.ts'
import { createH5SupportPlugins } from './support-plugins.ts'
import { createH5IndexHtmlTags, isH5VirtualModuleId, loadH5VirtualModule } from './virtual-module.ts'

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
                return resolveTaroVirtualModule(id) ?? (isH5VirtualModuleId(id) ? `\0${id}` : undefined)
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
                return createH5IndexHtmlTags(context)
            }
        }
    }
}
