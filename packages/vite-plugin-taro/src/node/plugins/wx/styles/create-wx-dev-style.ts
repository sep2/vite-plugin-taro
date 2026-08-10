import { readFile } from 'node:fs/promises'
import type { Plugin, ViteDevServer } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { createTailwindSidecarId, extractViteCss } from './utils.ts'

const javaScriptSourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/

type WxDevStyleApi = Readonly<{
    getTailwindCss: () => ReadonlyMap<string, string>
    getTailwindRoots: () => ReadonlySet<string>
    transformTailwindRoot: (rootId: string) => Promise<string>
}>

/** Creates the serve-only WX style owner, including Tailwind root regeneration. */
export function createWxDevStyle(getTailwindRoots: () => ReadonlySet<string>): Plugin<WxDevStyleApi> {
    // Vite assigns this once during serve configuration, before any later regeneration hook can request a root transform.
    let server: ViteDevServer

    // Root transforms are the sole writers. The live cache retains complete generated fragments for later WXSS composition.
    const tailwindCss = new Map<string, string>()

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
        tailwindCss.set(rootId, css)
        return css
    }

    return {
        name: 'vpt:wx-dev-style',
        apply: 'serve',
        // Keep access to the live dependencies attached until the regeneration hook consumes them.
        api: {
            getTailwindCss: () => tailwindCss,
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
