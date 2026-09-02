/**
 * Final Rolldown ESM to native Mini Program CommonJS renderer.
 *
 * The Mini Program build has two cooperating JavaScript execution domains:
 *
 * - Native and amphibious chunks are entered by the host through synchronous CommonJS `require`. They install infrastructure
 *   and call the native App, Page, and Component lifecycle APIs.
 * - Capsule chunks retain ESM linking behavior behind the bundled SystemJS runtime. They contain the application graph and
 *   may use cycles, live bindings, dynamic imports, and top-level await.
 *
 * Rolldown still emits one ESM chunk graph before that runtime split is materialized. Mini Program hosts cannot execute final ESM
 * imports directly, so this renderer translates chunks classified as native or amphibious into CommonJS while preserving the
 * ESM behavior observable at their boundary. Ordinary native dependencies become `require` namespace cells; capsule imports
 * become synchronous platform-global `System.importSync` lookups; and exports are published through the CommonJS `exports` object.
 *
 * This is deliberately a final-chunk compiler, not a general source-module compiler. Rolldown has already lowered TypeScript,
 * bundled source modules, selected chunk boundaries, and normalized the remaining imports and exports. Restricting the input
 * grammar lets the hot startup path use one Oxc analysis plus local range edits instead of Babel parsing, cloning, traversing,
 * and regenerating each complete chunk. Unsupported future Rolldown forms fail the build rather than being approximated.
 *
 * Babel's CommonJS transform remains beside this implementation only as a differential-test oracle. Those tests compare
 * runtime observations for import interop, receiver semantics, live export writes, declaration timing, and top-level `this`.
 */
