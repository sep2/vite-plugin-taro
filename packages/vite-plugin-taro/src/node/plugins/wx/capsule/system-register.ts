import { type PluginObject, types } from '@babel/core'

/** Rewrites System.register as an inert CommonJS registration tuple. */
export function systemRegisterCapsulePlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:system-register-capsule',
        visitor: {},

        post(file) {
            const program = file.ast.program
            const [statement] = program.body
            const registration = statement && types.isExpressionStatement(statement) ? statement.expression : undefined
            const fileName = file.opts.filename ?? 'unknown chunk'

            if (
                program.body.length !== 1 ||
                !types.isCallExpression(registration) ||
                !types.isMemberExpression(registration.callee) ||
                registration.callee.computed ||
                !types.isIdentifier(registration.callee.object, { name: 'System' }) ||
                !types.isIdentifier(registration.callee.property, { name: 'register' })
            ) {
                throw new Error(`Expected one anonymous System.register call in ${fileName}`)
            }

            const [dependencies, declaration] = registration.arguments
            if (
                registration.arguments.length !== 2 ||
                !types.isArrayExpression(dependencies) ||
                !types.isFunctionExpression(declaration)
            ) {
                throw new Error(`Expected System.register(dependencies, declaration) in ${fileName}`)
            }

            program.directives = []
            program.body = [
                types.expressionStatement(
                    types.assignmentExpression(
                        '=',
                        types.memberExpression(types.identifier('module'), types.identifier('exports')),
                        types.arrayExpression([dependencies, declaration])
                    )
                )
            ]
        }
    }
}
