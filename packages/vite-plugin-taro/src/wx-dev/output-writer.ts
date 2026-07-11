import fs from 'node:fs/promises'
import path from 'node:path'

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

export class WxOutputWriter {
    private readonly outDir: string

    constructor(outDir: string) {
        this.outDir = outDir
    }

    async writeFullOutput(output: WxOutputFile[]): Promise<void> {
        await fs.mkdir(this.outDir, { recursive: true })
        await Promise.all(output.map((item) => this.writeFile(item)))
    }

    async writeOutput(output: WxOutputFile[]): Promise<void> {
        await Promise.all(output.map((item) => this.writeFile(item)))
    }

    private async writeFile(item: WxOutputFile): Promise<void> {
        const file = path.join(this.outDir, item.fileName)
        const source = item.type === 'chunk' ? item.code : item.source
        await fs.mkdir(path.dirname(file), { recursive: true })
        const temporaryFile = `${file}.tmp`
        await fs.writeFile(temporaryFile, source)
        await fs.rename(temporaryFile, file)
    }
}