import type {
    AssignmentTarget,
    ExportSpecifier,
    ImportDeclaration,
    ModuleExportName,
    Node,
    Program,
    VariableDeclaration
} from '@oxc-project/types'
import { isReferenceIdentifier, ScopeTracker, walk } from 'oxc-walker'
import { type ExistingRawSourceMap, RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import type { Rolldown } from 'vite'
import type { AstTransformResult } from '../../../utils/transform.ts'
import type { RuntimeContract } from '../mini-contract.ts'
import { resolveLogicalChunkReference, resolvePhysicalChunkReference } from '../module/chunk-path.ts'
import type { MiniModuleClassifier } from '../module/module.ts'

type ImportBinding = Readonly<{
    imported: string | null
    local: string
    namespace: string
}>

type ImportedReferenceContext = 'plain' | 'unbound'

type ImportInterop = 'none' | 'default' | 'namespace'

type ImportModel = Readonly<{
    bindings: readonly ImportBinding[]
    capsuleBinding: Readonly<{ imported: string; local: string; logicalId: string }> | null
    interop: ImportInterop
    namespace: string
    reference: string
}>

type NativeModuleModel = Readonly<{
    defaultInterop: string
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
    imports: readonly ImportModel[]
    importBindingsByLocal: ReadonlyMap<string, ImportBinding>
    namespaceInterop: string
    postfixTemp: string
    program: Program
    scopes: ScopeTracker
    usesPostfixTemp: boolean
}>

/**
 * Materializes one final native/amphibious Rolldown chunk as executable Mini Program CommonJS.
 *
 * The transform performs four semantic operations:
 *
 * 1. Static ESM imports are hoisted into source-order `require` calls. Named imports remain property reads from the required
 *    namespace so they observe current values. Default and namespace imports receive Babel-compatible CommonJS interop.
 * 2. An import whose target owns a capsule entry is not passed to native `require`. It becomes
 *    the platform-global `System.importSync(logicalChunkId)`, synchronously linking the capsule before the native lifecycle call.
 * 3. Local exports are published at declaration and mutation points. Imported re-exports use getters, while assignments and
 *    updates notify every alias without changing expression completion values or accidentally matching shadowed bindings.
 * 4. ESM top-level `this` becomes `undefined`. Direct imported calls and tags are explicitly unbound so converting an import
 *    into a namespace property does not introduce a false CommonJS receiver.
 *
 * Static dependency loading is emitted before the untouched module body because ESM evaluates dependencies before body
 * statements regardless of where import declarations appear textually. Generated helper names are allocated against every
 * source identifier. Source maps use the same range edits when requested; Mini Program development disables them and keeps this path
 * focused on startup latency.
 */
export function renderNative({
    code,
    chunk,
    chunks,
    runtime,
    classifyModule,
    sourcemap
}: {
    code: string
    chunk: Rolldown.RenderedChunk
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    runtime: RuntimeContract
    classifyModule: MiniModuleClassifier
    sourcemap: boolean
}): AstTransformResult {
    const parsed = parseSync(chunk.fileName, code)
    if (parsed.errors.length > 0) {
        const diagnostics = parsed.errors.map((error) => error.message).join('; ')
        throw new Error(`Failed to parse ${chunk.fileName} with Oxc: ${diagnostics}`)
    }

    // Analysis owns grammar validation, scope resolution, helper allocation, and physical-to-logical capsule classification.
    // It completes before an editor exists, so failure cannot leak a partially rewritten chunk into Rolldown's output graph.
    const model = analyzeNativeModule(parsed.program, chunk, chunks, classifyModule)
    const editor = new RolldownMagicString(code, { filename: chunk.fileName })

    // Expression edits split untouched source ranges first. Declaration replacement runs afterwards because MagicString must
    // not split a range after that complete range has already been overwritten or removed.
    rewriteExpressionSemantics(editor, model, chunk.fileName)
    rewriteTopLevelThis(editor, model.program)
    rewriteModuleDeclarations(editor, model)

    const hasExports = model.exportNamesByLocal.size > 0
    const helpers = renderInteropHelpers(model)
    const postfixTemp = model.usesPostfixTemp ? `var ${model.postfixTemp};` : ''
    const imports = renderImports(model, runtime.globalObject)
    if (hasExports) {
        editor.prepend(
            `"use strict";Object.defineProperty(exports,"__esModule",{value:true});${helpers}${postfixTemp}${imports}`
        )
    } else {
        editor.prepend(`"use strict";${helpers}${postfixTemp}${imports}`)
    }

    return {
        code: editor.toString(),
        map: sourcemap ? createSourceMap(editor, chunk.fileName) : null
    }
}

/**
 * Builds the immutable semantic model consumed by all rewrite passes.
 *
 * Import classification needs the complete rendered chunk graph: a relative path alone cannot reveal whether native require
 * should execute the target or SystemJS should link it as a capsule. ScopeTracker is frozen after declaration collection so
 * later reference walks can distinguish module cells from same-named parameters and nested locals.
 */
function analyzeNativeModule(
    program: Program,
    chunk: Rolldown.RenderedChunk,
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>,
    classifyModule: MiniModuleClassifier
): NativeModuleModel {
    const identifierNames = collectIdentifierNames(program)
    const exportNamesByLocal = new Map<string, string[]>()
    const imports: ImportModel[] = []
    const importBindingsByLocal = new Map<string, ImportBinding>()
    let hasDirectEval = false

    walk(program, {
        enter(node) {
            if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval') {
                hasDirectEval = true
            }
        }
    })
    if (hasDirectEval) throw unsupported(chunk.fileName, 'direct eval')

    for (const node of program.body) {
        switch (node.type) {
            case 'ImportDeclaration': {
                requirePlainImport(node, chunk.fileName)
                const capsule = getImportedCapsule(chunk.fileName, node.source.value, chunks, classifyModule)
                if (capsule) {
                    const [specifier] = node.specifiers
                    if (node.specifiers.length !== 1 || !specifier || specifier.type === 'ImportNamespaceSpecifier') {
                        throw new Error(
                            `Expected one capsule value import from ${capsule.fileName} in ${chunk.fileName}`
                        )
                    }
                    imports.push({
                        bindings: [],
                        capsuleBinding: {
                            imported:
                                specifier.type === 'ImportDefaultSpecifier'
                                    ? 'default'
                                    : moduleExportName(specifier.imported),
                            local: specifier.local.name,
                            logicalId: resolveLogicalChunkReference(chunk.fileName, node.source.value)
                        },
                        interop: 'none',
                        namespace: '',
                        reference: node.source.value
                    })
                    continue
                }

                const namespace = takeGeneratedName('__nativeImport', identifierNames)
                const bindings = node.specifiers.map((specifier): ImportBinding => {
                    const binding = {
                        imported:
                            specifier.type === 'ImportNamespaceSpecifier'
                                ? null
                                : specifier.type === 'ImportDefaultSpecifier'
                                  ? 'default'
                                  : moduleExportName(specifier.imported),
                        local: specifier.local.name,
                        namespace
                    }
                    importBindingsByLocal.set(binding.local, binding)
                    return binding
                })
                imports.push({
                    bindings,
                    capsuleBinding: null,
                    interop: importInterop(node),
                    namespace,
                    reference: node.source.value
                })
                break
            }
            case 'ExportNamedDeclaration':
                collectFinalExports(node, exportNamesByLocal, chunk.fileName)
                break
            case 'ExportDefaultDeclaration':
            case 'ExportAllDeclaration':
                throw unsupported(chunk.fileName, `source-level ${node.type}`)
        }
    }

    const defaultInterop = takeGeneratedName('__nativeDefault', identifierNames)
    const namespaceInterop = takeGeneratedName('__nativeNamespace', identifierNames)
    const postfixTemp = takeGeneratedName('__nativePostfix', identifierNames)
    const scopes = new ScopeTracker({ preserveExitedScopes: true })
    walk(program, { scopeTracker: scopes })
    scopes.freeze()
    const usesPostfixTemp = hasPostfixExportUpdate(program, scopes, exportNamesByLocal)

    return {
        defaultInterop,
        exportNamesByLocal,
        imports,
        importBindingsByLocal,
        namespaceInterop,
        postfixTemp,
        program,
        scopes,
        usesPostfixTemp
    }
}

