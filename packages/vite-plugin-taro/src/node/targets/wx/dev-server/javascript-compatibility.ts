import { transform } from 'rolldown/utils'
import type { WxOutputFile } from './bundle-output.ts'

const wxJavaScriptTarget = 'es2018'

/** Lowers generated JavaScript syntax that WeChat's upload parser does not accept. */
export async function transformWxCompatibleJavaScript(code: string, filename: string): Promise<string> {
    const result = await transform(filename, code, {
        lang: 'js',
        target: wxJavaScriptTarget,
        sourcemap: false,
        assumptions: {
            // Avoid external Oxc helpers when lowering public class fields in already-bundled chunks.
            setPublicClassFields: true
        }
    })
    if (result.errors.length) {
        throw new Error(
            `Could not lower ${filename} for WeChat: ${result.errors.map((error) => error.message).join('\n')}`
        )
    }
    return result.code
}

/** Applies the compatibility transform to every JavaScript chunk in a DevEngine output batch. */
export async function transformWxOutputChunks(output: WxOutputFile[]): Promise<void> {
    await Promise.all(
        output.map(async (item) => {
            if (item.type === 'chunk') item.code = await transformWxCompatibleJavaScript(item.code, item.fileName)
        })
    )
}
