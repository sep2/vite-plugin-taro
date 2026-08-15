import { realpathSync } from 'node:fs'
import path from 'node:path'
import { Scanner } from '@tailwindcss/oxide'
import type { PluginContext } from 'rolldown'
import { isCSSRequest, normalizePath, type Plugin, type Rolldown } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import {
    createWeappTailwindcssGenerator,
    resolveTailwindV4Source,
    type WeappTailwindcssGenerator
} from 'weapp-tailwindcss/generator'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import { globalWxssFileName } from '../dev/hmr-files.ts'

type TailwindRoot = Readonly<{
    source: string
    classSet: Set<string>
    dependencies: ReadonlySet<string>
    generator: WeappTailwindcssGenerator
    scanner: Scanner
}>

type StyleProjection = Readonly<{
    classSet: Set<string>
    css: string
}>

type FinalizedOutput = Readonly<{
    javaScript: readonly string[]
    wxss: string
}>

type JavaScriptArtifact = Readonly<{
    code: string
    filename: string
}>

export type WxStylePlugin = Plugin &
    Readonly<{
        finalizeUpdate: <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeWxss: (wxss: string) => Promise<void>
        ) => Promise<readonly Artifact[]>
    }>

const ignoredStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const

const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

/**
 * Owns the WX boundary around Vite CSS and Rolldown incremental builds.
 *
 * Vite produces final module CSS, Tailwind roots compile only when Rolldown invalidates them, and graph projection selects
 * retained artifacts through the current application graph. Complete output and HMR patches therefore consume the same WXSS
 * and class identities without another source scan or CSS preprocessing pass.
 */
export function createWxStylePlugin(applicationEntryIds: readonly string[]): WxStylePlugin {
    const entryIds = applicationEntryIds.map(canonicalEntryId)
    const weappContext = createContext({ appType: 'weapp-vite', logLevel: 'silent' })
    // buildStart installs the mutable context required when the development host renders outside a plugin hook.
    let graphContext: PluginContext
    // This mutable map is Vite's latest successful final CSS for each physical style module.
    const cssByModuleId = new Map<string, string>()
    // This mutable map owns the incremental compiler and current candidate set for each Tailwind root.
    const tailwindByRootId = new Map<string, TailwindRoot>()
    // This mutable set delays dependency invalidation until Rolldown invokes the owning root transform.
    const staleTailwindRootIds = new Set<string>()
    // This mutable frontier advances only after the development host atomically publishes the rendered bytes.
    let publishedWxss: string | undefined

    const projectStyles = (context: PluginContext): StyleProjection => {
        // All traversal state is transaction-local; no derived topology survives an import addition or removal.
        const visitedModuleIds = new Set<string>()
        const visitedStyleIds = new Set<string>()
        const css: string[] = []
        const classSet = new Set<string>()

        const visit = (moduleId: string): void => {
            if (visitedModuleIds.has(moduleId)) {
                return
            }
            visitedModuleIds.add(moduleId)

            const moduleInfo = context.getModuleInfo(moduleId)
            if (!moduleInfo) {
                return
            }
            moduleInfo.importedIds.forEach(visit)
            moduleInfo.dynamicallyImportedIds.forEach(visit)

            const styleId = normalizeModuleId(moduleId)
            const styleCss = cssByModuleId.get(styleId)
            if (styleCss === undefined || visitedStyleIds.has(styleId)) {
                return
            }
            visitedStyleIds.add(styleId)
            css.push(styleCss)
            tailwindByRootId.get(styleId)?.classSet.forEach((className) => {
                classSet.add(className)
            })
        }
        entryIds.forEach(visit)

        return { classSet: classSet, css: css.join('\n') }
    }

    const transformJavaScript = async (code: string, classSet: Set<string>, filename: string): Promise<string> => {
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

    const finalizeOutput = async (
        context: PluginContext,
        javaScript: readonly JavaScriptArtifact[]
    ): Promise<FinalizedOutput> => {
        const projection = projectStyles(context)
        const wxss = (await weappContext.transformWxss(projection.css, wxStyleOptions)).css
        const transformedJavaScript = await Promise.all(
            javaScript.map((artifact) => transformJavaScript(artifact.code, projection.classSet, artifact.filename))
        )
        return { javaScript: transformedJavaScript, wxss: wxss }
    }

    const disposeTailwindRoots = (): void => {
        tailwindByRootId.forEach((root) => {
            root.generator.dispose?.()
        })
        tailwindByRootId.clear()
        staleTailwindRootIds.clear()
    }

    return {
        name: 'vpt:wx-styles',
        configResolved(config) {
            const cssPostPlugin = config.plugins.find((plugin) => plugin.name === 'vite:css-post')!

            // Observe Vite-final CSS immediately before its built-in post hook serializes the browser HMR module.
            wrapPluginTransform(cssPostPlugin, (transform) => {
                return async function (css, id, options) {
                    const result = await transform.call(this, css, id, options)
                    if (isApplicationStyle(id)) {
                        cssByModuleId.set(normalizeModuleId(id), css)
                    }
                    return result
                }
            })
        },
        buildStart() {
            graphContext = this
        },
        transform: {
            order: 'pre',
            async handler(code, id) {
                if (!isApplicationStyle(id)) {
                    return
                }

                const rootId = normalizeModuleId(id)
                if (!isTailwindRoot(code)) {
                    tailwindByRootId.get(rootId)?.generator.dispose?.()
                    tailwindByRootId.delete(rootId)
                    staleTailwindRootIds.delete(rootId)
                    return
                }

                const previous = tailwindByRootId.get(rootId)
                const reusable = staleTailwindRootIds.has(rootId) ? undefined : previous
                const compiled = await compileTailwindRoot(this.environment.config.root, rootId, code, reusable)
                if (compiled.root.generator !== previous?.generator) {
                    previous?.generator.dispose?.()
                }
                tailwindByRootId.set(rootId, compiled.root)
                staleTailwindRootIds.delete(rootId)
                watchTailwindRoot(this.addWatchFile.bind(this), compiled.root)
                return { code: compiled.css, map: null }
            }
        },
        watchChange(id) {
            const dependencyId = normalizeModuleId(id)
            tailwindByRootId.forEach((root, rootId) => {
                if (root.dependencies.has(dependencyId)) {
                    staleTailwindRootIds.add(rootId)
                }
            })
        },
        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                const outputs = Object.values(bundle)
                const chunks = outputs.filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')
                const finalized = await finalizeOutput(
                    this,
                    chunks.map((chunk) => ({ code: chunk.code, filename: chunk.fileName }))
                )
                chunks.forEach((chunk, index) => {
                    chunk.code = finalized.javaScript[index]!
                    chunk.map = null
                })

                const style = outputs.find(isStyleAsset)
                if (style) {
                    style.source = finalized.wxss
                    style.fileName = globalWxssFileName
                    return
                }
                this.emitFile({ type: 'asset', fileName: globalWxssFileName, source: finalized.wxss })
            }
        },
        closeBundle() {
            if (this.environment.config.command === 'build') {
                disposeTailwindRoots()
            }
        },
        closeWatcher() {
            disposeTailwindRoots()
        },
        finalizeUpdate: async <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeWxss: (wxss: string) => Promise<void>
        ): Promise<readonly Artifact[]> => {
            const output = await finalizeOutput(graphContext, artifacts)
            if (output.wxss !== publishedWxss) {
                await writeWxss(output.wxss)
                publishedWxss = output.wxss
            }
            return artifacts.map((artifact, index) => ({ ...artifact, code: output.javaScript[index]! }))
        }
    }
}