/**
 * Removes syntax that Mini Program hosts cannot parse and adds declaration-time CommonJS publication without regenerating other source.
 * Import execution itself is emitted in the generated header; removing declarations here retains comments and all unrelated
 * Rolldown output byte-for-byte. Final export lists publish only imported getters because local cells were already instrumented
 * at their declarations and writes.
 */
function rewriteModuleDeclarations(editor: RolldownMagicString, model: NativeModuleModel): void {
    for (const node of model.program.body) {
        switch (node.type) {
            case 'ImportDeclaration':
                // Static imports execute before every module body statement regardless of their textual position.
                editor.remove(node.start, node.end)
                break
            case 'ExportNamedDeclaration':
                if (node.declaration) {
                    // Strip only the export keyword; declaration publication is handled at its initializer or end boundary.
                    editor.remove(node.start, node.declaration.start)
                    rewriteExportedDeclaration(editor, node.declaration, model.exportNamesByLocal)
                } else {
                    editor.overwrite(node.start, node.end, renderExportList(node.specifiers, model))
                }
                break
            case 'VariableDeclaration':
                publishVariableInitializers(editor, node, model.exportNamesByLocal)
                break
            case 'FunctionDeclaration':
                if (node.id) publishAfter(editor, node.end, node.id.name, model.exportNamesByLocal)
                break
            case 'ClassDeclaration':
                if (node.id) publishAfter(editor, node.end, node.id.name, model.exportNamesByLocal)
                break
        }
    }
}

/**
 * Rewrites imported references and live-export mutations in one scope-aware O(n) pass.
 *
 * A named import such as `fn` becomes a namespace property read. In call or tag position it is wrapped as `(0, ns.fn)` to
 * preserve ESM's unbound receiver; in `new fn()` it remains `ns.fn` because construction has no method receiver. Exported
 * writes are instrumented only when ScopeTracker resolves the target to the root module declaration.
 */
