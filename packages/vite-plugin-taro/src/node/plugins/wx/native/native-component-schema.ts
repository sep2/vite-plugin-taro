import path from 'node:path'
import { transformSync, types } from '@babel/core'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { clientTaroNativeId } from '../../client/client-taro.ts'

const schemaConstructors = new Set(['String', 'Number', 'Boolean', 'Object', 'Array'])
const schemaSectionNames = new Set(['properties', 'events'])

export type NativeComponentSchemaDefinition = {
    moduleId: string
    callStart: number
    folder: string
    sourceDirectory: string
    properties: readonly string[]
    events: readonly string[]
}

/** Parses compile-time native component schemas without transforming application code. */
export function parseNativeComponentSchemas(code: string, id: string): readonly NativeComponentSchemaDefinition[] {
    const moduleId = normalizeModuleId(id)
    // Collection is local to this parse and preserves declaration order for deterministic later transforms.
    const definitions: NativeComponentSchemaDefinition[] = []

    transformSync(code, {
        ast: false,
        babelrc: false,
        code: false,
        configFile: false,
        filename: moduleId,
        parserOpts: {
            plugins: ['jsx', 'typescript']
        },
        plugins: [
            function collectNativeComponentSchemas() {
                return {
                    visitor: {
                        CallExpression(callPath) {
                            if (!isDefineNativeComponentCall(callPath)) {
                                return
                            }
                            definitions.push(
                                parseDefinition(callPath.node, moduleId, (message) =>
                                    callPath.buildCodeFrameError(message)
                                )
                            )
                        }
                    }
                }
            }
        ]
    })

    return definitions
}

/** Identifies the imported macro through its lexical binding, including import aliases. */
function isDefineNativeComponentCall(callPath: {
    node: types.CallExpression
    scope: {
        getBinding: (name: string) =>
            | {
                  path: {
                      node: types.Node
                      parentPath: {
                          node: types.Node
                      }
                  }
              }
            | undefined
    }
}): boolean {
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

/** Parses one folder and its two required schema namespaces. */
function parseDefinition(
    call: types.CallExpression,
    moduleId: string,
    buildError: (message: string) => Error
): NativeComponentSchemaDefinition {
    if (call.arguments.length !== 2) {
        throw buildError('defineNativeComponent() requires a folder and one schema object')
    }
    const [folderNode, schemaNode] = call.arguments
    if (!types.isStringLiteral(folderNode) || !isLocalFolder(folderNode.value)) {
        throw buildError('Native component folder must be a static relative string')
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

    const callStart = call.start
    if (callStart === null || callStart === undefined) {
        throw buildError('Native component declaration has no source position')
    }
    return {
        moduleId,
        callStart,
        folder: folderNode.value,
        sourceDirectory: normalizeModuleId(path.resolve(path.dirname(moduleId), folderNode.value)),
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

/** Limits component sources to folders reachable from their facade module. */
function isLocalFolder(folder: string): boolean {
    return folder.startsWith('./') || folder.startsWith('../')
}
