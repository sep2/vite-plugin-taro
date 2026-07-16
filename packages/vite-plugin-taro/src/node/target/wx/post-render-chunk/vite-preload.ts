import { type PluginObj, types } from '@babel/core'

const vitePreloadMarker = '__VITE_PRELOAD__'

/** Removes Vite's browser preload wrapper and its now-unused helper bindings. */
export const normalizeVitePreloadPlugin: PluginObj = {
    name: 'vite-plugin-taro:normalize-vite-preload',
    visitor: {
        Program(path) {
            const helperNames = new Set<string>()

            path.traverse({
                CallExpression: {
                    exit(callPath) {
                        const marker = callPath.node.arguments[1]
                        if (!types.isIdentifier(marker, { name: vitePreloadMarker })) return

                        const loader = callPath.node.arguments[0]
                        if (
                            !types.isIdentifier(callPath.node.callee) ||
                            !types.isArrowFunctionExpression(loader) ||
                            loader.params.length !== 0 ||
                            types.isBlockStatement(loader.body)
                        ) {
                            throw callPath.buildCodeFrameError('Unsupported Vite preload wrapper')
                        }

                        helperNames.add(callPath.node.callee.name)
                        callPath.replaceWith(loader.body)
                    }
                }
            })

            path.scope.crawl()
            const dependencyNames = new Set<string>()
            const helperBindings = [...helperNames].map((helperName) => {
                const binding = path.scope.getBinding(helperName)
                if (!binding) throw path.buildCodeFrameError(`Missing Vite preload helper ${helperName}`)

                binding.path.traverse({
                    ReferencedIdentifier(referencePath) {
                        const dependency = referencePath.scope.getBinding(referencePath.node.name)
                        if (dependency?.scope === path.scope && dependency !== binding) {
                            dependencyNames.add(referencePath.node.name)
                        }
                    }
                })

                if (binding.referenced) {
                    throw path.buildCodeFrameError(`Vite preload helper ${helperName} still has references`)
                }
                return binding
            })

            for (const binding of helperBindings) binding.path.remove()
            path.scope.crawl()
            for (const dependencyName of dependencyNames) {
                const binding = path.scope.getBinding(dependencyName)
                if (binding && !binding.referenced) binding.path.remove()
            }

            path.traverse({
                ReferencedIdentifier(referencePath) {
                    if (referencePath.node.name === vitePreloadMarker) {
                        throw referencePath.buildCodeFrameError('Vite preload marker was not normalized')
                    }
                }
            })
        }
    }
}
