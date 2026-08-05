import { type PluginObject, template, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import { packageRequire } from '../../../utils/packages.ts'
import type { AstTransformResult } from '../../../utils/transform.ts'

/**
 * This build-time transform deliberately does not implement `importSync` or rewrite SystemJS's loader algorithm.
 * SystemJS keeps its registry key and evaluator inside an IIFE, so the runtime extension cannot access them through the
 * public loader API. Babel locates the singleton installation structurally and inserts one non-enumerable bridge while
 * still inside that IIFE. Every upstream function remains unchanged.
 */

/**
 * The complete runtime bridge:
 * - `registry` preserves namespace and execution identity across `import` and `importSync`;
 * - `postOrderExec` reuses SystemJS's dependency-first evaluator and TLA detection.
 */
const internalExposure = template.statement(
    `
        Object.defineProperty(envGlobal.System, '__vptInternals', {
            value: {
                registry: envGlobal.System[REGISTRY],
                postOrderExec: postOrderExec
            }
        });
    `,
    { placeholderPattern: false }
)()

/** Resolves the readable build because stable AST structure cannot be verified against `s.min.js`. */
export const systemJsPath = packageRequire.resolve('systemjs/dist/s.js')

/** Adds the private bridge to the pinned upstream source and preserves its source map. */
export function patchSystemJs({
    code,
    id,
    sourcemap
}: {
    code: string
    id: string
    sourcemap: boolean
}): AstTransformResult {
    const transformed = transformSync(code, {
        ast: false,
        babelrc: false,
        comments: true,
        compact: false,
        configFile: false,
        filename: id,
        plugins: [() => createSystemJsExposurePatch()],
        sourceFileName: id,
        sourceMaps: sourcemap,
        sourceType: 'script'
    })
    if (!transformed?.code || (sourcemap && !transformed.map)) {
        throw new Error(`Failed to patch SystemJS in ${id}`)
    }

    return {
        code: transformed.code,
        map: sourcemap ? (transformed.map as Rolldown.ExistingRawSourceMap) : null
    }
}

/** Injects one sibling statement after the exact `envGlobal.System = new SystemJS()` assignment. */
function createSystemJsExposurePatch(): PluginObject {
    // Babel visitors report matches through callbacks; the count proves that upstream still has one installation point.
    let installationCount = 0

    return {
        name: 'vite-plugin-taro:expose-systemjs-core',
        visitor: {
            AssignmentExpression(path) {
                if (!isSystemInstallation(path.node)) {
                    return
                }
                if (!path.parentPath?.isExpressionStatement()) {
                    throw new Error('Expected the SystemJS installation to be an expression statement')
                }

                path.parentPath.insertAfter(types.cloneNode(internalExposure, true))
                installationCount++
            },
            Program: {
                exit() {
                    if (installationCount !== 1) {
                        throw new Error(`Expected one SystemJS installation point, found ${installationCount}`)
                    }
                }
            }
        }
    }
}

/** Requires the complete pinned assignment shape rather than matching an identifier or source substring. */
function isSystemInstallation(node: types.AssignmentExpression): boolean {
    return (
        node.operator === '=' &&
        types.isMemberExpression(node.left) &&
        !node.left.computed &&
        types.isIdentifier(node.left.object, { name: 'envGlobal' }) &&
        types.isIdentifier(node.left.property, { name: 'System' }) &&
        types.isNewExpression(node.right) &&
        types.isIdentifier(node.right.callee, { name: 'SystemJS' }) &&
        node.right.arguments.length === 0
    )
}
