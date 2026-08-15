import path from 'node:path'
import type { PluginContext } from 'rolldown'
import { isCSSRequest, type Plugin, preprocessCSS, type Rolldown } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import { globalWxssFileName } from '../dev/hmr-files.ts'

type TailwindStyleModuleState = Readonly<{
    kind: 'tailwind'
    source: string
    browserCss: string
    classSet: Set<string>
}>

type StyleModuleState = Readonly<{ kind: 'css'; source: string }> | TailwindStyleModuleState

type WxStyleGeneration = Readonly<{ classSet: Set<string>; wxss: string }>

export type WxStylePlugin = Plugin &
    Readonly<{
        prepare: () => Promise<WxStyleGeneration>
        publish: (wxss: string, write: (wxss: string) => Promise<void>) => Promise<void>
        finalizeJavaScript: (code: string, classSet: Set<string>, filename: string) => Promise<string>
    }>

const nonRuntimeStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

/**
 * Creates the WX style plugin and transaction API shared by complete builds and development patches.
 *
 * Raw style modules and the live Rolldown graph are the only retained inputs. Every transaction regenerates reachable Tailwind
 * roots, runs Vite/PostCSS, composes the global cascade, and performs one WX compatibility pass. Its resulting class set then
 * finalizes every JavaScript artifact in that same transaction.
 */
export function createWxStylePlugin(applicationEntryIds: readonly string[]): WxStylePlugin {
    const weappContext = createContext({ appType: 'weapp-vite', logLevel: 'silent' })
    // buildStart installs the mutable Vite context used to read the resolved config and live graph between plugin hooks.
    let buildContext: PluginContext
    // This mutable map retains each Vite-provided style source and whether it owns Tailwind generation.
    const styleModules = new Map<string, StyleModuleState>()
    // This mutable byte frontier advances only after the development host's atomic writer succeeds.
    let publishedWxss: string | undefined

    const prepare = async (): Promise<WxStyleGeneration> => {
        const config = buildContext.environment.config
        const prepareStyle = async (styleId: string, style: StyleModuleState) => {
            if (style.kind === 'css') {
                return { processedCss: (await preprocessCSS(style.source, styleId, config)).code }
            }

            const generated = await generateTailwindRoot(config.root, styleId, style.source)
            const tailwind: TailwindStyleModuleState = {
                kind: 'tailwind',
                source: style.source,
                browserCss: generated.css,
                classSet: generated.classSet
            }
            return {
                processedCss: (await preprocessCSS(generated.css, styleId, config)).code,
                tailwind: [styleId, tailwind] as const
            }
        }

        // Transaction-local traversal state deduplicates graph cycles and aliases without retaining derived topology.
        const visitedModuleIds = new Set<string>()
        const visitedStyleIds = new Set<string>()
        const styleJobs: ReturnType<typeof prepareStyle>[] = []
        const visit = (moduleId: string): void => {
            if (visitedModuleIds.has(moduleId)) {
                return
            }
            visitedModuleIds.add(moduleId)

            const moduleInfo = buildContext.getModuleInfo(moduleId)
            if (!moduleInfo) {
                return
            }
            moduleInfo.importedIds.forEach(visit)
            moduleInfo.dynamicallyImportedIds.forEach(visit)

            const styleId = normalizeModuleId(moduleId)
            const style = styleModules.get(styleId)
            if (!style || visitedStyleIds.has(styleId)) {
                return
            }
            visitedStyleIds.add(styleId)
            styleJobs.push(prepareStyle(styleId, style))
        }
        applicationEntryIds.forEach(visit)

        const styles = await Promise.all(styleJobs)
        styleModules.forEach((style, styleId) => {
            if (style.kind === 'tailwind' && !visitedStyleIds.has(styleId)) {
                // Keep root identity for graph re-entry while excluding its stale classes from a later complete build.
                styleModules.set(styleId, {
                    kind: 'tailwind',
                    source: style.source,
                    browserCss: '',
                    classSet: new Set<string>()
                })
            }
        })

        // This transaction-local set unions generated roots while their complete-build state is refreshed.
        const classSet = new Set<string>()
        styles.forEach((style) => {
            if (!style.tailwind) {
                return
            }
            const [styleId, tailwind] = style.tailwind
            styleModules.set(styleId, tailwind)
            tailwind.classSet.forEach((className) => {
                classSet.add(className)
            })
        })
        const css = styles.map((style) => style.processedCss).join('\n')
        return {
            classSet: classSet,
            wxss: (await weappContext.transformWxss(css, wxStyleOptions)).css
        }
    }

    const finalizeJavaScript = async (code: string, classSet: Set<string>, filename: string): Promise<string> => {
        if (classSet.size === 0) {
            return code
        }

        const result = await weappContext.transformJs(code, {
            filename: filename,
            generateMap: false,
            runtimeSet: classSet
        })
        if (result.error) {
            throw result.error
        }
        return result.code
    }

    return {
        name: 'vpt:wx-styles',
        buildStart() {
            buildContext = this
        },
        transform: {
            order: 'pre',
            async handler(code, id) {
                if (!isGlobalStyleRequest(id)) {
                    return
                }

                const styleId = normalizeModuleId(id)
                if (!isTailwindRootSource(code)) {
                    styleModules.set(styleId, { kind: 'css', source: code })
                    return
                }

                const tailwind = await generateTailwindRoot(this.environment.config.root, styleId, code)
                styleModules.set(styleId, {
                    kind: 'tailwind',
                    source: code,
                    browserCss: tailwind.css,
                    classSet: tailwind.classSet
                })
                // Tailwind consumes these imports before Vite can discover them, so reconnect them to Rolldown's watch graph.
                tailwind.dependencies.forEach((dependency) => {
                    this.addWatchFile(dependency)
                })
                return { code: tailwind.css, map: null }
            }
        },
        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                const outputs = Object.values(bundle)
                const classSet = collectTailwindClassSet(styleModules)
                if (classSet.size > 0) {
                    await Promise.all(
                        outputs.map(async (output) => {
                            if (output.type !== 'chunk') return
                            output.code = await finalizeJavaScript(output.code, classSet, output.fileName)
                            output.map = null
                        })
                    )
                }

                const style = outputs.find(isStyleAsset)
                if (!style) {
                    this.emitFile({
                        type: 'asset',
                        fileName: globalWxssFileName,
                        source: publishedWxss ?? ''
                    })
                    return
                }

                const source = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
                style.source = (await weappContext.transformWxss(source, wxStyleOptions)).css
                style.fileName = globalWxssFileName
            }
        },
        prepare: prepare,
        async publish(wxss, write): Promise<void> {
            if (wxss === publishedWxss) {
                return
            }
            await write(wxss)
            publishedWxss = wxss
        },
        finalizeJavaScript: finalizeJavaScript
    }
}

