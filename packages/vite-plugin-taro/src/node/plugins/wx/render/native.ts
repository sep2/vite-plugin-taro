import { type PluginObject, type PluginTarget, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { resolveChunkReference } from '../../../utils/modules.ts'
import { type AstTransformResult, transformWithBabel } from '../../../utils/transform.ts'
import { getWxEntryRole } from '../module.ts'

/** Renders a native module while activating its statically imported capsules through SystemJS. */
export function renderNative({
    code,
    chunk,
    chunks,
    sourcemap
}: {
    code: string
    chunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    sourcemap: boolean
}): AstTransformResult {
    return transformWithBabel(
        code,
        chunk.fileName,
        [connectNativeCapsulesPlugin(chunk.fileName, chunks) as PluginTarget, transformModulesCommonjs as PluginTarget],
        sourcemap
    )
}

/** Converts only cross-runtime static imports; ordinary native dependencies remain CommonJS imports. */
function connectNativeCapsulesPlugin(
    fileName: string,
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
): PluginObject {
    return {
        name: 'vpt:connect-native-capsules',
        visitor: {
            ImportDeclaration(importPath) {
                const reference = importPath.node.source.value
                if (!reference.startsWith('./') && !reference.startsWith('../')) {
                    return
                }

                const chunkId = resolveChunkReference(fileName, reference)
                const importedChunk = chunks[chunkId]
                if (!importedChunk || getWxEntryRole(importedChunk) !== 'capsule') {
                    return
                }

                const [specifier] = importPath.node.specifiers
                if (
                    importPath.node.specifiers.length !== 1 ||
                    !specifier ||
                    types.isImportNamespaceSpecifier(specifier)
                ) {
                    throw new Error(`Expected one capsule value import from ${chunkId} in ${fileName}`)
                }

                const imported = types.isImportDefaultSpecifier(specifier)
                    ? types.identifier('default')
                    : specifier.imported
                const importedConfig = types.memberExpression(
                    createSyncImport(chunkId),
                    types.cloneNode(imported),
                    types.isStringLiteral(imported)
                )
                importPath.replaceWith(
                    types.variableDeclaration('const', [
                        types.variableDeclarator(types.cloneNode(specifier.local), importedConfig)
                    ])
                )
            }
        }
    }
}

/** Creates one synchronous lookup through the canonical output chunk ID. */
function createSyncImport(chunkId: string): types.CallExpression {
    return types.callExpression(
        types.memberExpression(
            types.memberExpression(types.identifier('global'), types.identifier('System')),
            types.identifier('importSync')
        ),
        [types.stringLiteral(chunkId)]
    )
}
