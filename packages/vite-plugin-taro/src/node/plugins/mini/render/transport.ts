import path from 'node:path'
import * as types from '@babel/types'
import type { Rolldown } from 'vite'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import { toLogicalChunkId } from '../module/chunk-path.ts'
import { getMiniExecutionKind } from '../module/module.ts'

const transportPlaceholder = '__VPT_TRANSPORT__'
const moduleIdParameter = 'moduleId'
const exportBindingParameter = 'exportBinding'

type TransportedChunk = {
    chunk: Rolldown.RenderedChunk
    kind: 'capsule' | 'amphibious'
}

/**
 * Materializes transport while Rolldown's preliminary hash placeholders are still active. Each switch case deliberately has
 * two IDs: the package-neutral preliminary filename without its `assets/` directory becomes the SystemJS registration
 * identity, while the LTHP-selected assets/package-qualified filename becomes the literal native require path. Rolldown
 * substitutes both hashes after this transform, so the
 * generated transport code and its own content hash describe the exact files that `generateBundle` later materializes.
 *
 * This intentionally creates broad hash invalidation: changing one capsule can rename transport, then bootstrap, then
 * chunks that import bootstrap. A Mini Program ships one application package rather than independently cached HTTP
 * chunks, so honest content hashes and automatic graph linking are more valuable than minimizing that hash fan-out.
 */
export async function materializeTransport({
    code,
    transportChunk,
    chunks,
    getLoadMode,
    getPhysicalChunkId = (chunk) => chunk.fileName,
    sourcemap = true
}: {
    code: string
    transportChunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    getPhysicalChunkId?: (chunk: Rolldown.RenderedChunk) => string
    sourcemap?: boolean
}): Promise<AstTransformResult> {
    const physicalTransportId = getPhysicalChunkId(transportChunk)

    // Babel constructs and safely serializes an expression shaped like:
    // (moduleId) => {
    //     switch (moduleId) {
    //         case 'assets/app.js': return require('./app.js')
    //         case 'sub/p_account/page.js': return require.async('../sub/p_account/page.js')
    //         case 'assets/bootstrap.js':
    //             return [[], (exportBinding) => ({ execute() { exportBinding(require('./bootstrap.js')) } })]
    //         default: throw new Error(`Unknown System module: ${moduleId}`)
    //     }
    // }
    const cases = getTransportedChunks(chunks)
        .sort((left, right) => left.chunk.fileName.localeCompare(right.chunk.fileName))
        .map(({ chunk, kind }) => {
            const loadMode = getLoadMode(chunk)

            const logicalChunkId = toLogicalChunkId(chunk.fileName)
            // Only native loading crosses the logical/physical boundary and receives the assets/package-qualified path.
            const physicalChunkId = getPhysicalChunkId(chunk)

            if (kind === 'amphibious' && loadMode !== 'sync') {
                throw new Error(`Amphibious wx module must be in the main package: ${chunk.fileName}`)
            }

            return createTransportCase({
                chunkId: logicalChunkId,
                transportFileName: physicalTransportId,
                physicalChunkId: physicalChunkId,
                loadMode,
                kind
            })
        })

    return await replaceWithAst(
        code,
        transportChunk.fileName,
        {
            [transportPlaceholder]: types.arrowFunctionExpression(
                [types.identifier(moduleIdParameter)],
                types.blockStatement([
                    types.switchStatement(types.identifier(moduleIdParameter), [
                        ...cases,
                        createUnknownModuleCase(moduleIdParameter)
                    ])
                ])
            )
        },
        sourcemap
    )
}

/** Keeps only capsule and amphibious chunks and carries their narrowed kind into source generation. */
function getTransportedChunks(chunks: Readonly<Record<string, Rolldown.RenderedChunk>>): TransportedChunk[] {
    const transportedChunks: TransportedChunk[] = []

    for (const chunk of Object.values(chunks)) {
        const kind = getMiniExecutionKind(chunk)
        if (kind !== 'native') {
            transportedChunks.push({ chunk, kind })
        }
    }

    return transportedChunks
}

/** Creates one logical-ID switch case while keeping its physical native require argument literal. */
function createTransportCase({
    chunkId,
    transportFileName,
    loadMode,
    kind,
    physicalChunkId
}: {
    chunkId: string
    transportFileName: string
    loadMode: 'sync' | 'async'
    physicalChunkId: string
    kind: 'capsule' | 'amphibious'
}): ReturnType<typeof types.switchCase> {
    const requirePath = toNativeRequirePath(transportFileName, physicalChunkId)

    const requireCallee =
        loadMode === 'sync'
            ? types.identifier('require')
            : types.memberExpression(types.identifier('require'), types.identifier('async'))

    const loadedModule = types.callExpression(requireCallee, [types.stringLiteral(requirePath)])
    const registration = kind === 'capsule' ? loadedModule : createAmphibiousRegistrationExpression(loadedModule)

    return types.switchCase(types.stringLiteral(chunkId), [types.returnStatement(registration)])
}

/** Creates a registration that loads and publishes an amphibious CommonJS namespace only when executed. */
function createAmphibiousRegistrationExpression(namespace: types.Expression): ReturnType<typeof types.arrayExpression> {
    return types.arrayExpression([
        types.arrayExpression([]),
        types.arrowFunctionExpression(
            [types.identifier(exportBindingParameter)],
            types.objectExpression([
                types.objectMethod(
                    'method',
                    types.identifier('execute'),
                    [],
                    types.blockStatement([
                        types.expressionStatement(
                            types.callExpression(types.identifier(exportBindingParameter), [namespace])
                        )
                    ])
                )
            ])
        )
    ])
}

/** Rejects module IDs absent from the closed output graph. */
function createUnknownModuleCase(moduleId: string): ReturnType<typeof types.switchCase> {
    return types.switchCase(null, [
        types.throwStatement(
            types.newExpression(types.identifier('Error'), [
                types.binaryExpression('+', types.stringLiteral('Unknown System module: '), types.identifier(moduleId))
            ])
        )
    ])
}

/** Converts one preliminary output path to a literal require path relative to transport. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