function isGlobalStyleRequest(id: string): boolean {
    if (!isCSSRequest(id)) {
        return false
    }

    const queryStart = id.indexOf('?')
    if (queryStart < 0) {
        return true
    }
    const fragmentStart = id.indexOf('#', queryStart)
    const query = id.slice(queryStart + 1, fragmentStart < 0 ? undefined : fragmentStart)
    const parameters = new URLSearchParams(query)
    return nonRuntimeStyleQueries.every((parameter) => !parameters.has(parameter))
}

async function generateTailwindRoot(projectRoot: string, rootId: string, css: string) {
    const source = await resolveTailwindV4Source({
        projectRoot: projectRoot,
        cwd: tailwindcssBasedir,
        cssSources: [{ css: css, base: path.dirname(rootId), file: rootId }]
    })
    const generator = createWeappTailwindcssGenerator(source)

    try {
        return await generator.generate({
            target: 'web',
            scanSources: true,
            incrementalCache: false
        })
    } finally {
        generator.dispose?.()
    }
}

function collectTailwindClassSet(styleModules: ReadonlyMap<string, StyleModuleState>): Set<string> {
    const classSet = new Set<string>()
    styleModules.forEach((style) => {
        if (style.kind === 'tailwind') {
            style.classSet.forEach((className) => {
                classSet.add(className)
            })
        }
    })
    return classSet
}

function isTailwindRootSource(code: string): boolean {
    return (
        /@import\s+(?:url\(\s*)?['"]tailwindcss(?:\/[^'"]*)?['"]/.test(code) ||
        /@tailwind\s+(?:base|components|utilities)\b/.test(code)
    )
}

function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:css|wxss)$/.test(output.fileName)
}