async function compileTailwindRoot(
    projectRoot: string,
    rootId: string,
    css: string,
    previous: TailwindRoot | undefined
): Promise<Readonly<{ css: string; root: TailwindRoot }>> {
    const reuse = previous?.source === css
    const generator = reuse
        ? previous.generator
        : createWeappTailwindcssGenerator(
              await resolveTailwindV4Source({
                  projectRoot: projectRoot,
                  cwd: tailwindcssBasedir,
                  cssSources: [{ css: css, base: path.dirname(rootId), file: rootId }]
              })
          )

    try {
        const generated = await generator.generate({ target: 'web', scanSources: true, incrementalCache: true })
        return {
            css: generated.css,
            root: {
                source: css,
                classSet: generated.classSet,
                dependencies: new Set(generated.dependencies.map(normalizeModuleId)),
                generator: generator,
                scanner: reuse ? previous.scanner : new Scanner({ sources: generated.sources })
            }
        }
    } catch (error) {
        if (!reuse) {
            generator.dispose?.()
        }
        throw error
    }
}

function watchTailwindRoot(
    addWatchFile: (id: string) => void,
    root: Pick<TailwindRoot, 'dependencies' | 'scanner'>
): void {
    root.dependencies.forEach(addWatchFile)
    root.scanner.files.forEach(addWatchFile)
}

function canonicalEntryId(id: string): string {
    const queryStart = id.indexOf('?')
    const file = queryStart < 0 ? id : id.slice(0, queryStart)
    const query = queryStart < 0 ? '' : id.slice(queryStart)
    return `${normalizePath(realpathSync.native(file))}${query}`
}

function isApplicationStyle(id: string): boolean {
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
    return ignoredStyleQueries.every((parameter) => !parameters.has(parameter))
}

function isTailwindRoot(code: string): boolean {
    return (
        /@import\s+(?:url\(\s*)?['"]tailwindcss(?:\/[^'"]*)?['"]/.test(code) ||
        /@tailwind\s+(?:base|components|utilities)\b/.test(code)
    )
}

function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:css|wxss)$/.test(output.fileName)
}
