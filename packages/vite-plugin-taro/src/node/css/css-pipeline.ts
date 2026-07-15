import path from 'node:path'
import type { PluginOption, ResolvedConfig } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../options.ts'
import { normalizeModuleId } from '../utils/modules.ts'

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WxContext = ReturnType<typeof createContext>

/** Owns Tailwind's Vite integration and native WX output transformation. */
export class CssPipeline {
    readonly plugins: PluginOption[]
    private readonly entries = new Map<string, string>()
    private wxContext: WxContext | undefined
    private root: string | undefined

    /** Composes the upstream web/WX plugins and records WX Tailwind entries for final WXSS transformation. */
    constructor(target: VitePluginTaroTarget) {
        const pipeline = this

        const wx = target === 'wx'

        this.plugins = [
            wx
                ? {
                      name: 'vite-plugin-taro:wx-tailwind-pipeline',
                      enforce: 'pre',
                      configResolved(config) {
                          pipeline.resolveWx(config)
                      },
                      transform(code, id) {
                          if (!isTailwindCssEntry(code, id)) return
                          pipeline.registerCssEntry(id, code)
                      }
                  }
                : undefined,
            ...(WeappTailwindcss({
                appType: 'taro',
                // Route split Tailwind imports around Vite's unresolved production CSS package imports.
                rewriteCssImports: true,
                generator: { target: wx ? 'weapp' : 'web' },
                ...(wx ? wxStyleOptions : {}),
                logLevel: 'silent'
            }) ?? [])
        ]
    }

    /** Applies upstream mini-program compatibility transforms to Taro's fully materialized WXSS. */
    async transformWxss(code: string): Promise<string> {
        return (await this.getWxContext().transformWxss(code)).css
    }

    /** Retains Vite's root for resolving later CSS transforms and changed-file notifications. */
    private resolveWx(config: ResolvedConfig): void {
        this.root = config.root
    }

    /** Refreshes the shared WX transformer when a Tailwind entry changes. */
    private registerCssEntry(id: string, source: string): void {
        const file = resolveFile(id, this.getRoot())
        if (this.entries.get(file) === source) return
        this.entries.set(file, source)
        this.wxContext = createContext({
            appType: 'taro',
            cssEntries: [...this.entries.keys()],
            tailwindcssBasedir: this.getRoot(),
            generator: { target: 'weapp' },
            ...wxStyleOptions,
            logLevel: 'silent'
        })
    }

    /** Returns the initialized WX transformer and detects invalid lifecycle ordering. */
    private getWxContext(): WxContext {
        if (!this.wxContext) throw new Error('WX CSS pipeline was used before Vite resolved.')
        return this.wxContext
    }

    /** Returns the resolved project root and detects use before Vite configuration. */
    private getRoot(): string {
        if (!this.root) throw new Error('WX CSS pipeline was used before Vite resolved.')
        return this.root
    }
}

/** Identifies style modules that establish a Tailwind design system. */
function isTailwindCssEntry(code: string, id: string): boolean {
    return (
        /\.(?:css|scss|sass|less|styl|stylus)(?:$|[?#])/.test(id) &&
        /@(?:import|reference)\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']/.test(code)
    )
}

/** Converts Vite IDs, including /@fs/ IDs and query strings, into normalized absolute paths. */
function resolveFile(id: string, root: string): string {
    const normalized = normalizeModuleId(id).replace(/[?#].*$/, '')
    const file = normalized.startsWith('/@fs/') ? normalized.slice('/@fs'.length) : normalized
    return normalizeModuleId(path.resolve(root, file))
}
