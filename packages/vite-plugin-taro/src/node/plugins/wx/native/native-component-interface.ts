import path from 'node:path'
import { type NodePath, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { clientTaroNativeId } from '../../client/constant.ts'

export type NativeComponentDefinition = {
    folder: string
    entry: string
    fields: readonly string[]
}

/** Replaces native component interface calls with source-folder names and returns their static metadata. */
export function transformNativeComponentInterfaces(code: string, id: string, sourcemap: boolean) {
    const moduleId = normalizeModuleId(id)
    // Collection is local to this transform and preserves declaration order for deterministic later stages.
    const definitions: NativeComponentDefinition[] = []
    const transformed = transformSync(code, {
        ast: false,
        babelrc: false,
        code: true,
        configFile: false,
        filename: moduleId,
        parserOpts: {
            plugins: ['jsx', 'typescript']
        },
        plugins: [
            function transformNativeComponentInterfaceCalls() {
                // This module-local map lets declarations reference nearby TypeScript types without starting a type checker.
                const declaredInterfaces = new Map<string, readonly types.TSTypeElement[]>()
                return {
                    visitor: {
                        CallExpression(callPath) {
                            if (!isDefineNativeComponentCall(callPath)) {
                                return
                            }
                            const definition = parseDefinition(callPath.node, moduleId, declaredInterfaces, (message) =>
                                callPath.buildCodeFrameError(message)
                            )
                            definitions.push(definition)
                            callPath.replaceWith(types.stringLiteral(path.posix.basename(definition.folder)))
                        },
                        Program: {
                            enter(programPath) {
                                collectInterfaceDeclarations(programPath.node, declaredInterfaces)
                            },
                            exit(programPath) {
                                removeDefineNativeComponentImports(programPath.node)
                            }
                        }
                    }
                }
            }
        ],
        sourceFileName: moduleId,
        sourceMaps: sourcemap,
        sourceType: 'module'
    })
    if (!transformed?.code || (sourcemap && !transformed.map)) {
        throw new Error(`Failed to transform native component interfaces in ${id}`)
    }
    return {
        code: transformed.code,
        map: sourcemap ? (transformed.map as Rolldown.ExistingRawSourceMap) : null,
        definitions
    }
}

/** Removes the compile-time macro while preserving other named and type imports. */
function removeDefineNativeComponentImports(program: types.Program): void {
    program.body = program.body.flatMap((statement) => {
        if (!types.isImportDeclaration(statement) || statement.source.value !== clientTaroNativeId) {
            return statement
        }
        statement.specifiers = statement.specifiers.filter((specifier) => {
            return !types.isImportSpecifier(specifier) || getStaticName(specifier.imported) !== 'defineNativeComponent'
        })
        return statement.specifiers.length === 0 ? [] : [statement]
    })
}

/** Identifies the imported macro through its lexical binding, including import aliases. */
function isDefineNativeComponentCall(callPath: NodePath<types.CallExpression>): boolean {
    const callee = callPath.node.callee
    if (!types.isIdentifier(callee)) {
        return false
    }
    const binding = callPath.scope.getBinding(callee.name)
    if (!binding || !types.isImportSpecifier(binding.path.node)) {
        return false
    }
    const declaration = binding.path.parentPath.node
    return (
        types.isImportDeclaration(declaration) &&
        declaration.source.value === clientTaroNativeId &&
        getStaticName(binding.path.node.imported) === 'defineNativeComponent'
    )
}

/** Parses one native entry loader and its optional inline JSX interface. */
function parseDefinition(
    call: types.CallExpression,
    moduleId: string,
    declaredInterfaces: ReadonlyMap<string, readonly types.TSTypeElement[]>,
    buildError: (message: string) => Error
): NativeComponentDefinition {
    if (call.arguments.length !== 1) {
        throw buildError('defineNativeComponent() requires exactly one entry loader')
    }
    const entryReference = readStaticEntryImport(call.arguments[0])
    if (!entryReference) {
        throw buildError('Native component entry must use () => import(...) with a static relative .js path')
    }

    const entryPath = normalizeModuleId(path.resolve(path.dirname(moduleId), entryReference))
    return {
        folder: path.posix.dirname(entryPath),
        entry: path.posix.basename(entryPath, '.js'),
        fields: readInterfaceFields(call.typeArguments, declaredInterfaces, buildError)
    }
}

/** Collects non-generic local object aliases and interfaces as enumerable JSX field declarations. */
function collectInterfaceDeclarations(
    program: types.Program,
    declarations: Map<string, readonly types.TSTypeElement[]>
): void {
    for (const statement of program.body) {
        const declaration = types.isExportNamedDeclaration(statement) ? statement.declaration : statement
        if (
            types.isTSTypeAliasDeclaration(declaration) &&
            !declaration.typeParameters &&
            types.isTSTypeLiteral(declaration.typeAnnotation)
        ) {
            declarations.set(declaration.id.name, declaration.typeAnnotation.members)
            continue
        }
        if (
            types.isTSInterfaceDeclaration(declaration) &&
            !declaration.typeParameters &&
            (declaration.extends?.length ?? 0) === 0
        ) {
            declarations.set(declaration.id.name, declaration.body.body)
        }
    }
}

/** Resolves an inline type or a non-generic object declaration from the current module. */
function resolveInterfaceMembers(
    typeNode: types.TSType,
    declarations: ReadonlyMap<string, readonly types.TSTypeElement[]>
): readonly types.TSTypeElement[] | undefined {
    if (types.isTSTypeLiteral(typeNode)) {
        return typeNode.members
    }
    if (types.isTSTypeReference(typeNode) && types.isIdentifier(typeNode.typeName) && !typeNode.typeArguments) {
        return declarations.get(typeNode.typeName.name)
    }
}

/** Reads enumerable JSX field names without resolving or validating their TypeScript value types. */
function readInterfaceFields(
    typeArguments: types.CallExpression['typeArguments'],
    declaredInterfaces: ReadonlyMap<string, readonly types.TSTypeElement[]>,
    buildError: (message: string) => Error
): string[] {
    if (!typeArguments) {
        return []
    }
    if (!types.isTSTypeParameterInstantiation(typeArguments) || typeArguments.params.length !== 1) {
        throw buildError('Native component interface must be one TypeScript object type')
    }
    const members = resolveInterfaceMembers(typeArguments.params[0], declaredInterfaces)
    if (!members) {
        throw buildError('Native component interface must be inline or declared in the same module')
    }

    // This local set preserves declaration order while rejecting ambiguous duplicate template fields.
    const names = new Set<string>()
    for (const member of members) {
        if (!types.isTSPropertySignature(member) && !types.isTSMethodSignature(member)) {
            throw buildError('Native component interface must contain only static fields')
        }
        if (member.computed) {
            throw buildError('Native component interface contains a computed field')
        }
        const name = getStaticName(member.key)
        if (!name) {
            throw buildError('Native component interface contains a computed field')
        }
        if (names.has(name)) {
            throw buildError(`Duplicate native component interface field: ${name}`)
        }
        names.add(name)
    }

    return [...names].filter((name) => name !== 'children')
}

/** Reads an identifier or string-literal key. */
function getStaticName(node: types.Node): string | undefined {
    if (types.isIdentifier(node)) {
        return node.name
    }
    if (types.isStringLiteral(node)) {
        return node.value
    }
}

/** Reads a zero-argument entry loader containing one statically resolvable native `.js` import. */
function readStaticEntryImport(node: types.Node | null | undefined): string | undefined {
    if (!types.isArrowFunctionExpression(node) || node.params.length !== 0 || !types.isImportExpression(node.body)) {
        return undefined
    }
    const importExpression = node.body
    if (
        !types.isStringLiteral(importExpression.source) ||
        importExpression.options !== null ||
        !isLocalJavaScriptEntry(importExpression.source.value)
    ) {
        return undefined
    }
    return importExpression.source.value
}

/** Limits component entries to JavaScript files reachable from their interface module. */
function isLocalJavaScriptEntry(entry: string): boolean {
    return (entry.startsWith('./') || entry.startsWith('../')) && path.posix.extname(entry) === '.js'
}
