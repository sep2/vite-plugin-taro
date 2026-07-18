import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'

const reactRefreshRuntimeId = '/@react-refresh'
const reactRefreshPreambleError = "@vitejs/plugin-react can't detect preamble. Something is wrong."
const reactRefreshHost = '__vptReactRefreshHost'
const reactRefreshHostProperties = new Set(['__getReactRefreshIgnoredExports', '__registerBeforePerformReactRefresh'])

/**
 * The React transform already emits module-local registration and signature functions. Its only remaining browser
 * assumptions are a guard that checks `window.$RefreshReg$` and two optional extension points stored on `window` by the
 * refresh runtime. wx has neither an HTML preamble nor a browser `window`, so the guard is removed and the
 * runtime-only extension points are redirected to a private module-local object. User-authored window access is untouched.
 */
export function rewriteReactRefresh(code: string, id: string) {
    // Query variants of Vite's virtual runtime share the same implementation. Ordinary modules are parsed only when the
    // exact generated preamble error is present, keeping this post-transform cheap and avoiding broad window rewrites.
    const refreshRuntime = id.split('?', 1)[0] === reactRefreshRuntimeId
    const refreshBoundary = code.includes(reactRefreshPreambleError)
    if (!refreshRuntime && !refreshBoundary) return

    return transformWithBabel(code, id, [() => createReactRefreshRewritePlugin(refreshRuntime)])
}

function createReactRefreshRewritePlugin(refreshRuntime: boolean): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-refresh-rewrite',
        visitor: {
            Program(programPath) {
                if (!refreshRuntime) return
                // This object is lexical to the refresh runtime module. Never alias or assign global/window: WeChat's
                // window property is a read-only getter, and global Refresh hooks would leak across module boundaries.
                programPath.unshiftContainer(
                    'body',
                    types.variableDeclaration('const', [
                        types.variableDeclarator(types.identifier(reactRefreshHost), types.objectExpression([]))
                    ])
                )
            },

            MemberExpression(memberPath) {
                if (!refreshRuntime) return
                // Redirect only the two extension properties authored by the known refresh runtime. The exact object and
                // property checks intentionally leave every user-authored or future unrelated `window` access untouched.
                const member = memberPath.node
                if (
                    !types.isIdentifier(member.object, { name: 'window' }) ||
                    !types.isIdentifier(member.property) ||
                    !reactRefreshHostProperties.has(member.property.name)
                ) {
                    return
                }
                member.object = types.identifier(reactRefreshHost)
            },

            IfStatement(ifPath) {
                // Browser Vite installs $RefreshReg$ from an HTML preamble; wx modules already receive module-local
                // instrumentation, so remove only the structurally exact generated guard and preserve all other checks.
                if (isReactRefreshPreambleGuard(ifPath.node)) ifPath.remove()
            }
        }
    }
}

function isReactRefreshPreambleGuard(statement: ReturnType<typeof types.ifStatement>): boolean {
    if (
        !types.isUnaryExpression(statement.test, { operator: '!' }) ||
        !types.isMemberExpression(statement.test.argument) ||
        !types.isIdentifier(statement.test.argument.object, { name: 'window' }) ||
        !types.isIdentifier(statement.test.argument.property, { name: '$RefreshReg$' }) ||
        !types.isBlockStatement(statement.consequent) ||
        statement.consequent.body.length !== 1
    ) {
        return false
    }

    const [throwStatement] = statement.consequent.body
    return (
        types.isThrowStatement(throwStatement) &&
        types.isNewExpression(throwStatement.argument) &&
        types.isIdentifier(throwStatement.argument.callee, { name: 'Error' }) &&
        types.isStringLiteral(throwStatement.argument.arguments[0], { value: reactRefreshPreambleError })
    )
}
