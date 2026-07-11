/** File shape emitted by Vite's private bundled-development engine. */
export type WxOutputFile =
    | {
          type: 'chunk'
          fileName: string
          code: string
          modules?: Record<string, unknown>
      }
    | {
          type: 'asset'
          fileName: string
          source: string | Uint8Array
      }

/** Extracts Vite's development CSS payloads and materializes them as app.wxss. */
export function normalizeWxBundleStyles(output: WxOutputFile[]): string | undefined {
    const styles: string[] = []
    for (let index = output.length - 1; index >= 0; index--) {
        const item = output[index]
        if (!item) continue
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
            styles.unshift(typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source))
            output.splice(index, 1)
        } else if (item.type === 'chunk') {
            styles.push(...collectEmbeddedStyles(item.code))
        }
    }
    if (styles.length === 0) return
    const source = styles.join('\n')
    setWxAppStyles(output, source)
    return source
}

export function setWxAppStyles(output: WxOutputFile[], source: string): void {
    const index = output.findIndex((item) => item.type === 'asset' && item.fileName === 'app.wxss')
    const appStyle: WxOutputFile = { type: 'asset', fileName: 'app.wxss', source }
    if (index >= 0) output[index] = appStyle
    else output.push(appStyle)
}

export function isWxFullBuildOutput(output: WxOutputFile[]): boolean {
    return output.some((item) => item.fileName === 'app.js')
}

/** Forces WeChat DevTools to observe each fallback build as a distinct App Service generation. */
export function stampWxFullBuild(output: WxOutputFile[]): void {
    const index = output.findIndex((item) => item.type === 'chunk' && item.fileName === 'app.js')
    if (index < 0) return
    const app = output[index]
    if (app?.type !== 'chunk') return
    output[index] = {
        type: 'chunk',
        fileName: app.fileName,
        modules: app.modules,
        code: `${app.code}\n;(globalThis.__VITE_PLUGIN_TARO_WX__ ??= {}).fullBuild = ${Date.now()};\n`
    }
}

function collectEmbeddedStyles(code: string): string[] {
    const styles: string[] = []
    for (const match of code.matchAll(/__vite__css(?:\$\d+)?\s*=\s*("(?:\\.|[^"\\])*");/g)) {
        if (match[1]) styles.push(JSON.parse(match[1]) as string)
    }
    return styles
}
