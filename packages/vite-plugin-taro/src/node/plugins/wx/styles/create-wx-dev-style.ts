import { readFile } from 'node:fs/promises'
import type { GetModuleInfo } from 'rolldown'
import { normalizePath, type Plugin, type ViteDevServer } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { composeGraphStyleCss, createTailwindSidecarId, extractViteCss, isGlobalStyleRequest } from './utils.ts'

const javaScriptSourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/

export type WxStyleTransformer = (css: string) => Promise<Readonly<{ css: string }>>

type WxDevStyleApi = Readonly<{
    renderGlobalWxss: (getModuleInfo: GetModuleInfo) => Promise<string>
    getStyleCss: () => ReadonlyMap<string, string>
    getTailwindRoots: () => ReadonlySet<string>
    transformTailwindRoot: (rootId: string) => Promise<string>
}>

type WxDevStyleOptions = Readonly<{
    applicationEntryIds: readonly string[]
    getTailwindRoots: () => ReadonlySet<string>
    transformWxStyle: WxStyleTransformer
}>

/** Creates the serve-only WX style owner, including Tailwind root regeneration. */
export function createWxDevStyle({
    applicationEntryIds,
    getTailwindRoots,
    transformWxStyle
}: WxDevStyleOptions): Plugin<WxDevStyleApi> {
    // Vite assigns this once during serve configuration, before any later regeneration hook can request a root transform.
    let server: ViteDevServer

    // Post-transform capture and explicit Tailwind refreshes are the sole writers. This live cache retains one complete,
    // already-transformed fragment per physical style module for later deterministic WXSS composition.
    const styleCacheMap = new Map<string, string>()

    // The WX resolver owns this semantic order. Keeping only its normalized immutable value avoids reconstructing entry
    // identity from concurrent Rolldown parsing or caching derived graph state between HMR updates.
    const normalizedApplicationEntryIds = applicationEntryIds.map(normalizePath)

    /*
     * A complete build invokes moduleParsed for every JS/TSX module while Tailwind is still accumulating candidates, and its
     * normal bundle pipeline already owns final stylesheet generation. Refreshing here would perform roots × parsed scripts
     * transformations and repeatedly cache partial candidate snapshots. Rolldown's incremental HMR path does not invoke
     * buildStart/buildEnd; it invokes moduleParsed after transforming the changed source. Keeping this flag true from
     * buildStart through buildEnd therefore suppresses complete-build work while allowing only later HMR parses to refresh.
     */
    let isCompleteBuild = false

    const transformAndCacheTailwindRoot = async (rootId: string): Promise<string> => {
        const css = await transformTailwindRoot(server, rootId)
        styleCacheMap.set(rootId, css)
        return css
    }
    /*
     * Traverse and compose only when global WXSS is requested. This keeps ordinary moduleParsed events free of graph work,
     * lets HMR bursts coalesce before one O(modules + edges) pass, and always reads current import topology without retaining
     * an invalidation-sensitive intermediate style order.
     */
    const renderGlobalWxss = async (getModuleInfo: GetModuleInfo): Promise<string> => {
        const css = composeGraphStyleCss(normalizedApplicationEntryIds, getModuleInfo, styleCacheMap)
        return (await transformWxStyle(css)).css
    }

    return {
        name: 'vpt:wx-dev-style',
        apply: 'serve',
        // Keep access to the live dependencies attached until the regeneration hook consumes them.
        api: {
            getStyleCss: () => styleCacheMap,
            renderGlobalWxss,
            getTailwindRoots,
            transformTailwindRoot: transformAndCacheTailwindRoot
        },
        buildStart() {
            isCompleteBuild = true
        },
        buildEnd() {
            isCompleteBuild = false
        },
        configureServer(configuredServer) {
            server = configuredServer
        },
        async moduleParsed(moduleInfo) {
            if (isCompleteBuild || !javaScriptSourcePattern.test(normalizeModuleId(moduleInfo.id))) {
                return
            }

            await Promise.all([...getTailwindRoots()].map(transformAndCacheTailwindRoot))
        },
        transform(code, id) {
            /*
             * Vite orders this user plugin after `vite:css` and before `vite:css-post`. At this point `code` is processed CSS:
             * preprocessors, PostCSS, CSS Modules, and upstream Tailwind generation have run, but Vite has not wrapped the
             * payload in browser HMR JavaScript. Cache that CSS directly instead of extracting it from `__vite__css` later.
             */
            if (!isGlobalStyleRequest(id)) {
                return
            }

            styleCacheMap.set(normalizeModuleId(id), code)
        }
    }
}

/** Runs one physical Tailwind root through the existing Vite CSS pipeline without adding another graph source. */
async function transformTailwindRoot(server: ViteDevServer, rootId: string): Promise<string> {
    /*
     * The low-level plugin-container transform accepts code and an ID; unlike `transformRequest`, it does not load the file.
     * Read the already-discovered physical root here so CSS edits cannot leave a cached initial source behind. This read can
     * be removed if the sidecar later uses a Vite load-and-transform API, or if upstream exposes generation from a root ID
     * and owns current-source invalidation itself.
     */
    const source = await readFile(rootId, 'utf8')

    const sidecarId = createTailwindSidecarId(rootId)

    const result = await server.environments.client.pluginContainer.transform(source, sidecarId)

    return extractViteCss(result.code, rootId)
}