function rewriteExpressionSemantics(editor: RolldownMagicString, model: NativeModuleModel, filename: string): void {
    // This mutable traversal stack exists only to see through explicit ParenthesizedExpression nodes around imported calls.
    const ancestors: Node[] = []
    walk(model.program, {
        scopeTracker: model.scopes,
        enter(node, parent) {
            if (
                node.type === 'Identifier' &&
                parent?.type !== 'ImportDeclaration' &&
                isReferenceIdentifier(node, parent)
            ) {
                const binding = model.importBindingsByLocal.get(node.name)
                const declaration = binding ? model.scopes.getDeclaration(node.name) : null
                if (binding && declaration?.type === 'Import') {
                    const context = importedReferenceContext(node, parent, ancestors)
                    const imported = importedExpression(binding)
                    const replacement = context === 'unbound' ? `(0,${imported})` : imported
                    // Replacing `{ imported }` with `{ imported: namespace.imported }` preserves shorthand property keys.
                    editor.overwrite(
                        node.start,
                        node.end,
                        parent?.type === 'Property' && parent.shorthand && parent.value === node
                            ? `${node.name}:${replacement}`
                            : replacement
                    )
                }
            }

            switch (node.type) {
                case 'AssignmentExpression':
                    rewriteExportAssignment(editor, node.left, node.start, model, filename)
                    break
                case 'UpdateExpression':
                    rewriteExportUpdate(editor, node, model)
                    break
                case 'ForInStatement':
                case 'ForOfStatement':
                    if (node.left.type !== 'VariableDeclaration') {
                        requireNoExportedPattern(node.left, model, filename)
                    }
                    break
            }
            ancestors.push(node)
        },
        leave() {
            ancestors.pop()
        }
    })
}

/** Prefixes a direct exported assignment; assignment operators already preserve their own completion value. */
function rewriteExportAssignment(
    editor: RolldownMagicString,
    target: AssignmentTarget,
    start: number,
    model: NativeModuleModel,
    filename: string
): void {
    if (target.type === 'Identifier') {
        const names = exportedRootNames(target.name, model)
        if (names.length > 0) editor.prependLeft(start, exportAssignmentPrefix(names))
        return
    }
    requireNoExportedPattern(target, model, filename)
}

/** Publishes the updated cell while retaining the distinct prefix/postfix expression result. */
function rewriteExportUpdate(
    editor: RolldownMagicString,
    update: Extract<Node, { type: 'UpdateExpression' }>,
    model: NativeModuleModel
): void {
    if (update.argument.type !== 'Identifier') return
    const names = exportedRootNames(update.argument.name, model)
    if (names.length === 0) return
    if (update.prefix) {
        editor.prependLeft(update.start, exportAssignmentPrefix(names))
        return
    }

    editor.prependLeft(update.start, `(${model.postfixTemp}=`)
    editor.appendRight(update.end, `,${exportAssignmentExpression(names, update.argument.name)},${model.postfixTemp})`)
}

/** Rejects destructuring writes because wrapping them would change their completion value. */
function requireNoExportedPattern(target: AssignmentTarget, model: NativeModuleModel, filename: string): void {
    const exported = bindingNames(target).filter((name) => exportedRootNames(name, model).length > 0)
    if (exported.length > 0) {
        throw unsupported(filename, `destructuring write to exported binding ${JSON.stringify(exported[0])}`)
    }
}

function exportedRootNames(local: string, model: NativeModuleModel): readonly string[] {
    const names = model.exportNamesByLocal.get(local) ?? []
    if (names.length === 0) return names
    return model.scopes.getDeclaration(local)?.scope === '' ? names : []
}

