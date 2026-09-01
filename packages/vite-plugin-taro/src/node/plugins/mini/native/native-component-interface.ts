import path from 'node:path'
import type { ExistingRawSourceMap } from 'rolldown'
import { RolldownMagicString } from 'rolldown'
import { parseAst } from 'rolldown/parseAst'
import type { ESTree } from 'rolldown/utils'
import { normalizePath } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { clientTaroNativeId } from '../../client/constant.ts'

export type NativeComponentDefinition = {
    folder: string
    entry: string
    fields: readonly string[]
}

type NativeComponentMacroImport = {
    declaration: ESTree.ImportDeclaration
    names: readonly string[]
}

/** Replaces native component interface calls with source-folder names and returns their static metadata. */
export function transformNativeComponentInterfaces(code: string, id: string, sourcemap: boolean) {
    const moduleId = normalizeModuleId(id)
    const program = parseAst(
        code,
        {
            astType: 'ts',
            lang: 'tsx',
            preserveParens: false,
            sourceType: 'module'
        },
        moduleId
    )
    const declaredInterfaces = collectInterfaceDeclarations(program)
    const macroImports = collectMacroImports(program)
    const importedMacroNames: ReadonlySet<string> = new Set(macroImports.flatMap((item) => item.names))
    const calls = collectTopLevelMacroCalls(program, importedMacroNames)
    const replacements = calls.map((call) => {
        const definition = parseDefinition(call, moduleId, declaredInterfaces, (message) =>
            createTransformError(message, moduleId, code, call.start)
        )
        return { call, definition }
    })

    // This transform-local mutable buffer applies non-overlapping AST edits without regenerating untouched source.
    const transformed = new RolldownMagicString(code, { filename: moduleId })
    replacements.forEach(({ call, definition }) => {
        transformed.overwrite(call.start, call.end, JSON.stringify(path.posix.basename(definition.folder)))
    })
    macroImports.forEach(({ declaration }) => {
        transformed.remove(declaration.start, declaration.end)
    })

    return {
        code: transformed.toString(),
        map: sourcemap ? createSourceMap(transformed, moduleId) : null,
        definitions: replacements.map(({ definition }) => definition)
    }
}

/** Normalizes Rolldown's native source-map object to the public plugin source-map shape. */
function createSourceMap(transformed: RolldownMagicString, moduleId: string): ExistingRawSourceMap {
    const sourceMap = transformed.generateMap({
        hires: 'boundary',
        includeContent: true,
        source: moduleId
    })
    return {
        file: sourceMap.file,
        mappings: sourceMap.mappings,
        names: sourceMap.names,
        sources: sourceMap.sources,
        sourcesContent: sourceMap.sourcesContent,
        version: sourceMap.version
    }
}

/** Finds named imports of the compile-time macro and records their local aliases. */
function collectMacroImports(program: ESTree.Program): NativeComponentMacroImport[] {
    return program.body.flatMap((statement) => {
        if (statement.type !== 'ImportDeclaration' || statement.source.value !== clientTaroNativeId) {
            return []
        }
        const names = statement.specifiers.flatMap((specifier) => {
            if (specifier.type !== 'ImportSpecifier' || getStaticName(specifier.imported) !== 'defineNativeComponent') {
                return []
            }
            return [specifier.local.name]
        })
        return names.length === 0 ? [] : [{ declaration: statement, names }]
    })
}

/** Collects direct module-level macro calls, excluding calls inside nested scopes. */
function collectTopLevelMacroCalls(
    program: ESTree.Program,
    importedMacroNames: ReadonlySet<string>
): ESTree.CallExpression[] {
    return program.body.flatMap((statement) => {
        if (statement.type === 'ExpressionStatement') {
            return isImportedMacroCall(statement.expression, importedMacroNames) ? [statement.expression] : []
        }
        if (statement.type === 'ExportDefaultDeclaration') {
            return isImportedMacroCall(statement.declaration, importedMacroNames) ? [statement.declaration] : []
        }

        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
        if (declaration?.type !== 'VariableDeclaration') {
            return []
        }
        return declaration.declarations.flatMap(({ init }) => {
            return isImportedMacroCall(init, importedMacroNames) ? [init] : []
        })
    })
}

/** Matches a direct call to one of the macro's module-level import bindings. */
function isImportedMacroCall(
    node: ESTree.Expression | ESTree.Declaration | null | undefined,
    importedMacroNames: ReadonlySet<string>
): node is ESTree.CallExpression {
    return (
        node?.type === 'CallExpression' && node.callee.type === 'Identifier' && importedMacroNames.has(node.callee.name)
    )
}

