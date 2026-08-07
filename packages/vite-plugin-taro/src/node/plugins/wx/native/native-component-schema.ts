import path from 'node:path'
import { type NodePath, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { clientTaroNativeId } from '../../client/constant.ts'

const schemaConstructors = new Set(['String', 'Number', 'Boolean', 'Object', 'Array'])
const schemaSectionNames = new Set(['properties', 'events'])

export type NativeComponentSchemaDefinition = {
    folder: string
    entry: string
    properties: readonly string[]
    events: readonly string[]
}

/** Replaces native facade calls with their source-folder basename and returns their static metadata. */
export function transformNativeComponentFacades(code: string, id: string, sourcemap: boolean) {
    const moduleId = normalizeModuleId(id)
    // Collection is local to this transform and preserves declaration order for deterministic later stages.
    const definitions: NativeComponentSchemaDefinition[] = []
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
            function transformNativeComponentSchemas() {
                return {
                    visitor: {
                        CallExpression(callPath) {
                            if (!isDefineNativeComponentCall(callPath)) {
                                return
                            }
                            const definition = parseDefinition(callPath.node, moduleId, (message) =>
                                callPath.buildCodeFrameError(message)
                            )
                            definitions.push(definition)
                            callPath.replaceWith(types.stringLiteral(path.posix.basename(definition.folder)))
                        },
                        Program: {
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
        throw new Error(`Failed to transform native component facades in ${id}`)
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

/** Parses one component entry and its two required schema namespaces. */
function parseDefinition(
    call: types.CallExpression,
    moduleId: string,
    buildError: (message: string) => Error
): NativeComponentSchemaDefinition {
    if (call.arguments.length !== 2) {
        throw buildError('defineNativeComponent() requires an entry loader and one schema object')
    }
    const [entryNode, schemaNode] = call.arguments
    const entryReference = readStaticEntryImport(entryNode)
    if (!entryReference) {
        throw buildError('Native component entry must use () => import(...) with a static relative .js path')
    }
    if (!types.isObjectExpression(schemaNode)) {
        throw buildError('Native component schema must be an inline object')
    }

    const sections = readSchemaSections(schemaNode, buildError)
    const properties = readSchemaFields(sections.get('properties'), 'properties', buildError)
    const events = readSchemaFields(sections.get('events'), 'events', buildError)
    const propertyNames = new Set(properties)
    const collision = events.find((eventName) => propertyNames.has(eventName))
    if (collision) {
        throw buildError(`Native component field ${collision} is both a property and an event`)
    }

    const entryPath = normalizeModuleId(path.resolve(path.dirname(moduleId), entryReference))
    return {
        folder: path.posix.dirname(entryPath),
        entry: path.posix.basename(entryPath, '.js'),
        properties,
        events
    }
}

/** Reads the exact top-level properties and events sections. */
function readSchemaSections(
    schema: types.ObjectExpression,
    buildError: (message: string) => Error
): ReadonlyMap<string, types.ObjectExpression> {
    const sections = new Map<string, types.ObjectExpression>()
    schema.properties.forEach((property) => {
        if (types.isSpreadElement(property)) {
            throw buildError('Native component schema cannot use spread fields')
        }
        if (!types.isObjectProperty(property) || property.computed) {
            throw buildError('Native component schema sections must be static object fields')
        }
        const name = getStaticName(property.key)
        if (!name || !schemaSectionNames.has(name)) {
            throw buildError(`Unknown native component schema section: ${name ?? 'computed field'}`)
        }
        if (sections.has(name)) {
            throw buildError(`Duplicate native component schema section: ${name}`)
        }
        if (!types.isObjectExpression(property.value)) {
            throw buildError(`Native component ${name} schema must be an inline object`)
        }
        sections.set(name, property.value)
    })
    schemaSectionNames.forEach((name) => {
        if (!sections.has(name)) {
            throw buildError(`Native component schema is missing ${name}`)
        }
    })
    return sections
}

/** Reads and validates one namespace's static field schemas. */
function readSchemaFields(
    section: types.ObjectExpression | undefined,
    sectionName: string,
    buildError: (message: string) => Error
): string[] {
    if (!section) {
        throw buildError(`Native component schema is missing ${sectionName}`)
    }
    const names = new Set<string>()
    section.properties.forEach((property) => {
        if (types.isSpreadElement(property)) {
            throw buildError(`Native component ${sectionName} cannot use spread fields`)
        }
        if (!types.isObjectProperty(property) || property.computed) {
            throw buildError(`Native component ${sectionName} must use static fields`)
        }
        const name = getStaticName(property.key)
        if (!name) {
            throw buildError(`Native component ${sectionName} contains a computed field`)
        }
        if (names.has(name)) {
            throw buildError(`Duplicate native component ${sectionName} field: ${name}`)
        }
        if (!types.isExpression(property.value)) {
            throw buildError(`Native component ${sectionName}.${name} must use a static schema`)
        }
        validateSchemaValue(property.value, `${sectionName}.${name}`, buildError)
        names.add(name)
    })
    return [...names]
}

/** Validates constructor leaves and recursively nested object schemas. */
function validateSchemaValue(value: types.Expression, fieldPath: string, buildError: (message: string) => Error): void {
    if (types.isIdentifier(value) && schemaConstructors.has(value.name)) {
        return
    }
    if (types.isObjectExpression(value)) {
        value.properties.forEach((property) => {
            if (
                types.isSpreadElement(property) ||
                !types.isObjectProperty(property) ||
                property.computed ||
                !types.isExpression(property.value)
            ) {
                throw buildError(`Native component schema ${fieldPath} must be fully static`)
            }
            const name = getStaticName(property.key)
            if (!name) {
                throw buildError(`Native component schema ${fieldPath} contains a computed field`)
            }
            validateSchemaValue(property.value, `${fieldPath}.${name}`, buildError)
        })
        return
    }
    throw buildError(`Unsupported native component schema at ${fieldPath}`)
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

/** Limits component entries to JavaScript files reachable from their facade module. */
function isLocalJavaScriptEntry(entry: string): boolean {
    return (entry.startsWith('./') || entry.startsWith('../')) && path.posix.extname(entry) === '.js'
}
