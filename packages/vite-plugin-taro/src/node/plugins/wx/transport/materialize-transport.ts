import path from 'node:path'
import { types } from '@babel/core'
import generate from '@babel/generator'
import { type Rolldown, transformWithOxc } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { isBootstrapModule, isNativeModule, isTransportModule } from '../native/is-native-module.ts'

const bootstrapModuleUrlPlaceholder = '__VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__'
const transportTablePlaceholder = '__VITE_PLUGIN_TARO_TRANSPORT_TABLE__'

/** Materializes the final native transport entry after every capsule filename is known. */
export async function materializeTransport(bundle: Rolldown.OutputBundle): Promise<void> {
    const chunks = Object.values(bundle).filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')

    const bootstrap = chunks.find(isBootstrapModule)
    if (!bootstrap) {
        throw new Error('Expected native bootstrap chunk')
    }
    const transport = chunks.find(isTransportModule)
    if (!transport) {
        throw new Error('Expected transport chunk')
    }
    requireOnePlaceholder(transport.code, bootstrapModuleUrlPlaceholder)
    requireOnePlaceholder(transport.code, transportTablePlaceholder)

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
                transportFileName: transport.fileName
            })
        })
    )

    const transformed = await transformWithOxc(transport.code, transport.fileName, {
        define: {
            [bootstrapModuleUrlPlaceholder]: generate(types.stringLiteral(chunkIdToModuleUrl(bootstrap.fileName)), {
                comments: false,
                compact: true
            }).code,
            [transportTablePlaceholder]: generate(moduleTable, { comments: false, compact: true }).code
        },
        target: 'es2018'
    })
    if (
        transformed.code.includes(bootstrapModuleUrlPlaceholder) ||
        transformed.code.includes(transportTablePlaceholder)
    ) {
        throw new Error(`Failed to materialize the WX transport in ${transport.fileName}`)
    }

    transport.code = transformed.code
    transport.map = null
}

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

/** Converts one finalized output path to a literal require path relative to the native transport entry. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
