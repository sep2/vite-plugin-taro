import path from 'node:path'
import type { VitePluginTaroBuildContext } from '../types.ts'
import { createPageComponentFile, normalizeModuleId } from '../utils.ts'

export type WxHmrSnapshot = {
    factories: Record<string, string>
    appRoot: string
    pageRoots: Record<string, string>
    css: string
    assets: Record<string, string | Uint8Array>
}

type BuildAsset = {
    type: 'asset'
    fileName: string
    source: string | Uint8Array
}

type BuildChunk = {
    type: 'chunk'
    fileName: string
    code: string
    facadeModuleId: string | null
}

type BuildOutput = {
    output: Array<BuildAsset | BuildChunk>
}

export type WxHmrBuildResult = BuildOutput

/** Converts preserve-modules output into factories that the WeChat App Service can execute. */
export function createWxHmrSnapshot(result: WxHmrBuildResult, context: VitePluginTaroBuildContext): WxHmrSnapshot {
    const items = result.output
    const chunks = items.filter((item): item is BuildChunk => item.type === 'chunk')

    const factories: Record<string, string> = {}
    const rootsBySource = new Map<string, string>()
    for (const chunk of chunks) {
        const moduleId = toModuleId(chunk.fileName)
        factories[moduleId] = chunk.code
        if (chunk.facadeModuleId) rootsBySource.set(normalizeSourceFile(chunk.facadeModuleId), moduleId)
    }

    const appSource = normalizeSourceFile(context.appComponentFile)
    const appRoot = rootsBySource.get(appSource)
    if (!appRoot) throw new Error(`wx HMR snapshot did not emit the app root ${JSON.stringify(appSource)}.`)

    const pageRoots: Record<string, string> = {}
    for (const page of context.pages) {
        const source = normalizeSourceFile(createPageComponentFile(page.path))
        const root = rootsBySource.get(source)
        if (!root) throw new Error(`wx HMR snapshot did not emit the page root ${JSON.stringify(source)}.`)
        pageRoots[page.path] = root
    }

    const css: string[] = []
    const assets: Record<string, string | Uint8Array> = {}
    for (const item of items) {
        if (item.type !== 'asset') continue
        if (item.fileName.endsWith('.css')) css.push(toText(item.source))
        else assets[item.fileName] = item.source
    }

    return { factories, appRoot, pageRoots, css: css.join('\n'), assets }
}

/** Emits literal JavaScript; the runtime never evaluates source received over a socket. */
export function serializeWxHmrSnapshot(snapshot: WxHmrSnapshot, version: number): string {
    const factoryEntries = Object.entries(snapshot.factories)
        .map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){\n${code}\n}`)
        .join(',\n')

    return `globalThis.__VITE_PLUGIN_TARO_WX_HMR__.applySnapshot({
version:${version},
factories:{${factoryEntries}},
appRoot:${JSON.stringify(snapshot.appRoot)},
pageRoots:${JSON.stringify(snapshot.pageRoots)}
});\n`
}

function toModuleId(fileName: string): string {
    return `/${normalizeModuleId(fileName).replace(/^\/+/, '')}`
}

function normalizeSourceFile(fileName: string): string {
    const normalized = normalizeModuleId(fileName)
    const withoutPrefix = normalized.startsWith('/@fs/') ? normalized.slice('/@fs'.length) : normalized
    return normalizeModuleId(path.resolve(withoutPrefix))
}

function toText(source: string | Uint8Array): string {
    return typeof source === 'string' ? source : new TextDecoder().decode(source)
}
