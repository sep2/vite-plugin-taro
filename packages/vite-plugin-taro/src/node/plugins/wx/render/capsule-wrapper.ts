import { type PluginObject, types } from '@babel/core'
import { resolveChunkReference } from '../../../utils/modules.ts'

/** Wraps System.register as an inert CommonJS capsule tuple with canonical final dependency IDs. */
export function wrapCapsulePlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:wrap-capsule',
        visitor: {},

        post(file) {
            const program = file.ast.program
            const [statement] = program.body
            const registration = statement && types.isExpressionStatement(statement) ? statement.expression : undefined

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

            dependencies.elements.forEach((dependency) => {
                canonicalizeStaticReference(dependency, fileName)
            })

            const context = declaration.params[1]
            if (types.isIdentifier(context)) {
                file.path.traverse({
                    CallExpression(callPath) {
                        const callee = callPath.node.callee
                        if (
                            !types.isMemberExpression(callee) ||
                            callee.computed ||
                            !types.isIdentifier(callee.object, { name: context.name }) ||
                            !types.isIdentifier(callee.property, { name: 'import' })
                        ) {
                            return
                        }

                        const [dependency] = callPath.node.arguments
                        canonicalizeDynamicReference(dependency, fileName)
                    }
                })
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

/** Resolves one generated static reference while the final importing chunk filename is known. */
function canonicalizeStaticReference(reference: types.Node | null | undefined, fileName: string): void {
    if (!types.isStringLiteral(reference)) {
        throw new Error(`Expected a literal System.register dependency in ${fileName}`)
    }
    reference.value = resolveChunkReference(fileName, reference.value)
}

/** Resolves application literals while preserving runtime-computed IDs injected by the development runtime. */
function canonicalizeDynamicReference(reference: types.Node | null | undefined, fileName: string): void {
    if (types.isStringLiteral(reference) && (reference.value.startsWith('./') || reference.value.startsWith('../'))) {
        reference.value = resolveChunkReference(fileName, reference.value)
    }
}
