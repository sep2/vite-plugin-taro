import { type PluginObj, types } from '@babel/core'

/** Replaces Babel's executable System.register wrapper with an inert CommonJS registration tuple. */
export const systemRegisterCapsulePlugin: PluginObj = {
    name: 'vite-plugin-taro:system-register-capsule',
    visitor: {},

    // Babel runs plugin post hooks after every visitor, including the SystemJS transform's Program exit hook.
    post(file) {
        const program = file.ast.program
        const [statement] = program.body
        const registration = statement && types.isExpressionStatement(statement) ? statement.expression : undefined
        const fileName = file.opts.filename ?? 'unknown chunk'

        // Babel must produce exactly one anonymous registration. Failing closed prevents executable wrapper code from
        // leaking into a file that native require() is expected to treat only as transport.
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

        // Native require() only transports this tuple; the WX registry links and executes its declaration later.
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
