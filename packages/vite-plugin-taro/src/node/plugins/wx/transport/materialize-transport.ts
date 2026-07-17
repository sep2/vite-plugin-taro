import path from 'node:path'
import { types } from '@babel/core'
import generate from '@babel/generator'
import { type Rolldown, transformWithOxc } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { isBootstrapModule, isNativeModule } from '../native/is-native-module.ts'

const bootstrapModuleUrlPlaceholder = '__VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__'
const transportTablePlaceholder = '__VITE_PLUGIN_TARO_TRANSPORT_TABLE__'

/** Materializes the native transport while Rollup's preliminary hash placeholders are still active. */
export async function materializeTransport({
    code,
    transportChunk,
    chunks
}: {
    code: string
    transportChunk: Rolldown.RenderedChunk
    chunks: readonly Rolldown.RenderedChunk[]
}): Promise<{ code: string; map: null }> {
    const bootstrap = chunks.find(isBootstrapModule)
    if (!bootstrap) {
        throw new Error('Expected native bootstrap chunk')
    }
    requireOnePlaceholder(code, bootstrapModuleUrlPlaceholder)
    requireOnePlaceholder(code, transportTablePlaceholder)

    // Babel constructs and safely serializes an expression shaped like:
    // {
    //     'vpt:/assets/app.js': () => require('./assets/app.js'),
    //     'vpt:/assets/page.js': () => require('./assets/page.js')
    // }
    // Oxc then parses that expression through define while processing the already-transpiled native entry.
    const capsuleChunkIds = chunks.filter((chunk) => !isNativeModule(chunk)).map((chunk) => chunk.fileName)

    const moduleTable = types.objectExpression(
        capsuleChunkIds.sort().map((chunkId) => {
            return createModuleLoader({
                chunkId,
                transportFileName: transportChunk.fileName
            })
        })
    )

    const transformed = await transformWithOxc(code, transportChunk.fileName, {
        define: {
            [bootstrapModuleUrlPlaceholder]: generate(
                types.stringLiteral(chunkIdToModuleUrl(bootstrap.fileName)),
                generatorOptions
            ).code,
            [transportTablePlaceholder]: generate(moduleTable, generatorOptions).code
        },
        target: 'es2018'
    })
    if (
        transformed.code.includes(bootstrapModuleUrlPlaceholder) ||
        transformed.code.includes(transportTablePlaceholder)
    ) {
        throw new Error(`Failed to materialize the WX transport in ${transportChunk.fileName}`)
    }

    return {
        code: transformed.code,
        map: null
    }
}

const generatorOptions = {
    comments: false,
    compact: true,
    concise: true,
    minified: true
} as const

/** Validates one graph-metadata placeholder in the already-compiled transport entry. */
function requireOnePlaceholder(code: string, placeholder: string): void {
    const replacementCount = code.split(placeholder).length - 1
    if (replacementCount !== 1) {
        throw new Error(`Expected one WX transport placeholder ${placeholder}, found ${replacementCount}`)
    }
}

/** Creates one URL-keyed loader while keeping its native require argument literal. */
function createModuleLoader({
    chunkId,
    transportFileName
}: {
    chunkId: string
    transportFileName: string
}): ReturnType<typeof types.objectProperty> {
    const requirePath = toNativeRequirePath(transportFileName, chunkId)
    const load = types.callExpression(types.identifier('require'), [types.stringLiteral(requirePath)])
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
