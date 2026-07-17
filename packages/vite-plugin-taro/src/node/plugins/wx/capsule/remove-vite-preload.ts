import { type PluginObject, types } from '@babel/core'

const vitePreloadMethod = '__vitePreload'
const vitePreloadMarker = '__VITE_PRELOAD__'

/** Removes Vite's browser-only preload wrapper while preserving its dynamic import. */
export function removeVitePreloadPlugin(): PluginObject {
    let removedPreload = false

    return {
        name: 'vite-plugin-taro:remove-vite-preload',
        visitor: {
            CallExpression(callPath) {
                const [load, marker] = callPath.node.arguments
                if (
                    !types.isIdentifier(callPath.node.callee, { name: vitePreloadMethod }) ||
                    !types.isIdentifier(marker, { name: vitePreloadMarker })
                ) {
                    return
                }
                if (!load || !types.isExpression(load)) {
                    throw new Error('Expected a Vite preload loader')
                }
                callPath.replaceWith(types.callExpression(load, []))
                removedPreload = true
            },

            Program: {
                exit(programPath) {
                    if (!removedPreload) {
                        return
                    }
                    for (const statementPath of programPath.get('body')) {
                        if (!statementPath.isImportDeclaration()) {
                            continue
                        }
                        for (const specifierPath of statementPath.get('specifiers')) {
                            if (specifierPath.node.local.name === vitePreloadMethod) {
                                specifierPath.remove()
                            }
                        }
                        if (statementPath.node.specifiers.length === 0) {
                            statementPath.remove()
                        }
                    }
                }
            }
        }
    }
}