/** Detects whether the generated declaration header needs one postfix completion-value cell. */
function hasPostfixExportUpdate(
    program: Program,
    scopes: ScopeTracker,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): boolean {
    let found = false
    walk(program, {
        scopeTracker: scopes,
        enter(node) {
            if (found || node.type !== 'UpdateExpression' || node.prefix || node.argument.type !== 'Identifier') return
            const names = exportNamesByLocal.get(node.argument.name) ?? []
            if (names.length > 0 && scopes.getDeclaration(node.argument.name)?.scope === '') found = true
        }
    })
    return found
}

/** Rewrites ESM top-level this, including arrow functions that lexically inherit it. */
function rewriteTopLevelThis(editor: RolldownMagicString, program: Program): void {
    let thisBoundaryDepth = 0
    walk(program, {
        enter(node) {
            if (isThisBoundary(node)) thisBoundaryDepth += 1
            if (node.type === 'ThisExpression' && thisBoundaryDepth === 0)
                editor.overwrite(node.start, node.end, 'void 0')
        },
        leave(node) {
            if (isThisBoundary(node)) thisBoundaryDepth -= 1
        }
    })
}

/** Records aliases from Rolldown's normalized terminal `export { ... }` declaration. */
function collectFinalExports(
    declaration: Extract<Program['body'][number], { type: 'ExportNamedDeclaration' }>,
    exportNamesByLocal: Map<string, string[]>,
    filename: string
): void {
    if (declaration.source || declaration.attributes.length > 0 || declaration.exportKind === 'type') {
        throw unsupported(filename, 're-exports, export attributes, or type-only exports')
    }
    if (declaration.declaration) {
        for (const local of declarationBindingNames(declaration.declaration, filename)) {
            const names = exportNamesByLocal.get(local) ?? []
            names.push(local)
            if (!exportNamesByLocal.has(local)) exportNamesByLocal.set(local, names)
        }
        return
    }
    for (const specifier of declaration.specifiers) {
        const local = moduleExportName(specifier.local)
        const names = exportNamesByLocal.get(local) ?? []
        names.push(moduleExportName(specifier.exported))
        if (!exportNamesByLocal.has(local)) exportNamesByLocal.set(local, names)
    }
}

/** Applies publication edits to a declaration wrapped by `export`. */
function rewriteExportedDeclaration(
    editor: RolldownMagicString,
    declaration: NonNullable<Extract<Program['body'][number], { type: 'ExportNamedDeclaration' }>['declaration']>,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    switch (declaration.type) {
        case 'VariableDeclaration':
            publishVariableInitializers(editor, declaration, exportNamesByLocal)
            break
        case 'FunctionDeclaration':
        case 'ClassDeclaration':
            if (declaration.id) publishAfter(editor, declaration.end, declaration.id.name, exportNamesByLocal)
            break
    }
}

/** Emits execute-time export assignments, using getters for imported cells to preserve live reads. */
function renderExportList(specifiers: readonly ExportSpecifier[], model: NativeModuleModel): string {
    return specifiers
        .map((specifier) => {
            const local = moduleExportName(specifier.local)
            const exported = moduleExportName(specifier.exported)
            const imported = model.importBindingsByLocal.get(local)
            return imported
                ? `Object.defineProperty(exports,${JSON.stringify(exported)},{enumerable:true,get:function(){return ${importedExpression(imported)}}});`
                : ''
        })
        .join('')
}

/** Publishes top-level initialized variables at their original initialization point. */
function publishVariableInitializers(
    editor: RolldownMagicString,
    declaration: VariableDeclaration,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    for (const declarator of declaration.declarations) {
        if (declarator.id.type !== 'Identifier') {
            const exported = bindingNames(declarator.id).filter((name) => exportNamesByLocal.has(name))
            if (exported.length > 0) throw unsupported('native chunk', 'exported destructuring declaration')
            continue
        }
        const names = exportNamesByLocal.get(declarator.id.name) ?? []
        if (names.length === 0) continue
        if (declarator.init) {
            editor.prependLeft(declarator.init.start, exportAssignmentPrefix(names))
        } else {
            editor.appendRight(declarator.end, `=${exportAssignmentExpression(names, 'void 0')}`)
        }
    }
}

