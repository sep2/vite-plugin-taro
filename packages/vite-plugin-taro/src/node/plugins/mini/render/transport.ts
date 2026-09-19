import path from 'node:path'
import type { Rolldown } from 'vite'
import { type AstTransformResult, replaceTemplate } from '../../../utils/transform.ts'
import { toLogicalChunkId } from '../module/chunk-path.ts'
import type { MiniModuleClassifier } from '../module/module.ts'

export const transportPlaceholder = '__VPT_TRANSPORT__'

/**
 * Materializes transport while Rolldown's preliminary hash placeholders are still active. Each switch case deliberately has
 * two IDs: the normalized preliminary filename becomes the SystemJS registration identity, while the LTHP-selected
 * assets/package-qualified filename becomes the literal native require path. Rolldown
 * substitutes both hashes after this transform, so the generated transport code and its own content hash describe the exact
 * files that `generateBundle` later materializes.
 *
 * This intentionally creates broad hash invalidation: changing one capsule can rename transport, then bootstrap, then
 * chunks that import bootstrap. A Mini Program ships one application package rather than independently cached HTTP
 * chunks, so honest content hashes and automatic graph linking are more valuable than minimizing that hash fan-out.
 */
export async function materializeTransport({
    code,
    transportChunk,
    chunks,
    classifyModule,
    getLoadMode,
    getPhysicalChunkId,
    sourcemap
}: {
    code: string
    transportChunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    classifyModule: MiniModuleClassifier
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    getPhysicalChunkId?: (chunk: Rolldown.RenderedChunk) => string
    sourcemap?: boolean
}): Promise<AstTransformResult> {
    const expression = createTransportExpression({
        transportChunk,
        chunks,
        classifyModule,
        getLoadMode,
        getPhysicalChunkId: getPhysicalChunkId ?? ((chunk) => chunk.fileName)
    })
    return replaceTemplate(code, transportChunk.fileName, { [transportPlaceholder]: expression }, sourcemap ?? true)
}

/**
 * Generates the closed transport expression from fixed ES2018-compatible syntax and JSON-encoded IDs and paths.
 * All require arguments stay literal; inserting this expression needs neither Babel AST construction nor another Oxc pass.
 */
export function createTransportExpression({
    transportChunk,
    chunks,
    classifyModule,
    getLoadMode,
    getPhysicalChunkId
}: {
    transportChunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    classifyModule: MiniModuleClassifier
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string
}): string {
    const from = path.posix.dirname(getPhysicalChunkId(transportChunk))

    // Fixed syntax and JSON-encoded paths produce an expression shaped like:
    // function(moduleId) {
    //     switch (moduleId) {
    //         case 'assets/app.js': return require('./app.js')
    //         case 'sub/p_account/page.js': return require.async('../sub/p_account/page.js')
    //         case 'assets/bootstrap.js':
    //             return [[], function(exportBinding) { return { execute() { exportBinding(require('./bootstrap.js')) } } }]
    //         default: throw new Error(`Unknown module: ${moduleId}`)
    //     }
    // }
    // Keep only capsule and amphibious chunks, in deterministic output order.
    const cases = Object.values(chunks)
        .map((chunk) => ({ chunk, kind: classifyModule(chunk).executionKind }))
        .filter(({ kind }) => kind !== 'native')
        .sort((left, right) => left.chunk.fileName.localeCompare(right.chunk.fileName))
        .map(({ chunk, kind }) => {
            const loadMode = getLoadMode(chunk)

            if (kind === 'amphibious' && loadMode !== 'sync') {
                throw new Error(`Amphibious module must be in the main package: ${chunk.fileName}`)
            }

            // Only native loading crosses the logical/physical boundary and receives the assets/package-qualified path.
            const relative = path.posix.relative(from, getPhysicalChunkId(chunk))

            const requirePath = JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)

            const loaded = `${loadMode === 'sync' ? 'require' : 'require.async'}(${requirePath})`

            // Amphibious namespaces must be required lazily during execution, never while bootstrap imports transport.
            const registration =
                kind === 'capsule'
                    ? loaded
                    : `[[],function(exportBinding){return {execute:function(){exportBinding(${loaded})}}}]`

            return `case ${JSON.stringify(toLogicalChunkId(chunk.fileName))}:return ${registration};`
        })
        .join('')

    // Reject module IDs absent from the closed output graph.
    return `function(moduleId){switch(moduleId){${cases}default:throw new Error('Unknown module: '+moduleId)}}`
}
