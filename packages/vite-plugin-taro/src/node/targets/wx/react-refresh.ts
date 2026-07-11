import { transformSync } from '@babel/core'
import { normalizeModuleId } from '../../module-paths.ts'
import { packageRequire } from '../../package-paths.ts'

const reactRefreshBabelPath = packageRequire.resolve('react-refresh/babel')

/** Rewrites Vite's browser-oriented Refresh output for the WX App Service global environment. */
export function transformWxReactRefreshModule(code: string, id: string, appComponentFile: string): string {
    const appFile = normalizeModuleId(appComponentFile)
    const instrumented = normalizeModuleId(id) === appFile ? instrumentWxAppComponent(code, appFile) : code
    return instrumented
        .replaceAll('window.$Refresh', 'globalThis.$Refresh')
        .replaceAll('window.__registerBeforePerformReactRefresh', 'globalThis.__registerBeforePerformReactRefresh')
        .replaceAll('window.__getReactRefreshIgnoredExports', 'globalThis.__getReactRefreshIgnoredExports')
        .replace(
            'export function register(type, id) {',
            'export function register(type, id) {\n  if (globalThis.__VITE_PLUGIN_TARO_WX__?.blockRefreshRegistration) return'
        )
        .replace(
            '\n  performReactRefresh()\n',
            '\n  globalThis.__VITE_PLUGIN_TARO_WX__?.afterRefresh?.(performReactRefresh())\n'
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
function instrumentWxAppComponent(code: string, appFile: string): string {
    const transformed = transformSync(code, {
        babelrc: false,
        configFile: false,
        filename: appFile,
        plugins: [reactRefreshBabelPath],
        sourceMaps: false
    })?.code
    if (!transformed) throw new Error(`vite-plugin-taro could not instrument the WX App component ${appFile}.`)
    return `import {
    createSignatureFunctionForTransform as __wxCreateRefreshSignature,
    register as __wxRegisterRefreshType
} from '/@react-refresh'
const $RefreshReg$ = (type, id) => __wxRegisterRefreshType(type, ${JSON.stringify(`${appFile} `)} + id)
const $RefreshSig$ = __wxCreateRefreshSignature
${transformed}
if (import.meta.hot) import.meta.hot.accept()
`
}
