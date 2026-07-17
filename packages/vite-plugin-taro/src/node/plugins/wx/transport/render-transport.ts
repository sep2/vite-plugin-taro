import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import { transformWithOxc } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { transportFileName } from './constant.ts'

const instantiatePlaceholder = '__VITE_PLUGIN_TARO_INSTANTIATE__'
const runtimeExtension = path.extname(fileURLToPath(import.meta.url))
const transportRuntimePath = fileURLToPath(
    new URL(`../../../../runtime/wx/transport${runtimeExtension}`, import.meta.url)
)

/** Specializes the physical transport runtime with literal loaders for the finalized bundle. */
export async function renderTransport({
    bootstrapChunkId,
    capsuleChunkIds
}: {
    bootstrapChunkId: string
    capsuleChunkIds: readonly string[]
}): Promise<string> {
    const source = await fs.readFile(transportRuntimePath, 'utf8')
    const runtime = await transformWithOxc(source, transportRuntimePath, { target: 'es2018' })
    const transformed = transformSync(runtime.code, {
        babelrc: false,
        comments: true,
        compact: false,
        configFile: false,
        filename: transportRuntimePath,
        plugins: [
            specializeTransportPlugin({
                bootstrapChunkId,
                capsuleChunkIds
            }) as PluginTarget
        ],
        sourceType: 'script'
    })
    if (!transformed?.code) {
        throw new Error('Failed to specialize the WX transport runtime')
    }
    return transformed.code
}

/** Replaces the runtime placeholder with a closed switch of literal native require calls. */
function specializeTransportPlugin({
    bootstrapChunkId,
    capsuleChunkIds
}: {
    bootstrapChunkId: string
    capsuleChunkIds: readonly string[]
}): PluginObject {
    let replacementCount = 0

    return {
        name: 'vite-plugin-taro:specialize-wx-transport',
        visitor: {
            CallExpression(callPath) {
                if (!types.isIdentifier(callPath.node.callee, { name: instantiatePlaceholder })) {
                    return
                }
                const [id, registerNative] = callPath.node.arguments
                if (
                    callPath.node.arguments.length !== 2 ||
                    !types.isIdentifier(id) ||
                    !types.isIdentifier(registerNative) ||
                    !callPath.parentPath.isReturnStatement()
                ) {
                    throw new Error('Expected the WX transport instantiate placeholder')
                }
                replacementCount++
                callPath.parentPath.replaceWith(
                    types.switchStatement(types.cloneNode(id), [
                        createBootstrapCase(bootstrapChunkId, registerNative),
                        ...[...capsuleChunkIds].sort().map(createCapsuleCase),
                        types.switchCase(null, [
                            types.throwStatement(
                                types.newExpression(types.identifier('Error'), [
                                    types.binaryExpression(
                                        '+',
                                        types.stringLiteral('Unknown System module: '),
                                        types.cloneNode(id)
                                    )
                                ])
                            )
                        ])
                    ])
                )
            }
        },
        post() {
            if (replacementCount !== 1) {
                throw new Error(`Expected one WX transport instantiate placeholder, found ${replacementCount}`)
            }
        }
    }
}

/** Creates the bridge from cached native CommonJS bootstrap exports to a System registration. */
function createBootstrapCase(
    chunkId: string,
    registerNative: ReturnType<typeof types.identifier>
): ReturnType<typeof types.switchCase> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)
    return types.switchCase(types.stringLiteral(chunkIdToModuleUrl(chunkId)), [
        types.returnStatement(types.callExpression(types.cloneNode(registerNative), [createRequireCall(requirePath)]))
    ])
}

/** Creates one literal capsule loader recognized by the WeChat compiler. */
function createCapsuleCase(chunkId: string): ReturnType<typeof types.switchCase> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)
    return types.switchCase(types.stringLiteral(chunkIdToModuleUrl(chunkId)), [
        types.returnStatement(createRequireCall(requirePath))
    ])
}

/** Creates a native require call whose argument is fixed during bundle generation. */
function createRequireCall(requirePath: string): ReturnType<typeof types.callExpression> {
    return types.callExpression(types.identifier('require'), [types.stringLiteral(requirePath)])
}

/** Converts one finalized output path to a literal require path relative to root-level transport.js. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
