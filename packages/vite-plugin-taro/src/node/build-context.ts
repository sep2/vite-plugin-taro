import path from 'node:path'
import type { ConfigEnv, ResolvedConfig } from 'vite'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption, VitePluginTaroTarget } from '../options.ts'
import { CssPipeline } from './css/css-pipeline.ts'

type ProjectContext = Readonly<{
    target: VitePluginTaroTarget
    appComponentFile: string
    pages: readonly VitePluginTaroPageOption[]
    appConfig: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson?: JsonObject
    sitemapJson: JsonObject
}>

/** Owns the shared project, Vite lifecycle state, and cross-target services for one build. */
export class BuildContext {
    readonly project: ProjectContext
    readonly css: CssPipeline
    private developmentMode: boolean | undefined
    private resolvedViteConfig: ResolvedConfig | undefined

    constructor(options: VitePluginTaroOptions) {
        this.project = {
            target: options.target,
            appComponentFile: path.resolve(options.app),
            pages: options.pages,
            appConfig: {
                ...options.appJson,
                pages: options.pages.map((page) => page.path)
            },
            projectConfigJson: options.projectConfigJson,
            projectPrivateConfigJson: options.projectPrivateConfigJson,
            sitemapJson: options.sitemapJson
        }
        this.css = new CssPipeline(options.target)
    }

    configure(environment: ConfigEnv): void {
        if (this.developmentMode !== undefined)
            throw new Error('vite-plugin-taro build context was already configured.')
        this.developmentMode = environment.command === 'serve'
    }

    resolve(config: ResolvedConfig): void {
        if (this.developmentMode === undefined) {
            throw new Error('vite-plugin-taro build context resolved before it was configured.')
        }
        if (this.resolvedViteConfig) throw new Error('vite-plugin-taro build context was already resolved.')
        this.resolvedViteConfig = config
        this.css.resolve(config.root)
    }

    get development(): boolean {
        if (this.developmentMode === undefined) throw new Error('vite-plugin-taro build context is not configured.')
        return this.developmentMode
    }

    get vite(): ResolvedConfig {
        if (!this.resolvedViteConfig) throw new Error('vite-plugin-taro build context is not resolved.')
        return this.resolvedViteConfig
    }
}
