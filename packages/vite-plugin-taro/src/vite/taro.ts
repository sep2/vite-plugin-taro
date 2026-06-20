
import type { Plugin, PluginOption, UserConfig } from 'vite'
import { createTaroConditionalDirectivePlugin } from './plugins.ts'
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
import type { TaroBuildContext, TaroPluginOptions } from './types.ts'
import { stripVirtualPrefix, toImportPath } from './utils.ts'
import { isPublicVirtualModuleId, loadPublicVirtualModule } from './virtual.ts'

/**
 * Creates the Vite/Rolldown plugin that emits either WeChat Mini Program files
 * or a Taro Web app using the official Taro runtime packages.
 */
export default function taro(options: TaroPluginOptions): PluginOption[] {
    const context = createTaroBuildContext(options)

    return [
        createTaroConditionalDirectivePlugin(context),
        ...createTargetSupportPlugins(context),
        createTaroPlugin(context)
    ]
}

function createTargetSupportPlugins(context: TaroBuildContext): PluginOption[] {
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
function createTaroPlugin(context: TaroBuildContext): Plugin {
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

        /** Marks generated app/page/component entries as virtual modules. */
        resolveId(id) {
            if (isPublicVirtualModuleId(id) || isWxVirtualModuleId(id) || isH5VirtualModuleId(id)) return `\0${id}`
        },

        /** Supplies source code for each virtual entry module. */
        load(id) {
            const cleanId = stripVirtualPrefix(id)

            emitWechatImplicitChunksForVirtualApp(this, context, cleanId)

            return (
                loadPublicVirtualModule(cleanId, context) ??
                loadWxVirtualModule(cleanId, context) ??
                loadH5VirtualModule(cleanId, context)
            )
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
function createTaroBuildContext(options: TaroPluginOptions): TaroBuildContext {
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
