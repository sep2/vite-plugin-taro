import type { Plugin, PluginOption, UserConfig } from 'vite'
import { createVitePluginTaroConditionalDirectivePlugin } from './plugins.ts'
import { createTailwindcssPlugins } from './tailwindcss.ts'
import {
    createH5SupportPlugins,
    createH5ViteConfig,
    createWebIndexHtmlTags,
    isH5VirtualModuleId,
    loadH5VirtualModule
} from './targets/h5.ts'
import {
    createWxViteConfig,
    emitWechatAssets,
    emitWechatImplicitChunksForVirtualApp,
    isWxVirtualModuleId,
    loadWxVirtualModule
} from './targets/wx.ts'
import type { VitePluginTaroBuildContext, VitePluginTaroOptions } from './types.ts'
import { stripVirtualPrefix, toImportPath } from './utils.ts'
import { resolvePublicVirtualModuleId } from './virtual-modules.ts'

/**
 * Creates the Vite/Rolldown plugin that emits either WeChat Mini Program files
 * or a Taro Web app using the official Taro runtime packages.
 */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = createVitePluginTaroBuildContext(options)

    return [
        createVitePluginTaroConditionalDirectivePlugin(context),
        ...createTargetSupportPlugins(context),
        ...createTailwindcssPlugins(context),
        createVitePluginTaroPlugin(context)
    ]
}

function createTargetSupportPlugins(context: VitePluginTaroBuildContext): PluginOption[] {
    switch (context.target) {
        case 'h5':
            return createH5SupportPlugins()
        default:
            return []
    }
}

/**
 * Creates the vite-plugin-taro plugin that emits H5 or Wx outputs.
 */
function createVitePluginTaroPlugin(context: VitePluginTaroBuildContext): Plugin {
    return {
        name: 'vite-plugin-taro',
        enforce: 'post',

        /** Configures Vite/Rolldown for the active target. */
        config: {
            order: 'pre',
            handler: (): UserConfig => {
                return context.target === 'wx' ? createWxViteConfig(context) : createH5ViteConfig()
            }
        },

        /** Maps public virtual modules to real proxy files and marks generated entries as virtual modules. */
        resolveId(id) {
            return (
                resolvePublicVirtualModuleId(id) ??
                (isWxVirtualModuleId(id) || isH5VirtualModuleId(id) ? `\0${id}` : undefined)
            )
        },

        /** Supplies source code for each virtual entry module. */
        load(id) {
            const cleanId = stripVirtualPrefix(id)

            emitWechatImplicitChunksForVirtualApp(this, context, cleanId)

            return loadWxVirtualModule(cleanId, context) ?? loadH5VirtualModule(cleanId, context)
        },

        /** Injects the generated Web entry into the app shell before Vite scans HTML imports. */
        transformIndexHtml: {
            order: 'pre',
            handler() {
                return createWebIndexHtmlTags(context)
            }
        },

        /** Emits the WeChat JSON/WXML/WXS/WXSS files that are not JS bundle chunks. */
        generateBundle(_, bundle) {
            emitWechatAssets(this, bundle, context)
        }
    }
}

/**
 * Normalizes user options into the shared data used by both target builders.
 */
function createVitePluginTaroBuildContext(options: VitePluginTaroOptions): VitePluginTaroBuildContext {
    return {
        target: options.target,
        appComponentImport: toImportPath(options.app),
        pages: options.pages,
        appConfig: {
            ...options.appJson,
            pages: options.pages.map((page) => page.path)
        },
        projectConfigJson: options.projectConfigJson,
        sitemapJson: options.sitemapJson
    }
}
