import { type PluginItem, transformSync } from '@babel/core'
import generate from '@babel/generator'
import { type Rolldown, transformWithOxc } from 'vite'
import { esTarget } from './constant.ts'

export type AstTransformResult = {
    code: string
    map: Rolldown.ExistingRawSourceMap
}

/** Replaces each placeholder with a Babel AST expression while transforming the module through Oxc. */
export async function replaceWithAst(
    code: string,
    filename: string,
    replacement: Readonly<Record<string, Parameters<typeof generate>[0]>>
): Promise<AstTransformResult> {
    const define: Record<string, string> = {}

    for (const [placeholder, node] of Object.entries(replacement)) {
        requireOnePlaceholder(code, placeholder)
        define[placeholder] = ast2str(node)
    }

    const transformed = await transformWithOxc(code, filename, { define, target: esTarget })

    for (const placeholder of Object.keys(replacement)) {
        if (transformed.code.includes(placeholder)) {
            throw new Error(`Failed to replace placeholder ${placeholder} in ${filename}`)
        }
    }
    if (!transformed.map) {
        throw new Error(`Failed to generate a source map for ${filename}`)
    }

    return {
        code: transformed.code,
        map: transformed.map
    }
}

/** Serializes a Babel AST node as a compact expression for Oxc substitution. */
function ast2str(node: Parameters<typeof generate>[0]): string {
    return generate(node, { comments: false, compact: true, concise: true, minified: true }).code
}

/** Validates exactly one placeholder before Babel expression substitution. */
function requireOnePlaceholder(code: string, placeholder: string): void {
    const replacementCount = code.split(placeholder).length - 1
    if (replacementCount !== 1) {
        throw new Error(`Expected one placeholder ${placeholder}, found ${replacementCount}`)
    }
}

/** Transforms one module with Babel's shared parser and source-map configuration. */
export function transformWithBabel(code: string, filename: string, plugins: PluginItem[]): AstTransformResult {
    const transformed = transformSync(code, {
        babelrc: false,
        compact: true,
        minified: true,
        comments: false,
        configFile: false,
        filename,
        plugins,
        sourceFileName: filename,
        sourceMaps: true,
        sourceType: 'module'
    })
    if (!transformed?.code || !transformed.map) {
        throw new Error(`Failed to transform ${filename} with Babel`)
    }

    return {
        code: transformed.code,
        map: transformed.map as Rolldown.ExistingRawSourceMap
    }
}
