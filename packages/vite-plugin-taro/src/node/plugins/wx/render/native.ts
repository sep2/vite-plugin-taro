import { type PluginObj, type PluginTarget, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { type AstTransformResult, transformWithBabel } from '../../../utils/transform.ts'
import { resolveLogicalChunkReference, resolvePhysicalChunkReference } from '../module/chunk-path.ts'
import { getWxEntryRole } from '../module/module.ts'

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
): PluginObj {
    return {
        name: 'vpt:connect-native-capsules',
        visitor: {
            ImportDeclaration(importPath) {
                const reference = importPath.node.source.value
                if (!reference.startsWith('./') && !reference.startsWith('../')) {
                    return
                }

                const physicalChunkId = resolvePhysicalChunkReference(fileName, reference)
                const importedChunk = chunks[physicalChunkId]
                if (!importedChunk || getWxEntryRole(importedChunk) !== 'capsule') {
                    return
                }

                const [specifier] = importPath.node.specifiers
                if (
                    importPath.node.specifiers.length !== 1 ||
                    !specifier ||
                    types.isImportNamespaceSpecifier(specifier)
                ) {
                    throw new Error(`Expected one capsule value import from ${physicalChunkId} in ${fileName}`)
                }

                const imported = types.isImportDefaultSpecifier(specifier)
                    ? types.identifier('default')
                    : specifier.imported
                const importedConfig = types.memberExpression(
                    createSyncImport(resolveLogicalChunkReference(fileName, reference)),
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
