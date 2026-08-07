import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { adaptWxss } from '../../css/plugins.ts'

type DevOutputFile = Readonly<{
    type: string
    fileName: string
    source?: string | Uint8Array
}>

type DevOutput = Readonly<{
    output: readonly DevOutputFile[]
}>

/** Publishes Vite bundled-dev's source-addressed global WXSS at WeChat's required root path. */
export async function publishWxDevStyle(output: DevOutput, outDir: string): Promise<void> {
    // WX disables CSS splitting, so the only non-empty WXSS asset is the application stylesheet; Page companions are empty.
    const globalStyle = output.output.find(
        (file) => file.type === 'asset' && file.fileName.endsWith('.wxss') && file.source && file.source.length > 0
    )
    if (!globalStyle?.source) return

    const source =
        typeof globalStyle.source === 'string' ? globalStyle.source : new TextDecoder().decode(globalStyle.source)
    await writeFile(path.join(outDir, 'app.wxss'), await adaptWxss(source))
}
