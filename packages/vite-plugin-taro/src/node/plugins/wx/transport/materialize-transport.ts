import path from 'node:path'
import { types } from '@babel/core'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import { isBootstrapModule, isNativeModule } from '../native/is-native-module.ts'

const bootstrapModuleUrlPlaceholder = '__VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__'
const transportTablePlaceholder = '__VITE_PLUGIN_TARO_TRANSPORT_TABLE__'

/**
 * Materializes transport while Rolldown's preliminary hash placeholders are still active, so the injected capsule
 * references participate in final hash calculation instead of changing code after its filename has been fixed.
 *
 * This intentionally creates broad hash invalidation: changing one capsule can rename transport, then bootstrap, then
 * chunks that import bootstrap. WX ships one application package rather than independently cached HTTP chunks, so honest
 * content hashes and automatic graph linking are more valuable here than minimizing that hash fan-out.
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
    const renderedChunks = Object.values(chunks)

    const bootstrap = renderedChunks.find(isBootstrapModule)
    if (!bootstrap) {
        throw new Error('Expected native bootstrap chunk')
    }

    // Babel constructs and safely serializes an expression shaped like:
    // {
    //     'vpt:/assets/app.js': () => require('./assets/app.js'),
    //     'vpt:/packages/account/page.js': () => require.async('./packages/account/page.js')
    // }
    // Oxc then parses that expression through define while processing the already-transpiled native entry.

    return await replaceWithAst(code, transportChunk.fileName, {
        [bootstrapModuleUrlPlaceholder]: types.stringLiteral(chunkIdToModuleUrl(bootstrap.fileName)),
        [transportTablePlaceholder]: types.objectExpression(
            renderedChunks
                .filter((chunk) => !isNativeModule(chunk))
                .sort((left, right) => left.fileName.localeCompare(right.fileName))
                .map((chunk) => {
                    return createModuleLoader({
                        chunkId: chunk.fileName,
                        transportFileName: transportChunk.fileName,
                        loadMode: getLoadMode(chunk)
                    })
                })
        )
    })
}

/** Creates one URL-keyed loader while keeping its native require argument literal. */
function createModuleLoader({
    chunkId,
    transportFileName,
    loadMode
}: {
    chunkId: string
    transportFileName: string
    loadMode: 'sync' | 'async'
}): ReturnType<typeof types.objectProperty> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)

    const requireCallee =
        loadMode === 'sync'
            ? types.identifier('require')
            : types.memberExpression(types.identifier('require'), types.identifier('async'))

    const load = types.callExpression(requireCallee, [types.stringLiteral(requirePath)])

    return types.objectProperty(
        types.stringLiteral(chunkIdToModuleUrl(chunkId)),
        types.arrowFunctionExpression([], load)
    )
}

/** Converts one preliminary output path to a literal require path relative to the native transport entry. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