/** Parses one native entry loader and its optional TypeScript interface. */
function parseDefinition(
    call: ESTree.CallExpression,
    moduleId: string,
    declaredInterfaces: ReadonlyMap<string, readonly ESTree.TSSignature[]>,
    buildError: (message: string) => Error
): NativeComponentDefinition {
    if (call.arguments.length !== 1) {
        throw buildError('defineNativeComponent() requires exactly one entry loader')
    }
    const entryReference = readStaticEntryImport(call.arguments[0])
    if (!entryReference) {
        throw buildError('Native component entry must use () => import(...) with a static relative .js path')
    }

    const entryPath = normalizePath(path.resolve(path.dirname(moduleId), entryReference))
    return {
        folder: path.posix.dirname(entryPath),
        entry: path.posix.basename(entryPath, '.js'),
        fields: readInterfaceFields(call.typeArguments, declaredInterfaces, buildError)
    }
}

/** Collects non-generic local object aliases and interfaces as native template field declarations. */
function collectInterfaceDeclarations(program: ESTree.Program): ReadonlyMap<string, readonly ESTree.TSSignature[]> {
    // This module-local map supports nearby declarations without constructing a TypeScript type-checker program.
    const declarations = new Map<string, readonly ESTree.TSSignature[]>()
    for (const statement of program.body) {
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
        if (
            declaration?.type === 'TSTypeAliasDeclaration' &&
            !declaration.typeParameters &&
            declaration.typeAnnotation.type === 'TSTypeLiteral'
        ) {
            declarations.set(declaration.id.name, declaration.typeAnnotation.members)
            continue
        }
        if (
            declaration?.type === 'TSInterfaceDeclaration' &&
            !declaration.typeParameters &&
            declaration.extends.length === 0
        ) {
            declarations.set(declaration.id.name, declaration.body.body)
        }
    }
    return declarations
}

/** Resolves an inline type or a non-generic object declaration from the current module. */
function resolveInterfaceMembers(
    typeNode: ESTree.TSType,
    declarations: ReadonlyMap<string, readonly ESTree.TSSignature[]>
): readonly ESTree.TSSignature[] | undefined {
    if (typeNode.type === 'TSTypeLiteral') {
        return typeNode.members
    }
    if (typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier' && !typeNode.typeArguments) {
        return declarations.get(typeNode.typeName.name)
    }
}

/** Reads native template field names without resolving or validating their TypeScript value types. */
function readInterfaceFields(
    typeArguments: ESTree.TSTypeParameterInstantiation | null | undefined,
    declaredInterfaces: ReadonlyMap<string, readonly ESTree.TSSignature[]>,
    buildError: (message: string) => Error
): string[] {
    if (!typeArguments) {
        return []
    }
    if (typeArguments.params.length !== 1) {
        throw buildError('Native component interface must be one TypeScript object type')
    }
    // The length check above proves the one parameter exists; ESTree models the array element as optional generically.
    const firstType = typeArguments.params[0] as ESTree.TSType
    const members = resolveInterfaceMembers(firstType, declaredInterfaces)
    if (!members) {
        throw buildError('Native component interface must be inline or declared in the same module')
    }

    // This local set preserves declaration order while rejecting ambiguous duplicate template fields.
    const names = new Set<string>()
    for (const member of members) {
        if (member.type !== 'TSPropertySignature' && member.type !== 'TSMethodSignature') {
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
function getStaticName(node: ESTree.Node): string | undefined {
    if (node.type === 'Identifier') {
        return node.name
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value
    }
}

/** Reads a zero-argument entry loader containing one statically resolvable native `.js` import. */
function readStaticEntryImport(node: ESTree.Argument | null | undefined): string | undefined {
    if (node?.type !== 'ArrowFunctionExpression' || node.params.length !== 0 || node.body.type !== 'ImportExpression') {
        return undefined
    }
    const importExpression = node.body
    if (
        importExpression.source.type !== 'Literal' ||
        typeof importExpression.source.value !== 'string' ||
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

/** Adds a stable source location to semantic errors reported after parsing. */
function createTransformError(message: string, moduleId: string, code: string, offset: number): Error {
    const prefix = code.slice(0, offset)
    const line = prefix.split('\n').length
    const column = offset - prefix.lastIndexOf('\n')
    return new Error(`${message}\n${moduleId}:${line}:${column}`)
}
