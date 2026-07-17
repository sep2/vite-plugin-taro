import path from 'node:path'
import { types } from '@babel/core'
import generate from '@babel/generator'
import { type Rolldown, transformWithOxc } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { isNativeModule, isTransportModule } from '../native/is-native-module.ts'

const modulesPlaceholder = '__VITE_PLUGIN_TARO_MODULES__'

/** Materializes the final native transport entry after every capsule filename is known. */
export async function materializeTransport(bundle: Rolldown.OutputBundle): Promise<void> {
    const chunks = Object.values(bundle).filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')

    const transport = chunks.find(isTransportModule)
    if (!transport) {
        throw new Error('Expected transport chunk')
    }
    const replacementCount = transport.code.split(modulesPlaceholder).length - 1
    if (replacementCount !== 1) {
        throw new Error(`Expected one WX transport module-table placeholder, found ${replacementCount}`)
    }

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
            [modulesPlaceholder]: generate(moduleTable, { comments: false, compact: true }).code
        },
        target: 'es2018'
    })
    if (transformed.code.includes(modulesPlaceholder)) {
        throw new Error(`Failed to materialize the WX transport in ${transport.fileName}`)
    }

    transport.code = transformed.code
    transport.map = null
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
