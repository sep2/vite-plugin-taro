import path from 'node:path'
import type { PluginOption } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import type { VitePluginTaroBuildContext } from './types.ts'
import { normalizeModuleId } from './utils.ts'

const wechatStyleOptions = {
    cssCalc: false,
    // Skyline does not support -webkit-prefixed declarations.
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

type WeappTailwindcssCoreContext = ReturnType<typeof createContext>

/**
 * Generates Tailwind CSS v4 directly through weapp-tailwindcss' generator, and applies the core
 * class-name transformer to final Mini Program JS chunks.
 *
 * This keeps the Taro plugin in charge of the whole CSS pipeline instead of relying on the
 * weapp-tailwindcss Vite adaptor.
 */
export function createTaroCssPlugin(context: VitePluginTaroBuildContext): PluginOption {
    let projectRoot = process.cwd()
    let runtimeClassSet = new Set<string>()
    let weappContext: WeappTailwindcssCoreContext | undefined

    return {
        name: 'vite-plugin-taro-css',
        enforce: 'pre',

        /** Stores Vite's resolved root and eagerly creates the WX core context because both are target-static for the build. */
        configResolved(config) {
            projectRoot = config.root
            weappContext = context.target === 'wx' ? createWeappContext(projectRoot) : undefined
        },

        /** Clears collected class names for each build/rebuild so WX JS rewriting never uses stale candidates. */
        buildStart() {
            runtimeClassSet = new Set<string>()
        },

        /** Generates final CSS when a stylesheet imports Tailwind. */
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

            for (const className of generated.classSet) {
                runtimeClassSet.add(className)
            }
            for (const dependency of generated.dependencies) {
                this.addWatchFile(dependency)
            }

            return generated.css
        },

        /** Applies the WX-only weapp-tailwindcss core passes after Vite has produced concrete CSS assets and JS chunks. */
        async generateBundle(_, bundle) {
            // H5/Web is already handled by transform() with generator target "web".
            // This hook is only for Mini Program CSS finalization and JS class-name escaping.
            if (context.target !== 'wx') {
                return
            }

            if (!weappContext) {
                throw new Error('vite-plugin-taro-css expected a WeChat style context after Vite config resolution.')
            }

            const wxssTasks: Promise<void>[] = []
            for (const [fileName, item] of Object.entries(bundle)) {
                if (item.type === 'asset' && fileName.endsWith('.css')) {
                    wxssTasks.push(transformWxssAsset(weappContext, item))
                }
            }
            await Promise.all(wxssTasks)

            if (runtimeClassSet.size === 0) return

            const jsTasks: Promise<void>[] = []
            for (const item of Object.values(bundle)) {
                if (item.type === 'chunk') {
                    jsTasks.push(transformWxJsChunk(weappContext, item, runtimeClassSet))
                }
            }
            await Promise.all(jsTasks)
        }
    }
}

/**
 * Creates the WX-only weapp-tailwindcss core context once the app root is known, avoiding lazy setup in bundle output.
 */
function createWeappContext(projectRoot: string): WeappTailwindcssCoreContext {
    return createContext({
        appType: 'taro',
        tailwindcssBasedir: projectRoot,
        generator: {
            target: 'weapp'
        },
        ...wechatStyleOptions,
        logLevel: 'silent'
    })
}

/**
 * Runs weapp-tailwindcss core's WXSS pass on Vite's CSS asset so non-Tailwind CSS is normalized together with generated utilities.
 */
async function transformWxssAsset(
    core: WeappTailwindcssCoreContext,
    item: { source?: string | Uint8Array }
): Promise<void> {
    const result = await core.transformWxss(getAssetSource(item), { isMainChunk: true })
    item.source = result.css
}

/**
 * Rewrites JS class strings to match the escaped WX selectors emitted by the generator and WXSS transformer.
 */
async function transformWxJsChunk(
    core: WeappTailwindcssCoreContext,
    item: { code: string; fileName: string; map?: unknown },
    runtimeClassSet: Set<string>
): Promise<void> {
    const result = await core.transformJs(item.code, {
        runtimeSet: runtimeClassSet,
        filename: item.fileName,
        generateMap: Boolean(item.map)
    })
    item.code = result.code
    if (result.map && item.map) {
        item.map = result.map
    }
}

/**
 * Limits generation to real Tailwind entry stylesheets so ordinary CSS modules stay in Vite's normal CSS pipeline.
 */
function shouldGenerateTailwindCss(code: string): boolean {
    const tailwindEntryImportPattern =
        /@(import|reference)\s+(?:url\(\s*)?(?:["'])tailwindcss(?:\/(?:theme|preflight|utilities)(?:\.css)?)?(?:["'])/

    return code.includes('tailwindcss') && tailwindEntryImportPattern.test(code)
}

/**
 * Accepts every stylesheet language Vite can turn into CSS; Tailwind generation only runs after this file-type guard.
 */
function isCssModuleId(id: string): boolean {
    return /\.(?:css|scss|sass|less|styl|stylus)(?:$|[?#])/.test(id)
}

/**
 * Normalizes Rollup asset sources to text before passing them through weapp-tailwindcss core's WXSS transformer.
 */
function getAssetSource(item: { source?: string | Uint8Array }): string {
    if (typeof item.source === 'string') return item.source
    return item.source ? new TextDecoder().decode(item.source) : ''
}

/**
 * Converts Vite module ids back to absolute files so Tailwind can resolve CSS imports and watch dependencies.
 */
function resolveCssFile(id: string, root: string): string {
    const normalizedId = normalizeModuleId(id)
    const cleanId = normalizedId.startsWith('/@fs/') ? normalizedId.slice('/@fs'.length) : normalizedId
    return path.isAbsolute(cleanId) ? cleanId : path.resolve(root, cleanId)
}
