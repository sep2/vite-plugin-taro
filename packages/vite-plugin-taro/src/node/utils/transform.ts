import { generate } from '@babel/generator'
import { RolldownMagicString } from 'rolldown'
import { type Rolldown, transformWithOxc } from 'vite'
import { esTarget } from './constant.ts'

export type AstTransformResult = {
    code: string
    map: Rolldown.ExistingRawSourceMap | null
}

/** Replaces each placeholder with a Babel AST expression while transforming the module through Oxc. */
export async function replaceWithAst(
    code: string,
    filename: string,
    replacement: Readonly<Record<string, Parameters<typeof generate>[0]>>,
    sourcemap = true
): Promise<AstTransformResult> {
    const define: Record<string, string> = {}

    for (const [placeholder, node] of Object.entries(replacement)) {
        requireOnePlaceholder(code, placeholder)
        define[placeholder] = ast2str(node)
    }

    const transformed = await transformWithOxc(code, filename, { define, sourcemap, target: esTarget })

    for (const placeholder of Object.keys(replacement)) {
        if (transformed.code.includes(placeholder)) {
            throw new Error(`Failed to replace placeholder ${placeholder} in ${filename}`)
        }
    }
    return {
        code: transformed.code,
        map: sourcemap ? (transformed.map as Rolldown.ExistingRawSourceMap) : null
    }
}

/** Serializes a Babel AST node as a compact expression for Oxc substitution. */
function ast2str(node: Parameters<typeof generate>[0]): string {
    return generate(node, { comments: false, compact: true, concise: true, minified: true }).code
}

/** Validates a unique reserved slot before recording its replacement. */
function requireOnePlaceholder(code: string, placeholder: string): void {
    const replacementCount = code.split(placeholder).length - 1
    if (replacementCount !== 1) {
        throw new Error(`Expected one placeholder ${placeholder}, found ${replacementCount}`)
    }
}

/**
 * Specializes compiler-owned templates by their unique reserved slots. This is not a JavaScript substitution API:
 * the shipped templates own the expression positions, and their tests verify those positions. Values must already be
 * serialized JavaScript expressions. Vite remains the sole owner of TypeScript/JSX lowering and syntax validation.
 */
export function replaceTemplate(
    code: string,
    filename: string,
    replacement: Readonly<Record<string, string>>,
    sourcemap: boolean
): AstTransformResult {
    // This invocation-local editor records only reserved-slot edits and retains every other source byte.
    const editor = new RolldownMagicString(code, { filename })
    for (const [placeholder, expression] of Object.entries(replacement)) {
        requireOnePlaceholder(code, placeholder)
        const start = code.indexOf(placeholder)
        editor.overwrite(start, start + placeholder.length, expression)
    }
    return { code: editor.toString(), map: sourcemap ? createSourceMap(editor, filename) : null }
}

/** Produces one plain boundary-resolution map from the same editor that emitted the source. */
function createSourceMap(editor: RolldownMagicString, filename: string): Rolldown.ExistingRawSourceMap {
    const map = editor.generateMap({ file: filename, source: filename, includeContent: true, hires: 'boundary' })
    return {
        version: map.version,
        file: map.file,
        sources: map.sources,
        sourcesContent: map.sourcesContent,
        names: map.names,
        mappings: map.mappings
    }
}
