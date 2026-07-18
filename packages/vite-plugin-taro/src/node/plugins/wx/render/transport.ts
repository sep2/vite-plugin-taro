import path from 'node:path'
import { types } from '@babel/core'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import { getWxModuleKind } from '../module.ts'

const transportSourcesPlaceholder = '__VITE_PLUGIN_TARO_TRANSPORT_SOURCES__'

type TransportedChunk = {
    chunk: Rolldown.RenderedChunk
    kind: 'capsule' | 'amphibious'
}

/**
 * Materializes transport while Rolldown's preliminary hash placeholders are still active, so every injected physical
 * reference participates in final hash calculation instead of changing code after its filename has been fixed.
 *
 * This intentionally creates broad hash invalidation: changing one capsule can rename transport, then bootstrap, then
 * chunks that import bootstrap. A Mini Program ships one application package rather than independently cached HTTP
 * chunks, so honest content hashes and automatic graph linking are more valuable than minimizing that hash fan-out.
 */
export async function materializeTransport({
    code,
    transportChunk,
    chunks,
    getLoadMode
}: {
    code: string
    transportChunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
}): Promise<AstTransformResult> {
    // Babel constructs and safely serializes an expression shaped like:
    // {
    //     'vpt:/assets/app.js': ['capsule', () => require('./app.js')],
    //     'vpt:/sub/p_account/page.js': ['capsule', () => require.async('../sub/p_account/page.js')],
    //     'vpt:/assets/bootstrap.js': ['amphibious', () => require('./bootstrap.js')],
    //     'vpt:/assets/rolldown-runtime.js': ['amphibious', () => require('./rolldown-runtime.js')]
    // }
    //
    // The physical transport turns amphibious namespaces into registrations at runtime. Keeping that policy in the
    // physical runtime avoids generating executable registration machinery in this render-time AST materializer.
    return await replaceWithAst(code, transportChunk.fileName, {
        [transportSourcesPlaceholder]: types.objectExpression(
            getTransportedChunks(chunks)
                .sort((left, right) => left.chunk.fileName.localeCompare(right.chunk.fileName))
                .map(({ chunk, kind }) => {
                    const loadMode = getLoadMode(chunk)
                    if (kind === 'amphibious' && loadMode !== 'sync') {
                        throw new Error(`Amphibious wx module must be in the main package: ${chunk.fileName}`)
                    }

                    return createTransportSource({
                        chunkId: chunk.fileName,
                        transportFileName: transportChunk.fileName,
                        loadMode,
                        kind
                    })
                })
        )
    })
}

/** Keeps only capsule and amphibious chunks and carries their narrowed kind into source generation. */
function getTransportedChunks(chunks: Readonly<Record<string, Rolldown.RenderedChunk>>): TransportedChunk[] {
    const transportedChunks: TransportedChunk[] = []

    for (const chunk of Object.values(chunks)) {
        const kind = getWxModuleKind(chunk)
        if (kind !== 'native') {
            transportedChunks.push({ chunk, kind })
        }
    }

    return transportedChunks
}

/** Creates one URL-keyed source descriptor while keeping its native require argument literal. */
function createTransportSource({
    chunkId,
    transportFileName,
    loadMode,
    kind
}: {
    chunkId: string
    transportFileName: string
    loadMode: 'sync' | 'async'
    kind: 'capsule' | 'amphibious'
}): ReturnType<typeof types.objectProperty> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)

    const requireCallee =
        loadMode === 'sync'
            ? types.identifier('require')
            : types.memberExpression(types.identifier('require'), types.identifier('async'))

    const load = types.arrowFunctionExpression(
        [],
        types.callExpression(requireCallee, [types.stringLiteral(requirePath)])
    )

    return types.objectProperty(
        types.stringLiteral(chunkIdToModuleUrl(chunkId)),
        types.arrayExpression([types.stringLiteral(kind), load])
    )
}

/** Converts one preliminary output path to a literal require path relative to transport. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
