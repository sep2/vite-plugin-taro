import path from 'node:path'
import type { CSSOptions, PluginOption, ResolvedConfig, Rolldown } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import {
    createWeappTailwindcssGenerator,
    resolveTailwindV4Source,
    type WeappTailwindcssGenerator
} from 'weapp-tailwindcss/generator'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../../options.ts'
import { resolvePackageFile } from '../../utils/packages.ts'

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WxContext = ReturnType<typeof createContext>
type CssEntry = {
    source: string
    generator: WeappTailwindcssGenerator
}

/** Owns Tailwind generation and final WeChat CSS compatibility transforms. */
export class CssPipeline {
    /** Preserves WeChat-compatible single-colon before/after pseudo-elements during Lightning CSS transforms. */
    readonly config: CSSOptions = {
        lightningcss: {
            visitor: {
                Selector(selector) {
                    return selector.map((component) => {
                        if (
                            component.type === 'pseudo-element' &&
                            (component.kind === 'before' || component.kind === 'after')
                        ) {
                            return {
                                type: 'pseudo-element' as const,
                                kind: 'custom' as const,
                                name: component.kind
                            }
                        }
                        return component
                    })
                }
            }
        }
    }

    readonly plugins: PluginOption[]
    private readonly entries = new Map<string, CssEntry>()
    private root: string | undefined
    private wxContext: WxContext | undefined

    constructor(target: VitePluginTaroTarget) {
        const pipeline = this
        const wx = target === 'wx'

        this.plugins = [
            wx
                ? {
                      name: 'vite-plugin-taro:wx-css',
                      enforce: 'pre',
                      configResolved(config) {
                          pipeline.resolveConfig(config)
                      },
                      async transform(code, id) {
                          if (isTailwindCssEntry(code, id)) {
                              await pipeline.registerCssEntry(id, code)
                          }
                      }
                  }
                : undefined,
            ...(WeappTailwindcss({
                appType: 'taro',
                rewriteCssImports: true,
                generator: {
                    target: wx ? 'weapp' : 'web'
                },
                ...(wx ? wxStyleOptions : {}),
                logLevel: 'silent'
            }) ?? [])
        ]
    }

    /** Collects Vite CSS assets, removes their browser files, and creates root app.wxss content. */
    async createAppWxss(bundle: Rolldown.OutputBundle): Promise<string> {
        const generatedAppWxss = bundle['app.wxss']
        const transformedWxss = generatedAppWxss?.type === 'asset' ? readAsset(generatedAppWxss) : undefined
        if (transformedWxss !== undefined) {
            delete bundle['app.wxss']
        }

        const styles: string[] = []
        for (const [fileName, output] of Object.entries(bundle)) {
            if (output.type !== 'asset' || !fileName.endsWith('.css')) {
                continue
            }
            const source = readAsset(output)
            if (source) {
                styles.push(source)
            }
            delete bundle[fileName]
        }

        if (transformedWxss !== undefined) {
            return transformedWxss
        }

        const css = styles.join('\n')
        return css ? (await this.getWxContext().transformWxss(css)).css : ''
    }

    /** Retains Vite's root and initializes transforms for projects without Tailwind entries. */
    private resolveConfig(config: ResolvedConfig): void {
        this.root = config.root
        this.refreshContext()
    }

    /** Registers one Tailwind design system and refreshes the shared final WXSS transformer. */
    private async registerCssEntry(id: string, source: string): Promise<void> {
        const file = resolveFile(id, this.getRoot())
        if (this.entries.get(file)?.source === source) {
            return
        }

        const base = path.dirname(file)
        const resolved = await resolveTailwindV4Source({
            projectRoot: this.getRoot(),
            cwd: this.getRoot(),
            base,
            baseFallbacks: [resolvePackageFile()],
            css: source,
            cssSources: [
                {
                    file,
                    base,
                    css: source,
                    dependencies: [file]
                }
            ]
        })
        this.entries.set(file, {
            source,
            generator: createWeappTailwindcssGenerator(resolved)
        })
        this.refreshContext()
    }

    /** Recreates upstream context when the project root or Tailwind design systems change. */
    private refreshContext(): void {
        this.wxContext = createContext({
            appType: 'taro',
            cssEntries: [...this.entries.keys()],
            tailwindcssBasedir: this.getRoot(),
            generator: {
                target: 'weapp'
            },
            ...wxStyleOptions,
            logLevel: 'silent'
        })
    }

    /** Returns the initialized upstream transformer. */
    private getWxContext(): WxContext {
        if (!this.wxContext) {
            throw new Error('WX CSS pipeline was used before Vite resolved')
        }
        return this.wxContext
    }

    /** Returns the resolved Vite project root. */
    private getRoot(): string {
        if (!this.root) {
            throw new Error('WX CSS pipeline was used before Vite resolved')
        }
        return this.root
    }
}

/** Reads a text asset emitted by Vite. */
function readAsset(asset: Rolldown.OutputAsset): string {
    return typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
}

/** Identifies CSS modules that establish a Tailwind design system. */
function isTailwindCssEntry(code: string, id: string): boolean {
    return (
        /\.(?:css|scss|sass|less|styl|stylus)(?:$|[?#])/.test(id) &&
        /@(?:import|reference)\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']/.test(code)
    )
}

/** Converts Vite file IDs into normalized absolute paths. */
function resolveFile(id: string, root: string): string {
    const normalized = id.replaceAll('\\', '/').replace(/[?#].*$/, '')
    const file = normalized.startsWith('/@fs/') ? normalized.slice('/@fs'.length) : normalized
    return path.resolve(root, file).replaceAll('\\', '/')
}
