import { transformWithOxc } from 'vite'
import { normalizeModuleId } from '../../utils/modules.ts'

/** Rewrites Vite's browser-oriented Refresh output for the WX global environment. */
export async function transformWxReactRefreshModule(
    code: string,
    id: string,
    appComponentFile: string
): Promise<string> {
    const appFile = normalizeModuleId(appComponentFile)
    const instrumented = normalizeModuleId(id) === appFile ? await instrumentWxAppComponent(code, appFile) : code
    return instrumented
        .replaceAll('window.$Refresh', 'globalThis.$Refresh')
        .replaceAll('window.__registerBeforePerformReactRefresh', 'globalThis.__registerBeforePerformReactRefresh')
        .replaceAll('window.__getReactRefreshIgnoredExports', 'globalThis.__getReactRefreshIgnoredExports')
        .replace(
            'export function register(type, id) {',
            'export function register(type, id) {\n  if (globalThis.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__?.blockRefreshRegistration) return'
        )
        .replace(
            '\n  performReactRefresh()\n',
            '\n  globalThis.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__?.afterRefresh?.(performReactRefresh())\n'
        )
}

/** Creates the virtual preamble that installs React Refresh before the generated WX App entry executes. */
export function createWxReactRefreshPreambleSource(): string {
    return `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.$RefreshReg$ = () => {}
globalThis.$RefreshSig$ = () => (type) => type
`
}

/** Adds Refresh registration to JSX-free App modules that Vite's normal JSX transform would otherwise skip. */
async function instrumentWxAppComponent(code: string, appFile: string): Promise<string> {
    const transformed = await transformWithOxc(code, appFile, {
        lang: 'js',
        sourcemap: false,
        jsx: { refresh: true }
    })
    return `import {
    createSignatureFunctionForTransform as __wxCreateRefreshSignature,
    register as __wxRegisterRefreshType
} from '/@react-refresh'
const $RefreshReg$ = (type, id) => __wxRegisterRefreshType(type, ${JSON.stringify(`${appFile} `)} + id)
const $RefreshSig$ = __wxCreateRefreshSignature
${transformed.code}
if (import.meta.hot) import.meta.hot.accept()
`
}
