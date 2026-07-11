import path from 'node:path'
import type { ConfigEnv, ResolvedConfig } from 'vite'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption, VitePluginTaroTarget } from '../options.ts'
import { CssPipeline } from './css-pipeline.ts'

export type ProjectContext = Readonly<{
    target: VitePluginTaroTarget
    appComponentFile: string
    pages: readonly VitePluginTaroPageOption[]
    appConfig: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson: JsonObject
    sitemapJson: JsonObject
}>

export type BuildBehavior = Readonly<{
    minify: boolean
    prettyPrintJson: boolean
    bundledDevelopment: boolean
    reactRefresh: boolean
    emitHmrRuntime: boolean
}>

const buildBehaviorByCommand: Record<ConfigEnv['command'], BuildBehavior> = {
    serve: {
        minify: false,
        prettyPrintJson: true,
        bundledDevelopment: true,
        reactRefresh: true,
        emitHmrRuntime: true
    },
    build: {
        minify: true,
        prettyPrintJson: false,
        bundledDevelopment: false,
        reactRefresh: false,
        emitHmrRuntime: false
    }
}

/** Owns the shared project, Vite lifecycle state, and cross-target services for one build. */
export class BuildContext {
    readonly project: ProjectContext
    readonly css: CssPipeline
    private configuredBehavior: BuildBehavior | undefined
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
        if (this.configuredBehavior) throw new Error('vite-plugin-taro build context was already configured.')
        this.configuredBehavior = buildBehaviorByCommand[environment.command]
    }

    resolve(config: ResolvedConfig): void {
        if (!this.configuredBehavior) {
            throw new Error('vite-plugin-taro build context resolved before it was configured.')
        }
        if (this.resolvedViteConfig) throw new Error('vite-plugin-taro build context was already resolved.')
        this.resolvedViteConfig = config
        this.css.resolve(config.root)
    }

    get behavior(): BuildBehavior {
        if (!this.configuredBehavior) throw new Error('vite-plugin-taro build context is not configured.')
        return this.configuredBehavior
    }

    get vite(): ResolvedConfig {
        if (!this.resolvedViteConfig) throw new Error('vite-plugin-taro build context is not resolved.')
        return this.resolvedViteConfig
    }
}