/** Publishes declaration values that become initialized only after their declaration executes. */
function publishAfter(
    editor: RolldownMagicString,
    end: number,
    local: string,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    const names = exportNamesByLocal.get(local) ?? []
    if (names.length > 0) editor.appendRight(end, `;${exportAssignmentExpression(names, local)};`)
}

function exportAssignmentPrefix(names: readonly string[]): string {
    return names.reduce((prefix, name) => `exports[${JSON.stringify(name)}]=${prefix}`, '')
}

function exportAssignmentExpression(names: readonly string[], value: string): string {
    return `${exportAssignmentPrefix(names)}${value}`
}

/**
 * Imported functions are ESM references, not namespace methods. A direct call must therefore discard the generated
 * namespace receiver with `(0, value)()`. The same comma expression preserves unbound optional calls and tag invocation;
 * constructors remain plain references because `new` does not derive a receiver from a member expression.
 */
function importedReferenceContext(
    node: Extract<Node, { type: 'Identifier' }>,
    parent: Node | null,
    ancestors: readonly Node[]
): ImportedReferenceContext {
    let expression: Node = node
    let semanticParent = parent
    let ancestorIndex = ancestors.length - 1
    while (semanticParent?.type === 'ParenthesizedExpression' && semanticParent.expression === expression) {
        expression = semanticParent
        ancestorIndex -= 1
        semanticParent = ancestors[ancestorIndex] as Node
    }
    if (semanticParent?.type === 'CallExpression' && semanticParent.callee === expression) return 'unbound'
    if (semanticParent?.type === 'NewExpression' && semanticParent.callee === expression) return 'plain'
    if (semanticParent?.type === 'TaggedTemplateExpression' && semanticParent.tag === expression) return 'unbound'
    return 'plain'
}

function importedExpression(binding: ImportBinding): string {
    return binding.imported === null ? binding.namespace : memberExpression(binding.namespace, binding.imported)
}

function memberExpression(object: string, property: string): string {
    return /^[$A-Z_a-z][$\w]*$/.test(property) ? `${object}.${property}` : `${object}[${JSON.stringify(property)}]`
}

function getImportedCapsule(
    fileName: string,
    reference: string,
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>,
    classifyModule: MiniModuleClassifier
): Rolldown.RenderedChunk | undefined {
    if (!reference.startsWith('./') && !reference.startsWith('../')) return undefined
    const imported = chunks[resolvePhysicalChunkReference(fileName, reference)]
    return imported && classifyModule(imported).entryRole === 'capsule' ? imported : undefined
}

/**
 * Renders the dependency header in original import order.
 *
 * Side-effect imports always remain standalone `require` calls. Ordinary value imports share one required namespace per final
 * import declaration, while cross-domain capsule imports synchronously ask SystemJS for the namespace under its package-neutral
 * logical ID. Physical package placement remains the transport's responsibility.
 */
function renderImports(model: NativeModuleModel, globalObject: string): string {
    return model.imports
        .map((importModel) => {
            if (importModel.capsuleBinding) {
                const { imported, local, logicalId } = importModel.capsuleBinding
                const namespace = `${globalObject}.System.importSync(${JSON.stringify(logicalId)})`
                return `var ${local}=${memberExpression(namespace, imported)};`
            }

            const requireCall = `require(${JSON.stringify(importModel.reference)})`
            if (importModel.bindings.length === 0) return `${requireCall};`
            const importedValue =
                importModel.interop === 'default'
                    ? `${model.defaultInterop}(${requireCall})`
                    : importModel.interop === 'namespace'
                      ? `${model.namespaceInterop}(${requireCall})`
                      : requireCall
            return `var ${importModel.namespace}=${importedValue};`
        })
        .join('')
}

