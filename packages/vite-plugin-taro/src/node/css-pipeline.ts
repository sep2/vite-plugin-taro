import path from 'node:path'
import type { Plugin } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import type { VitePluginTaroTarget } from '../options.ts'
import { normalizeModuleId } from './utils/modules.ts'

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WxCssContext = ReturnType<typeof createContext>
type CssTransformResult = { code: string; map: null }

/** Owns CSS generation and the class-name state shared by normal chunks and literal WX patches. */
export class CssPipeline {
    readonly plugin: Plugin
    private readonly target: VitePluginTaroTarget
    private readonly runtimeClassSet = new Set<string>()
    private projectRoot: string | undefined
    private wxContext: WxCssContext | undefined

    constructor(target: VitePluginTaroTarget) {
        this.target = target
        this.plugin = this.createPlugin()
    }

    resolve(projectRoot: string): void {
        if (this.projectRoot) throw new Error('vite-plugin-taro CSS pipeline was already resolved.')
        this.projectRoot = projectRoot
        this.wxContext = this.target === 'wx' ? createWxCssContext(projectRoot) : undefined
    }

    async transformWxClassNames(code: string, filename: string): Promise<CssTransformResult> {
        if (!this.wxContext || this.runtimeClassSet.size === 0) return { code, map: null }
        const result = await this.wxContext.transformJs(code, {
            runtimeSet: this.runtimeClassSet,
            filename,
            generateMap: false
        })
        return { code: result.code, map: null }
    }

    private createPlugin(): Plugin {
        const pipeline = this
        return {
            name: 'vite-plugin-taro:css',
            enforce: 'pre',

            buildStart() {
                pipeline.runtimeClassSet.clear()
            },

            async transform(code, id) {
                if (!isCssModuleId(id) || !shouldGenerateTailwindCss(code)) return

                const projectRoot = pipeline.getProjectRoot()
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
                    target: pipeline.target === 'wx' ? 'weapp' : 'web',
                    scanSources: true,
                    candidates: [],
                    styleOptions: pipeline.target === 'wx' ? wxStyleOptions : undefined
                })

                for (const className of generated.classSet) pipeline.runtimeClassSet.add(className)
                for (const dependency of generated.dependencies) this.addWatchFile(dependency)
                return generated.css
            },

            async renderChunk(code, chunk) {
                if (pipeline.target !== 'wx') return
                return await pipeline.transformWxClassNames(code, chunk.fileName)
            },

            async generateBundle(_, bundle) {
                if (pipeline.target !== 'wx') return
                const core = pipeline.getWxContext()
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

    private getProjectRoot(): string {
        if (!this.projectRoot) throw new Error('vite-plugin-taro CSS pipeline was used before configuration resolved.')
        return this.projectRoot
    }

    private getWxContext(): WxCssContext {
        if (!this.wxContext) throw new Error('vite-plugin-taro expected a resolved WeChat CSS pipeline.')
        return this.wxContext
    }
}

function createWxCssContext(projectRoot: string): WxCssContext {
    return createContext({
        appType: 'taro',
        tailwindcssBasedir: projectRoot,
        generator: { target: 'weapp' },
        ...wxStyleOptions,
        logLevel: 'silent'
    })
}

async function transformWxssAsset(core: WxCssContext, item: { source?: string | Uint8Array }): Promise<void> {
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
