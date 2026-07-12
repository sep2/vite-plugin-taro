import fs from 'node:fs/promises'
import path from 'node:path'
import { extractSourceCandidates } from '@tailwindcss-mangle/engine'
import type { PluginOption, ResolvedConfig } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import {
    createWeappTailwindcssGenerator,
    resolveTailwindV4Source,
    type WeappTailwindcssGenerator
} from 'weapp-tailwindcss/generator'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../options.ts'
import { normalizeModuleId } from '../utils/modules.ts'
import { resolvePackageFile } from '../utils/packages.ts'

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WxContext = ReturnType<typeof createContext>
type CssEntry = { source: string; generator: WeappTailwindcssGenerator }
type PatchResult = { code: string } | { requiresFullBuild: true }

/** Owns Tailwind's Vite integration and native WX patch synchronization. */
export class CssPipeline {
    readonly plugins: PluginOption[]
    // Each Tailwind CSS entry can define a different design system, so additions must pass every relevant validator.
    private readonly entries = new Map<string, CssEntry>()
    // Vite can report the same source more than once; avoid repeating extraction and validation.
    private readonly sourceCache = new Map<string, string>()
    // Upstream owns WX JavaScript escaping; this context is deliberately reused between patches.
    private wxContext: WxContext | undefined
    // CSS transforms arrive after configResolved, so the Vite root is retained for source and module resolution.
    private root: string | undefined
    // Only classes represented by a completed WX build are safe to publish in a JavaScript-only patch.
    private builtClassSet = new Set<string>()

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
                      async transform(code, id) {
                          if (!isTailwindCssEntry(code, id)) return
                          await pipeline.registerCssEntry(id, code)
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

    async captureFullBuild(): Promise<void> {
        this.sourceCache.clear()
        // Preserve removed development CSS, matching upstream's append-only HMR default.
        for (const { generator } of this.entries.values()) {
            const result = await generator.generate({ scanSources: true })
            for (const candidate of result.classSet) this.builtClassSet.add(candidate)
        }
    }

    async transformWxss(code: string): Promise<string> {
        return (await this.getWxContext().transformWxss(code)).css
    }

    async transformNativePatch(code: string, filename: string, files: string[]): Promise<PatchResult> {
        if (await this.hasAddedCandidates(files)) return { requiresFullBuild: true }
        const result = await this.getWxContext().transformJs(code, {
            runtimeSet: this.builtClassSet,
            filename,
            generateMap: false
        })
        return { code: result.code }
    }

    private resolveWx(config: ResolvedConfig): void {
        this.root = config.root
    }

    private async registerCssEntry(id: string, source: string): Promise<void> {
        const file = resolveFile(id, this.getRoot())
        if (this.entries.get(file)?.source === source) return
        const base = path.dirname(file)
        const resolved = await resolveTailwindV4Source({
            projectRoot: this.getRoot(),
            cwd: this.getRoot(),
            base,
            baseFallbacks: [resolvePackageFile()],
            css: source,
            cssSources: [{ file, base, css: source, dependencies: [file] }]
        })
        this.entries.set(file, { source, generator: createWeappTailwindcssGenerator(resolved) })
        this.wxContext = createContext({
            appType: 'taro',
            cssEntries: [...this.entries.keys()],
            tailwindcssBasedir: this.getRoot(),
            generator: { target: 'weapp' },
            ...wxStyleOptions,
            logLevel: 'silent'
        })
    }

    private async hasAddedCandidates(files: string[]): Promise<boolean> {
        for (const input of files) {
            const file = resolveFile(input, this.getRoot())
            if (!/\.[cm]?[jt]sx?$/.test(file)) continue
            const source = await fs.readFile(file, 'utf8')
            if (this.sourceCache.get(file) === source) continue
            this.sourceCache.set(file, source)
            const extracted = await extractSourceCandidates(source, path.extname(file).slice(1))
            for (const { generator } of this.entries.values()) {
                const candidates = await generator.validateCandidates(extracted)
                // Native WX patches bypass Vite; a new utility therefore requires synchronized WXSS first.
                for (const candidate of candidates) if (!this.builtClassSet.has(candidate)) return true
            }
        }
        return false
    }

    private getWxContext(): WxContext {
        if (!this.wxContext) throw new Error('WX CSS pipeline was used before Vite resolved.')
        return this.wxContext
    }

    private getRoot(): string {
        if (!this.root) throw new Error('WX CSS pipeline was used before Vite resolved.')
        return this.root
    }
}

function isTailwindCssEntry(code: string, id: string): boolean {
    return (
        /\.(?:css|scss|sass|less|styl|stylus)(?:$|[?#])/.test(id) &&
        /@(?:import|reference)\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']/.test(code)
    )
}

function resolveFile(id: string, root: string): string {
    const normalized = normalizeModuleId(id).replace(/[?#].*$/, '')
    const file = normalized.startsWith('/@fs/') ? normalized.slice('/@fs'.length) : normalized
    return normalizeModuleId(path.resolve(root, file))
}
