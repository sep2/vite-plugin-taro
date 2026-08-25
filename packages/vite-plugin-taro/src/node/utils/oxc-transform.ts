import { type WalkerEnter, walk } from 'oxc-walker'
import { RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import type { AstTransformResult } from './transform.ts'

type OxcTransformOptions = {
    code: string
    filename: string
    sourcemap: boolean
    createVisitor(editor: RolldownMagicString): WalkerEnter
}

/**
 * Parses once with Rolldown's Oxc parser and applies precise edits through its native Rust MagicString.
 *
 * These adapters previously used Babel plugins for one or two local range changes. Babel then
 * cloned and regenerated the complete module, which was unnecessary work for large dependency
 * sources and changed formatting outside the intended edit. Sharing Rolldown's parser and editor
 * keeps one AST implementation across Vite's build engine and these transforms while preserving
 * untouched source exactly. Callers provide only a visitor, so parsing, diagnostics, source-map
 * policy, and result normalization cannot drift between adapters.
 */
export function transformWithOxcWalker({
    code,
    filename,
    sourcemap,
    createVisitor
}: OxcTransformOptions): AstTransformResult {
    // `RolldownMagicString` stores edits in Rolldown's native layer. A separate `magic-string`
    // instance would duplicate a dependency already supplied by the build engine and would make
    // source-map generation cross the JavaScript boundary for every recorded segment.
    const editor = new RolldownMagicString(code, { filename })

    const result = parseSync(filename, code)

    // Oxc can return a recoverable AST together with diagnostics. Walking that partial tree could
    // let a visitor edit malformed input and hide the original syntax failure, so diagnostics are
    // rejected before any caller-owned edits run.
    if (result.errors.length > 0) {
        const diagnostics = result.errors.map((error) => error.message).join('; ')
        throw new Error(`Failed to parse ${filename} with Oxc: ${diagnostics}`)
    }

    // All visitor work is O(n) in AST size; range edits remain local and do not trigger a second
    // parse or whole-file code-generation pass.
    walk(result.program, { enter: createVisitor(editor) })

    // Boundary-resolution maps retain exact mappings around edits without the much larger cost
    // of mapping every character. Original content is required for Vite to compose this map with
    // subsequent optimizer or application transforms.
    const generatedMap = sourcemap
        ? editor.generateMap({
              file: filename,
              hires: 'boundary',
              includeContent: true,
              source: filename
          })
        : null

    return {
        code: editor.toString(),
        map: generatedMap
            ? {
                  // Return a plain source-map value instead of leaking Rolldown's native wrapper
                  // through Vite's plugin API. This also keeps the result identical in the normal
                  // application pipeline and the optimizer's independent Rolldown build.
                  version: generatedMap.version,
                  file: generatedMap.file,
                  sources: generatedMap.sources,
                  sourcesContent: generatedMap.sourcesContent,
                  names: generatedMap.names,
                  mappings: generatedMap.mappings
              }
            : null
    }
}