/** Selects Babel-compatible wrapping for default and namespace imports from CommonJS values. */
function importInterop(declaration: ImportDeclaration): ImportInterop {
    if (declaration.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')) return 'namespace'
    if (declaration.specifiers.some((specifier) => specifier.type === 'ImportDefaultSpecifier')) return 'default'
    return 'none'
}

/** Emits interop helpers only when an analyzed import needs them. */
function renderInteropHelpers(model: NativeModuleModel): string {
    const kinds = new Set(model.imports.map(({ interop }) => interop))
    const defaultHelper = kinds.has('default')
        ? `function ${model.defaultInterop}(value){return value&&value.__esModule?value:{default:value};}`
        : ''
    const namespaceHelper = kinds.has('namespace')
        ? `function ${model.namespaceInterop}(value){if(value&&value.__esModule)return value;var namespace={default:value};if(value!==null&&(typeof value==="object"||typeof value==="function")){for(var key in value)if(key!=="default"&&Object.prototype.hasOwnProperty.call(value,key))Object.defineProperty(namespace,key,{enumerable:true,get:function(key){return function(){return value[key]}}(key)});}return namespace;}`
        : ''
    return `${defaultHelper}${namespaceHelper}`
}

function requirePlainImport(declaration: ImportDeclaration, filename: string): void {
    if (declaration.phase || declaration.attributes.length > 0 || declaration.importKind === 'type') {
        throw unsupported(filename, 'import phases, attributes, or type-only imports')
    }
}

/** Collects every occupied identifier before helper allocation. */
function collectIdentifierNames(program: Program): Set<string> {
    const names = new Set<string>()
    walk(program, {
        enter(node) {
            if (node.type === 'Identifier') names.add(node.name)
        }
    })
    return names
}

function takeGeneratedName(base: string, used: Set<string>): string {
    let suffix = 0
    let candidate = base
    while (used.has(candidate)) {
        suffix += 1
        candidate = `${base}${suffix}`
    }
    used.add(candidate)
    return candidate
}

function moduleExportName(name: ModuleExportName): string {
    return name.type === 'Literal' ? String(name.value) : name.name
}

function declarationBindingNames(declaration: Node, _filename: string): string[] {
    if (declaration.type === 'VariableDeclaration') {
        return declaration.declarations.flatMap(({ id }) => bindingNames(id))
    }
    // Final JavaScript named-declaration exports can otherwise contain only named functions or classes.
    const namedDeclaration = declaration as Node & { id: { name: string } }
    return [namedDeclaration.id.name]
}

function bindingNames(pattern: Node): string[] {
    switch (pattern.type) {
        case 'Identifier':
            return [pattern.name]
        case 'AssignmentPattern':
            return bindingNames(pattern.left)
        case 'ArrayPattern':
            return pattern.elements.flatMap((element) => (element ? bindingNames(element) : []))
        case 'ObjectPattern':
            return pattern.properties.flatMap((property) =>
                property.type === 'Property' ? bindingNames(property.value) : bindingNames(property.argument)
            )
        case 'RestElement':
            return bindingNames(pattern.argument)
        default:
            return []
    }
}

function isThisBoundary(node: Node): boolean {
    return (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ClassDeclaration' ||
        node.type === 'ClassExpression'
    )
}

function unsupported(filename: string, construct: string): Error {
    return new Error(`Unsupported final Rolldown native chunk ${filename}: ${construct}`)
}

function createSourceMap(editor: RolldownMagicString, filename: string): ExistingRawSourceMap {
    const generated = editor.generateMap({
        file: filename,
        hires: 'boundary',
        includeContent: true,
        source: filename
    })
    return {
        version: generated.version,
        file: generated.file,
        sources: generated.sources,
        sourcesContent: generated.sourcesContent,
        names: generated.names,
        mappings: generated.mappings
    }
}
