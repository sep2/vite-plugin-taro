import path from 'node:path'
import type { Plugin } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import type { VitePluginTaroBuildContext } from './context.ts'
import { normalizeModuleId } from './module-paths.ts'

const wechatStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WeappTailwindcssCoreContext = ReturnType<typeof createContext>

export type WxRuntimeClassNameTransformer = (code: string, filename: string) => Promise<{ code: string; map: null }>

export type TaroCssIntegration = {
    plugin: Plugin
    transformWxRuntimeClassNames: WxRuntimeClassNameTransformer
}

/** Creates one CSS runtime shared by normal chunk rendering and literal WX HMR patches. */
export function createTaroCssIntegration(context: VitePluginTaroBuildContext): TaroCssIntegration {
    let projectRoot = process.cwd()
    const runtimeClassSet = new Set<string>()
    let weappContext: WeappTailwindcssCoreContext | undefined

    const transformWxRuntimeClassNames: WxRuntimeClassNameTransformer = async (code, filename) => {
        if (!weappContext || runtimeClassSet.size === 0) return { code, map: null }
        const result = await weappContext.transformJs(code, {
            runtimeSet: runtimeClassSet,
            filename,
            generateMap: false
        })
        return { code: result.code, map: null }
    }

    return {
        transformWxRuntimeClassNames,
        plugin: {
            name: 'vite-plugin-taro-css',
            enforce: 'pre',

            configResolved(config) {
                projectRoot = config.root
                weappContext = context.target === 'wx' ? createWeappContext(projectRoot) : undefined
            },

            buildStart() {
                runtimeClassSet.clear()
            },

            async transform(code, id) {
                if (!isCssModuleId(id) || !shouldGenerateTailwindCss(code)) return

                const cssFile = resolveCssFile(id, projectRoot)
                const cssBase = path.dirname(cssFile)
                const source = await resolveTailwindV4Source({
                    projectRoot,
                    cwd: projectRoot,
                    base: cssBase,
                    css: code,
                    cssSources: [{ file: cssFile, base: cssBase, css: code, dependencies: [cssFile] }]
                })
                const generator = createWeappTailwindcssGenerator(source)
                const generated = await generator.generate({
                    target: context.target === 'wx' ? 'weapp' : 'web',
                    scanSources: true,
                    candidates: [],
                    styleOptions: context.target === 'wx' ? wechatStyleOptions : undefined
                })

                for (const className of generated.classSet) runtimeClassSet.add(className)
                for (const dependency of generated.dependencies) this.addWatchFile(dependency)
                return generated.css
            },

            async renderChunk(code, chunk) {
                if (context.target !== 'wx') return
                return await transformWxRuntimeClassNames(code, chunk.fileName)
            },

            async generateBundle(_, bundle) {
                if (context.target !== 'wx') return
                if (!weappContext) {
                    throw new Error(
                        'vite-plugin-taro-css expected a WeChat style context after Vite config resolution.'
                    )
                }
                const core = weappContext

                await Promise.all(
                    Object.entries(bundle).map(async ([fileName, item]) => {
                        if (item.type === 'asset' && fileName.endsWith('.css')) {
                            await transformWxssAsset(core, item)
                        }
                    })
                )
            }
        }
    }
}

function createWeappContext(projectRoot: string): WeappTailwindcssCoreContext {
    return createContext({
        appType: 'taro',
        tailwindcssBasedir: projectRoot,
        generator: { target: 'weapp' },
        ...wechatStyleOptions,
        logLevel: 'silent'
    })
}

async function transformWxssAsset(
    core: WeappTailwindcssCoreContext,
    item: { source?: string | Uint8Array }
): Promise<void> {
    const result = await core.transformWxss(getAssetSource(item), { isMainChunk: true })
    item.source = result.css
}

function shouldGenerateTailwindCss(code: string): boolean {
    const tailwindEntryImportPattern =
        /@(import|reference)\s+(?:url\(\s*)?(?:["'])tailwindcss(?:\/(?:theme|preflight|utilities)(?:\.css)?)?(?:["'])/
    return code.includes('tailwindcss') && tailwindEntryImportPattern.test(code)
}

function isCssModuleId(id: string): boolean {
    return /\.(?:css|scss|sass|less|styl|stylus)(?:$|[?#])/.test(id)
}

function getAssetSource(item: { source?: string | Uint8Array }): string {
    if (typeof item.source === 'string') return item.source
    return item.source ? new TextDecoder().decode(item.source) : ''
}

function resolveCssFile(id: string, root: string): string {
    const normalizedId = normalizeModuleId(id)
    const cleanId = normalizedId.startsWith('/@fs/') ? normalizedId.slice('/@fs'.length) : normalizedId
    return path.isAbsolute(cleanId) ? cleanId : path.resolve(root, cleanId)
}
