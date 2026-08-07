import type { types as BabelTypes } from '@babel/core'
import { type NodePath, type PluginObj, transformAsync, types } from '@babel/core'
import type { Plugin } from 'vite'
import { normalizeModuleId } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'

const stencilClientPath = packageRequire.resolve('@stencil/core/internal/client', {
    paths: [packageRequire.resolve('@tarojs/components/package.json')]
})
const normalizedStencilClientPath = normalizeModuleId(stencilClientPath)

/**
 * Creates the compiler-owned adaptation of Stencil's client style insertion.
 *
 * Taro components inject their styles through this internal client. Its default insertion point places those styles
 * after application CSS, allowing component defaults to override application rules. The adapter is registered in both
 * Vite's application pipeline and the independent dependency-optimization build: removing either registration leaves
 * production or development with an unadapted client. This explicit dual registration removes the former optimization
 * exclusion while keeping one transformation implementation.
 */
export function createStencilClientAdapter(): Plugin {
    return {
        name: 'vpt:h5-stencil-client',
        transform: adaptStencilClient
    }
}

/** Applies the shared Stencil adaptation in either the application or dependency-optimization pipeline. */
export async function adaptStencilClient(code: string, id: string) {
    if (normalizeModuleId(id) !== normalizedStencilClientPath) {
        return
    }

    const transformed = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename: stencilClientPath,
        plugins: [rewriteStencilStyleInsertion],
        sourceFileName: stencilClientPath,
        sourceMaps: true
    })

    if (transformed?.code === undefined || transformed.code === null) {
        throw new Error(`Failed to adapt Stencil client: ${stencilClientPath}`)
    }

    return {
        code: transformed.code,
        map: transformed.map
    }
}

/** Keeps Stencil-injected Taro component styles before application stylesheets. */
function rewriteStencilStyleInsertion(): PluginObj {
    return {
        name: 'vpt:rewrite-stencil-style-insertion',
        visitor: {
            CallExpression(callPath) {
                if (!isStencilStyleInsertBeforeCall(callPath)) {
                    return
                }

                callPath
                    .get('arguments.1')
                    .replaceWith(
                        types.conditionalExpression(
                            types.callExpression(
                                types.memberExpression(types.identifier('scopeId'), types.identifier('startsWith')),
                                [types.stringLiteral('sc-taro-')]
                            ),
                            createStyleQuery('style,link[rel="stylesheet"]'),
                            createStyleQuery('link')
                        )
                    )
            }
        }
    }
}

/** Identifies Stencil's default component-style insertion call. */
function isStencilStyleInsertBeforeCall(callPath: NodePath<BabelTypes.CallExpression>): boolean {
    const { callee, arguments: callArguments } = callPath.node
    return (
        types.isMemberExpression(callee) &&
        types.isIdentifier(callee.object, { name: 'styleContainerNode' }) &&
        types.isIdentifier(callee.property, { name: 'insertBefore' }) &&
        types.isIdentifier(callArguments[0], { name: 'styleElm' }) &&
        isStyleQuery(callArguments[1], 'link')
    )
}

/** Identifies one style-container querySelector call. */
function isStyleQuery(node: BabelTypes.Node | null | undefined, selector: string): boolean {
    return (
        types.isCallExpression(node) &&
        types.isMemberExpression(node.callee) &&
        types.isIdentifier(node.callee.object, { name: 'styleContainerNode' }) &&
        types.isIdentifier(node.callee.property, { name: 'querySelector' }) &&
        types.isStringLiteral(node.arguments[0], { value: selector })
    )
}

/** Creates one style-container querySelector call. */
function createStyleQuery(selector: string): ReturnType<typeof types.callExpression> {
    return types.callExpression(
        types.memberExpression(types.identifier('styleContainerNode'), types.identifier('querySelector')),
        [types.stringLiteral(selector)]
    )
}
