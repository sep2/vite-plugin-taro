import path from 'node:path'
import { types } from '@babel/core'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import { getWxModuleKind } from '../module.ts'

const transportPlaceholder = '__VITE_PLUGIN_TARO_TRANSPORT__'
const moduleIdParameter = 'moduleId'
const namespaceVariable = 'namespace'
const exportBindingParameter = 'exportBinding'

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
    getLoadMode,
    sourcemap = true
}: {
    code: string
    transportChunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    sourcemap?: boolean
}): Promise<AstTransformResult> {
    // Babel constructs and safely serializes an expression shaped like:
    // (moduleId) => {
    //     let namespace
    //     switch (moduleId) {
    //         case 'vpt:/assets/app.js': return require('./app.js')
    //         case 'vpt:/sub/p_account/page.js': return require.async('../sub/p_account/page.js')
    //         case 'vpt:/assets/bootstrap.js':
    //             namespace = require('./bootstrap.js')
    //             break
    //         default: throw new Error(`Unknown System module: ${moduleId}`)
    //     }
    //     return [[], (exportBinding) => ({ execute() { exportBinding(namespace) } })]
    // }
    const cases = getTransportedChunks(chunks)
        .sort((left, right) => left.chunk.fileName.localeCompare(right.chunk.fileName))
        .map(({ chunk, kind }) => {
            const loadMode = getLoadMode(chunk)
            if (kind === 'amphibious' && loadMode !== 'sync') {
                throw new Error(`Amphibious wx module must be in the main package: ${chunk.fileName}`)
            }

            return createTransportCase({
                chunkId: chunk.fileName,
                transportFileName: transportChunk.fileName,
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
                    types.variableDeclaration('let', [types.variableDeclarator(types.identifier(namespaceVariable))]),
                    types.switchStatement(types.identifier(moduleIdParameter), [
                        ...cases,
                        createUnknownModuleCase(moduleIdParameter)
                    ]),
                    types.returnStatement(createAmphibiousRegistrationExpression(namespaceVariable))
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
        const kind = getWxModuleKind(chunk)
        if (kind !== 'native') {
            transportedChunks.push({ chunk, kind })
        }
    }

    return transportedChunks
}

/** Creates one URL-keyed switch case while keeping its native require argument literal. */
function createTransportCase({
    chunkId,
    transportFileName,
    loadMode,
    kind
}: {
    chunkId: string
    transportFileName: string
    loadMode: 'sync' | 'async'
    kind: 'capsule' | 'amphibious'
}): ReturnType<typeof types.switchCase> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)

    const requireCallee =
        loadMode === 'sync'
            ? types.identifier('require')
            : types.memberExpression(types.identifier('require'), types.identifier('async'))

    const registration = types.callExpression(requireCallee, [types.stringLiteral(requirePath)])

    const statements =
        kind === 'capsule'
            ? [types.returnStatement(registration)]
            : [
                  types.expressionStatement(
                      types.assignmentExpression('=', types.identifier(namespaceVariable), registration)
                  ),
                  types.breakStatement()
              ]

    return types.switchCase(types.stringLiteral(chunkIdToModuleUrl(chunkId)), statements)
}

/** Creates a SystemJS registration that publishes one already-executed CommonJS namespace. */
function createAmphibiousRegistrationExpression(namespace: string): ReturnType<typeof types.arrayExpression> {
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
                            types.callExpression(types.identifier(exportBindingParameter), [
                                types.identifier(namespace)
                            ])
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
