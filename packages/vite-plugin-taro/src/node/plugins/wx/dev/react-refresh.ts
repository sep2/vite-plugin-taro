import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'

const reactRefreshRuntimeId = '/@react-refresh'
const reactRefreshPreambleError = "@vitejs/plugin-react can't detect preamble. Something is wrong."
const refreshHost = '__vptReactRefreshHost'
const refreshHostProperties = new Set(['__getReactRefreshIgnoredExports', '__registerBeforePerformReactRefresh'])

/** Removes browser-preamble assumptions and connects React Refresh completion to the App-owned WX runtime. */
export function rewriteReactRefresh(code: string, id: string, sourcemap = true) {
    const refreshRuntime = id.split('?', 1)[0] === reactRefreshRuntimeId
    const refreshBoundary = code.includes(reactRefreshPreambleError)
    if (!refreshRuntime && !refreshBoundary) {
        return
    }

    return transformWithBabel(code, id, [() => createReactRefreshRewritePlugin(refreshRuntime)], sourcemap)
}

function createReactRefreshRewritePlugin(refreshRuntime: boolean): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-refresh-rewrite',
        visitor: {
            Program(programPath) {
                if (!refreshRuntime) {
                    return
                }
                programPath.unshiftContainer(
                    'body',
                    types.variableDeclaration('const', [
                        types.variableDeclarator(
                            types.identifier(refreshHost),
                            types.memberExpression(types.identifier('global'), types.identifier(refreshHost))
                        )
                    ])
                )
            },

            MemberExpression(memberPath) {
                if (!refreshRuntime) {
                    return
                }
                const member = memberPath.node
                if (
                    !types.isIdentifier(member.object, { name: 'window' }) ||
                    !types.isIdentifier(member.property) ||
                    !refreshHostProperties.has(member.property.name)
                ) {
                    return
                }
                member.object = types.identifier(refreshHost)
            },

            CallExpression(callPath) {
                if (!refreshRuntime || !types.isIdentifier(callPath.node.callee)) {
                    return
                }
                const callee = callPath.node.callee.name
                if (callee !== 'enqueueUpdate' && callee !== 'performReactRefresh') {
                    return
                }

                callPath.replaceWith(
                    types.callExpression(
                        types.memberExpression(
                            types.identifier(refreshHost),
                            types.identifier(callee === 'enqueueUpdate' ? 'enqueueRefresh' : 'performReactRefresh')
                        ),
                        [types.identifier(callee)]
                    )
                )
                callPath.skip()
            },

            IfStatement(ifPath) {
                if (isReactRefreshPreambleGuard(ifPath.node)) {
                    ifPath.remove()
                }
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
