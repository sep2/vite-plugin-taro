import type { IfStatement, Statement, ThrowStatement } from '@oxc-project/types'

const reactRefreshPreambleError = "@vitejs/plugin-react can't detect preamble. Something is wrong."

/** Identifies only the browser-preamble assertion emitted by Rolldown's React Refresh wrapper. */
export function isRefreshPreambleGuard(statement: IfStatement): boolean {
    const test = statement.test
    const thrown = getOnlyThrowStatement(statement.consequent)

    return (
        statement.alternate === null &&
        test.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument.type === 'MemberExpression' &&
        !test.argument.computed &&
        test.argument.object.type === 'Identifier' &&
        test.argument.object.name === 'window' &&
        test.argument.property.type === 'Identifier' &&
        test.argument.property.name === '$RefreshReg$' &&
        thrown?.argument.type === 'NewExpression' &&
        thrown.argument.callee.type === 'Identifier' &&
        thrown.argument.callee.name === 'Error' &&
        thrown.argument.arguments.length === 1 &&
        thrown.argument.arguments[0]?.type === 'Literal' &&
        thrown.argument.arguments[0].value === reactRefreshPreambleError
    )
}

/** Normalizes the block and single-statement forms without accepting a consequent with additional behavior. */
function getOnlyThrowStatement(statement: Statement): ThrowStatement | undefined {
    if (statement.type === 'ThrowStatement') {
        return statement
    }
    if (statement.type !== 'BlockStatement' || statement.body.length !== 1) {
        return undefined
    }

    const onlyStatement = statement.body[0]
    return onlyStatement?.type === 'ThrowStatement' ? onlyStatement : undefined
}
