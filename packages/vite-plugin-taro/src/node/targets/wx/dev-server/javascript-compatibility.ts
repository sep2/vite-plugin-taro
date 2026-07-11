import { transformWithOxc } from 'vite'
import type { WxOutputFile } from './bundle-output.ts'

const wxJavaScriptTarget = 'es2018'

/** Lowers generated JavaScript syntax that WeChat's upload parser does not accept. */
export async function transformWxCompatibleJavaScript(code: string, filename: string): Promise<string> {
    const result = await transformWithOxc(code, filename, {
        lang: 'js',
        target: wxJavaScriptTarget,
        sourcemap: false,
        assumptions: {
            // Avoid external Oxc helpers when lowering public class fields in already-bundled chunks.
            setPublicClassFields: true
        }
    })
    return result.code
}

/** Applies the compatibility transform to every JavaScript chunk in a DevEngine output batch. */
export async function transformWxOutputChunks(output: WxOutputFile[]): Promise<void> {
    await Promise.all(
        output.map(async (item, index) => {
            if (item.type !== 'chunk') return
            output[index] = {
                type: 'chunk',
                fileName: item.fileName,
                modules: item.modules,
                code: await transformWxCompatibleJavaScript(item.code, item.fileName)
            }
        })
    )
}
