/**
 * Mini Program final-chunk ESM to SystemJS compiler.
 *
 * This is deliberately not a general source-module transformer. It consumes JavaScript already normalized and bundled by
 * Rolldown, preserves the original source with range edits, and rejects module forms outside that final-chunk grammar. Keep
 * the Babel differential tests beside this file: Babel defines the expected SystemJS publication timing and runtime behavior.
 */
import type {
    AssignmentTarget,
    BindingPattern,
    Class,
    ExportSpecifier,
    ImportDeclaration,
    ModuleExportName,
    Node,
    Function as OxcFunction,
    Program,
    VariableDeclaration
} from '@oxc-project/types'
import { ScopeTracker, walk } from 'oxc-walker'
import { type ExistingRawSourceMap, RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { isRefreshPreambleGuard } from './is-refresh-preamble-guard.ts'
import { StringEditor } from './string-editor.ts'

export type SystemJsOutputFormat = 'system-register' | 'commonjs-registration'
export type SystemJsReferenceKind = 'static' | 'dynamic'

export type TransformSystemJsOptions = Readonly<{
    /** Final JavaScript emitted by Rolldown with ES module syntax still present. */
    code: string
    filename: string
    format: SystemJsOutputFormat
    sourcemap: boolean
    /** Converts physical Rolldown references into the logical IDs used by the Mini capsule registry. */
    resolveReference(reference: string, kind: SystemJsReferenceKind): string
    /** Removes the browser-only React Refresh assertion while traversing a Mini development capsule. */
    removeRefreshPreambleGuard: boolean
}>

export type TransformSystemJsResult = Readonly<{
    code: string
    map: ExistingRawSourceMap | null
}>

type SourceEditor = {
    readonly original: string
    appendLeft(position: number, content: string): unknown
    appendRight(position: number, content: string): unknown
    overwrite(start: number, end: number, content: string): unknown
    prependLeft(position: number, content: string): unknown
    remove(start: number, end: number): unknown
}

type GeneratedNames = Readonly<{
    context: string
    exportBinding: string
    dependencyPrefix: string
}>

type ImportBinding = Readonly<{
    imported: string | null
    local: string
}>

type MutableDependency = {
    source: string
    imports: ImportBinding[]
}

type HoistedVariable = Readonly<{
    declaration: VariableDeclaration
    isForIterationBinding: boolean
}>

/** Immutable facts shared by the declaration and expression rewrite passes. */
type ModuleModel = Readonly<{
    dependencies: readonly MutableDependency[]
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
    functions: readonly OxcFunction[]
    generatedNames: GeneratedNames
    hasTopLevelAwait: boolean
    hoistedVariables: readonly HoistedVariable[]
    importBindings: ReadonlySet<string>
    outerBindings: ReadonlySet<string>
    program: Program
    scopes: ScopeTracker
}>

/**
 * Converts one final Rolldown ES chunk into System.register data without rebuilding its complete AST through Babel.
 *
 * The compiler intentionally accepts Rolldown's normalized final-chunk grammar rather than arbitrary source modules. Every
 * unsupported module declaration fails before source edits begin, so a future Rolldown output change cannot be miscompiled.
 */
export function transformSystemJs(options: TransformSystemJsOptions): TransformSystemJsResult {
    const parseResult = parseSync(options.filename, options.code)
    if (parseResult.errors.length > 0) {
        const diagnostics = parseResult.errors.map((error) => error.message).join('; ')
        throw new Error(`Failed to parse ${options.filename} with Oxc: ${diagnostics}`)
    }

    // Analysis and validation complete before an editor can publish output. A thrown unsupported-form error therefore fails
    // the build transaction instead of returning a partially transformed capsule.
    const model = analyzeModule(parseResult.program, options.filename)
    if (!options.sourcemap) {
        const editor = new StringEditor(options.code)
        applyProgramEdits(editor, model)
        applyExpressionEdits(editor, model, options)
        return { code: assembleUnmappedRegistration(editor, model, options), map: null }
    }

    const editor = new RolldownMagicString(options.code, { filename: options.filename })
    applyProgramEdits(editor, model)
    applyExpressionEdits(editor, model, options)
    assembleMappedRegistration(editor, model, options)

    return {
        code: editor.toString(),
        map: createSourceMap(editor, options.filename)
    }
}

/** Collects immutable compilation facts before any source range is changed. */
function analyzeModule(program: Program, filename: string): ModuleModel {
    // These journals are mutable only during this one linear analysis pass; all are exposed as readonly compilation facts.
    const identifierNames = new Set<string>()
    const exportNamesByLocal = new Map<string, string[]>()
    const dependencyBySource = new Map<string, MutableDependency>()
    const functions: OxcFunction[] = []
    const hoistedVariables: HoistedVariable[] = []
    const importBindings = new Set<string>()
    const outerBindings = new Set<string>()
    // ScopeTracker mutates only during this shared analysis walk, then freezes into the immutable model used by edit passes.
    const scopes = new ScopeTracker({ preserveExitedScopes: true })
    // Boundary depth excludes declarations and await expressions owned by nested functions or classes from module analysis.
    let moduleBoundaryDepth = 0
    let hasDirectEval = false
    let hasTopLevelAwait = false

    walk(program, {
        scopeTracker: scopes,
        enter(node, parent) {
            if (node.type === 'Identifier') identifierNames.add(node.name)
            if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval') {
                hasDirectEval = true
            }
            if (isModuleBoundary(node)) moduleBoundaryDepth += 1
            if (node.type === 'AwaitExpression' && moduleBoundaryDepth === 0) hasTopLevelAwait = true
            if (node.type === 'VariableDeclaration' && node.kind === 'var' && moduleBoundaryDepth === 0) {
                const isForIterationBinding =
                    (parent?.type === 'ForInStatement' || parent?.type === 'ForOfStatement') && parent.left === node
                hoistedVariables.push({ declaration: node, isForIterationBinding })
                bindingNamesFromDeclaration(node).forEach((name) => {
                    outerBindings.add(name)
                })
            }
        },
        leave(node) {
            if (isModuleBoundary(node)) moduleBoundaryDepth -= 1
        }
    })

    // Final Rolldown chunks normally expose imports and exports as direct Program children. Declaration exports and
    // re-exports are intentionally not normalized here because accepting them would expand the semantic surface needlessly.
    for (const node of program.body) {
        switch (node.type) {
            case 'ImportDeclaration':
                collectImport(node, dependencyBySource, importBindings, outerBindings, filename)
                break
            case 'ExportNamedDeclaration':
                collectExports(node, exportNamesByLocal, filename)
                break
            case 'ExportDefaultDeclaration':
            case 'ExportAllDeclaration':
                throw unsupported(filename, `source-level ${node.type}`)
            case 'VariableDeclaration':
                requireSupportedVariableKind(node, filename)
                node.declarations
                    .flatMap((declaration) => bindingNames(declaration.id))
                    .forEach((name) => {
                        outerBindings.add(name)
                    })
                break
            case 'FunctionDeclaration': {
                // Anonymous and ambient functions cannot occur as direct declarations in final JavaScript chunks.
                const identifier = node.id as NonNullable<typeof node.id>
                functions.push(node)
                outerBindings.add(identifier.name)
                break
            }
            case 'ClassDeclaration': {
                // Anonymous and ambient classes can occur only in source forms rejected before final chunk rendering.
                const identifier = node.id as NonNullable<typeof node.id>
                outerBindings.add(identifier.name)
                break
            }
        }
    }

    scopes.freeze()
    requireNoDirectEval(hasDirectEval, filename)
    const generatedNames = createGeneratedNames(identifierNames, dependencyBySource.size)
    validateExportBindings(exportNamesByLocal, outerBindings, filename)

    return {
        dependencies: [...dependencyBySource.values()],
        exportNamesByLocal,
        functions,
        generatedNames,
        hasTopLevelAwait,
        hoistedVariables,
        importBindings,
        outerBindings,
        program,
        scopes
    }
}

/** Merges same-source imports because one SystemJS dependency has exactly one setter. */
function collectImport(
    declaration: ImportDeclaration,
    dependencyBySource: Map<string, MutableDependency>,
    importBindings: Set<string>,
    outerBindings: Set<string>,
    filename: string
): void {
    if (declaration.phase || declaration.attributes.length > 0 || declaration.importKind === 'type') {
        throw unsupported(filename, 'import phases, attributes, or type-only imports')
    }

    const source = declaration.source.value
    // This map owns one mutable import list per source while declarations are folded; duplicate imports retain source order.
    const dependency = dependencyBySource.get(source) ?? { source, imports: [] }
    if (!dependencyBySource.has(source)) dependencyBySource.set(source, dependency)

    for (const specifier of declaration.specifiers) {
        importBindings.add(specifier.local.name)
        outerBindings.add(specifier.local.name)
        switch (specifier.type) {
            case 'ImportDefaultSpecifier':
                dependency.imports.push({ imported: 'default', local: specifier.local.name })
                break
            case 'ImportNamespaceSpecifier':
                dependency.imports.push({ imported: null, local: specifier.local.name })
                break
            case 'ImportSpecifier':
                dependency.imports.push({ imported: moduleExportName(specifier.imported), local: specifier.local.name })
                break
        }
    }
}

/** Records every public alias attached to one local binding. */
function collectExports(
    declaration: Extract<Program['body'][number], { type: 'ExportNamedDeclaration' }>,
    exportNamesByLocal: Map<string, string[]>,
    filename: string
): void {
    if (
        declaration.declaration ||
        declaration.source ||
        declaration.attributes.length > 0 ||
        declaration.exportKind === 'type'
    ) {
        throw unsupported(filename, 'declaration exports, re-exports, export attributes, or type-only exports')
    }

    for (const specifier of declaration.specifiers) {
        const local = moduleExportName(specifier.local)
        const exported = moduleExportName(specifier.exported)
        // Aliases are accumulated in declaration order because nested live-binding calls must publish in the same order as Babel.
        const names = exportNamesByLocal.get(local) ?? []
        names.push(exported)
        if (!exportNamesByLocal.has(local)) exportNamesByLocal.set(local, names)
    }
}

/** Rejects exports outside the direct normalized module cells supported by final Rolldown chunks. */
function validateExportBindings(
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>,
    outerBindings: ReadonlySet<string>,
    filename: string
): void {
    for (const local of exportNamesByLocal.keys()) {
        if (!outerBindings.has(local)) {
            throw unsupported(filename, `export of non-module binding ${JSON.stringify(local)}`)
        }
    }
}

/** Applies declaration-level edits whose semantics are known from direct Program children. */
function applyProgramEdits(editor: SourceEditor, model: ModuleModel): void {
    for (const node of model.program.body) {
        switch (node.type) {
            case 'ImportDeclaration':
                editor.remove(node.start, node.end)
                break
            case 'ExportNamedDeclaration':
                editor.overwrite(node.start, node.end, renderImportedExports(node.specifiers, model))
                break
            case 'VariableDeclaration':
                transformTopLevelVariables(editor, node, model.generatedNames.exportBinding, model.exportNamesByLocal)
                break
            case 'ClassDeclaration':
                transformTopLevelClass(editor, node, model.generatedNames.exportBinding, model.exportNamesByLocal)
                break
        }
    }

    const directDeclarations = new Set(
        model.program.body.flatMap((node) => (node.type === 'VariableDeclaration' ? [node] : []))
    )
    model.hoistedVariables
        .filter(({ declaration }) => !directDeclarations.has(declaration))
        .forEach(({ declaration, isForIterationBinding }) => {
            transformNestedHoistedVariables(
                editor,
                declaration,
                isForIterationBinding,
                model.generatedNames.exportBinding,
                model.exportNamesByLocal
            )
        })
}

/** Changes module variables into assignments to declaration-scope cells shared with setters and hoisted functions. */
function transformTopLevelVariables(
    editor: SourceEditor,
    declaration: VariableDeclaration,
    exportBinding: string,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    // ESTree variable declarations always contain at least one declarator.
    const first = declaration.declarations[0] as VariableDeclaration['declarations'][number]

    // `const value = init` becomes `(value = init)`: the declaration cell itself is emitted once in the registration scope.
    editor.overwrite(declaration.start, first.start, '(')
    editor.appendLeft(statementTerminatorStart(editor.original, declaration.end), ')')
    transformVariableInitializers(editor, declaration, exportBinding, exportNamesByLocal)
}

/** Hoists module-scoped var declarations nested in statements without changing their control-flow position. */
function transformNestedHoistedVariables(
    editor: SourceEditor,
    declaration: VariableDeclaration,
    isForIterationBinding: boolean,
    exportBinding: string,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    // ESTree variable declarations always contain at least one declarator.
    const first = declaration.declarations[0] as VariableDeclaration['declarations'][number]

    editor.overwrite(declaration.start, first.start, isForIterationBinding ? '' : '(')
    if (!isForIterationBinding) editor.appendLeft(statementTerminatorStart(editor.original, declaration.end), ')')
    transformVariableInitializers(editor, declaration, exportBinding, exportNamesByLocal)
}

/** Publishes initialized exported cells at the exact initializer evaluation point. */
function transformVariableInitializers(
    editor: SourceEditor,
    declaration: VariableDeclaration,
    exportBinding: string,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    for (const declarator of declaration.declarations) {
        if (!declarator.init) continue
        const exportedBindings = bindingNames(declarator.id).flatMap((name) =>
            (exportNamesByLocal.get(name) ?? []).map((exported) => ({ exported, local: name }))
        )
        if (exportedBindings.length === 0) continue

        if (declarator.id.type === 'Identifier') {
            // Nested calls publish every alias while preserving the initializer's completion value.
            // exportedBindings above proves this identifier owns at least one public alias.
            const names = exportNamesByLocal.get(declarator.id.name) as readonly string[]
            editor.prependLeft(declarator.start, exportExpressionPrefix(exportBinding, names, ''))
            editor.appendRight(declarator.end, exportExpressionSuffix(names))
            continue
        }

        editor.prependLeft(declarator.start, '(')
        editor.appendRight(
            declarator.end,
            `,${exportedBindings.map(({ exported, local }) => exportCall(exportBinding, exported, local)).join(',')})`
        )
    }
}

/** Turns a class declaration into the execute-time assignment required by cyclic SystemJS linking. */
function transformTopLevelClass(
    editor: SourceEditor,
    declaration: Class,
    exportBinding: string,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): void {
    // Anonymous classes can occur only in default exports, which analysis rejects before this pass.
    const identifier = declaration.id as NonNullable<typeof declaration.id>
    const names = exportNamesByLocal.get(identifier.name) ?? []
    editor.prependLeft(declaration.start, exportExpressionPrefix(exportBinding, names, `${identifier.name}=`))
    editor.appendRight(declaration.end, exportExpressionSuffix(names))
}

/** Rewrites expression-level module semantics in one scope-aware O(n) traversal. */
function applyExpressionEdits(editor: SourceEditor, model: ModuleModel, options: TransformSystemJsOptions): void {
    const scopes = model.scopes
    // Function and class depth are mutable traversal cursors used only to identify lexical module `this` and top-level await.
    let thisBoundaryDepth = 0

    walk(model.program, {
        scopeTracker: scopes,
        enter(node) {
            if (isThisBoundary(node)) thisBoundaryDepth += 1

            switch (node.type) {
                case 'IfStatement':
                    // Host adaptations share this traversal so they add neither an all-module source scan nor another AST parse.
                    // A selected assertion is declaration-free by contract; skipping it prevents descendant edits from
                    // overlapping the removed statement range.
                    if (options.removeRefreshPreambleGuard && isRefreshPreambleGuard(node)) {
                        editor.remove(node.start, node.end)
                        this.skip()
                    }
                    break
                case 'ImportExpression':
                    // SystemJS owns dynamic loading; only string literals are canonicalized at build time.
                    if (node.options || node.phase)
                        throw unsupported(options.filename, 'dynamic import options or phases')
                    editor.overwrite(node.start, node.source.start, `${model.generatedNames.context}.import(`)
                    if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
                        editor.overwrite(
                            node.source.start,
                            node.source.end,
                            JSON.stringify(options.resolveReference(node.source.value, 'dynamic'))
                        )
                    }
                    break
                case 'MetaProperty':
                    if (node.meta.name === 'import' && node.property.name === 'meta') {
                        editor.overwrite(node.start, node.end, `${model.generatedNames.context}.meta`)
                    }
                    break
                case 'ThisExpression':
                    // ESM top-level `this` is undefined. Arrow functions inherit it, while normal functions/classes do not.
                    if (thisBoundaryDepth === 0) editor.overwrite(node.start, node.end, 'void 0')
                    break
                case 'AssignmentExpression':
                    transformAssignment(editor, node.left, node.start, node.end, scopes, model, options.filename)
                    break
                case 'UpdateExpression':
                    transformUpdate(editor, node, scopes, model)
                    break
                case 'ForInStatement':
                case 'ForOfStatement':
                    if (node.left.type !== 'VariableDeclaration') {
                        requireNoExportedPattern(node.left, scopes, model.exportNamesByLocal, options.filename)
                    }
                    break
            }
        },
        leave(node) {
            if (isThisBoundary(node)) thisBoundaryDepth -= 1
        }
    })
}

/** Wraps one assignment when its target is an exported root binding. */
function transformAssignment(
    editor: SourceEditor,
    target: AssignmentTarget,
    start: number,
    end: number,
    scopes: ScopeTracker,
    model: ModuleModel,
    filename: string
): void {
    if (target.type === 'Identifier') {
        const names = exportedRootNames(target.name, scopes, model.exportNamesByLocal)
        if (names.length === 0) return
        editor.prependLeft(start, exportExpressionPrefix(model.generatedNames.exportBinding, names, ''))
        editor.appendRight(end, exportExpressionSuffix(names))
        return
    }

    requireNoExportedPattern(target, scopes, model.exportNamesByLocal, filename)
}

/** Preserves prefix and postfix update values while publishing the next live binding. */
function transformUpdate(
    editor: SourceEditor,
    update: Extract<Node, { type: 'UpdateExpression' }>,
    scopes: ScopeTracker,
    model: ModuleModel
): void {
    if (update.argument.type !== 'Identifier') return
    const names = exportedRootNames(update.argument.name, scopes, model.exportNamesByLocal)
    if (names.length === 0) return

    if (update.prefix) {
        editor.prependLeft(update.start, exportExpressionPrefix(model.generatedNames.exportBinding, names, ''))
        editor.appendRight(update.end, exportExpressionSuffix(names))
        return
    }

    // A postfix expression must return the old value, so publish the computed next cell before evaluating the original update.
    const nextValue = `+${update.argument.name}${update.operator[0]}1`
    editor.prependLeft(
        update.start,
        `(${nestedExportExpression(model.generatedNames.exportBinding, names, nextValue)},`
    )
    editor.appendRight(update.end, ')')
}

/** Fails rather than silently changing the completion value of an exported destructuring assignment. */
function requireNoExportedPattern(
    target: AssignmentTarget,
    scopes: ScopeTracker,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>,
    filename: string
): void {
    const exported = assignmentNames(target).filter(
        (name) => exportedRootNames(name, scopes, exportNamesByLocal).length > 0
    )
    if (exported.length > 0) {
        throw unsupported(filename, `destructuring write to exported binding ${JSON.stringify(exported[0])}`)
    }
}

type RegistrationShell = Readonly<{ prefix: string; suffix: string }>

/** Renders the no-map fast path through one source-order edit journal. */
function assembleUnmappedRegistration(
    editor: StringEditor,
    model: ModuleModel,
    options: TransformSystemJsOptions
): string {
    const shell = createRegistrationShell(model, options)
    const hoistedFunctions = model.functions
        .map((declaration) => editor.render(declaration.start, declaration.end))
        .join('')
    model.functions.forEach((declaration) => {
        editor.remove(declaration.start, declaration.end)
    })
    return `${shell.prefix}${editor.render(0, editor.original.length)}}};${hoistedFunctions}${shell.suffix}`
}

/** Places mapped hoisted functions after the declaration return while retaining every original source segment. */
function assembleMappedRegistration(
    editor: RolldownMagicString,
    model: ModuleModel,
    options: TransformSystemJsOptions
): void {
    const shell = createRegistrationShell(model, options)
    // Relocation preserves source-map ownership for large hoisted function bodies when callers explicitly request maps.
    for (const declaration of model.functions) editor.move(declaration.start, declaration.end, editor.original.length)

    editor.prepend(shell.prefix)
    editor.prependLeft(editor.original.length, '}};')
    editor.append(shell.suffix)
}

/** Creates the generated registration boundary shared by mapped and unmapped rendering. */
function createRegistrationShell(model: ModuleModel, options: TransformSystemJsOptions): RegistrationShell {
    const dependencies = model.dependencies.map((dependency) => options.resolveReference(dependency.source, 'static'))
    const setters = model.dependencies.map((dependency, index) => renderSetter(dependency, index, model.generatedNames))
    const earlyExports = renderEarlyExports(model)
    const declarations = model.outerBindings.size > 0 ? `var ${[...model.outerBindings].join(',')};` : ''
    const execute = model.hasTopLevelAwait ? 'async function' : 'function'
    // Imports, hoisted cells, and cyclically visible exports belong to declaration/link time. Original executable statements
    // remain inside execute(), which becomes async only when the module itself owns a top-level await.
    const declarationStart = `function(${model.generatedNames.exportBinding},${model.generatedNames.context}){"use strict";${declarations}${earlyExports}return {setters:[${setters.join(',')}],execute:${execute}(){`

    return options.format === 'system-register'
        ? {
              prefix: `System.register(${JSON.stringify(dependencies)},${declarationStart}`,
              suffix: '})'
          }
        : {
              prefix: `module.exports=[${JSON.stringify(dependencies)},${declarationStart}`,
              suffix: '}]'
          }
}

/** Produces declaration-time exports for functions and uninitialized variables, matching cyclic ESM availability. */
function renderEarlyExports(model: ModuleModel): string {
    const functionNames = new Set(
        model.functions.map((declaration) => (declaration.id as NonNullable<typeof declaration.id>).name)
    )
    const directVariables = model.program.body.flatMap((node) => (node.type === 'VariableDeclaration' ? [node] : []))
    const nestedHoistedVariables = model.hoistedVariables
        .map(({ declaration }) => declaration)
        .filter((declaration) => !directVariables.includes(declaration))
    const variablesInSourceOrder = [...directVariables, ...nestedHoistedVariables].sort(
        (left, right) => left.start - right.start
    )
    const entries: Array<Readonly<{ exported: string; value: string }>> = []

    for (const [local, exportedNames] of model.exportNamesByLocal) {
        if (!functionNames.has(local)) continue
        for (const exported of exportedNames) entries.push({ exported, value: local })
    }
    for (const declaration of variablesInSourceOrder) {
        for (const declarator of declaration.declarations) {
            if (declarator.init) continue
            for (const local of bindingNames(declarator.id)) {
                for (const exported of model.exportNamesByLocal.get(local) ?? []) {
                    entries.push({ exported, value: 'void 0' })
                }
            }
        }
    }

    if (entries.length === 0) return ''
    if (entries.length === 1) {
        const [entry] = entries
        return exportCallWith(model.generatedNames.exportBinding, entry.exported, entry.value)
    }

    const properties = entries.map(({ exported, value }) => `[${JSON.stringify(exported)}]:${value}`).join(',')
    return `${model.generatedNames.exportBinding}({${properties}});`
}

/** Keeps Babel's execute-time publication point for imported locals named by a final export list. */
function renderImportedExports(specifiers: readonly ExportSpecifier[], model: ModuleModel): string {
    return specifiers
        .filter((specifier) => model.importBindings.has(moduleExportName(specifier.local)))
        .map((specifier) => {
            const local = moduleExportName(specifier.local)
            return exportCallWith(model.generatedNames.exportBinding, moduleExportName(specifier.exported), local)
        })
        .join('')
}

/** Creates one dependency setter with the import cells consumed by execute-time code. */
function renderSetter(dependency: MutableDependency, index: number, names: GeneratedNames): string {
    const moduleName = `${names.dependencyPrefix}${index}`
    const statements = dependency.imports.flatMap((binding) => {
        const importedValue = binding.imported === null ? moduleName : memberExpression(moduleName, binding.imported)
        return [`${binding.local}=${importedValue};`]
    })
    return `function(${moduleName}){${statements.join('')}}`
}

/** Selects aliases only when the current traversal reference resolves to the root module declaration. */
function exportedRootNames(
    local: string,
    scopes: ScopeTracker,
    exportNamesByLocal: ReadonlyMap<string, readonly string[]>
): readonly string[] {
    const names = exportNamesByLocal.get(local) ?? []
    if (names.length === 0) return names
    const declaration = scopes.getDeclaration(local)
    return declaration?.scope === '' ? names : []
}

/** Builds the opening calls around an expression that follows directly in the original source. */
function exportExpressionPrefix(exportBinding: string, names: readonly string[], expressionPrefix: string): string {
    if (names.length === 0) return expressionPrefix
    return names.reduce((prefix, exported) => `${exportCallPrefix(exportBinding, exported)}${prefix}`, expressionPrefix)
}

/** Closes nested export calls opened by exportExpressionPrefix. */
function exportExpressionSuffix(names: readonly string[]): string {
    return ')'.repeat(names.length)
}

/** Renders nested export calls around a generated expression. */
function nestedExportExpression(exportBinding: string, names: readonly string[], expression: string): string {
    return names.reduce((value, exported) => `${exportCallPrefix(exportBinding, exported)}${value})`, expression)
}

/** Opens an export notification around an original expression whose source text follows. */
function exportCallPrefix(exportBinding: string, exported: string): string {
    return `${exportBinding}(${JSON.stringify(exported)},`
}

/** Emits an export notification expression without imposing statement boundaries. */
function exportCall(exportBinding: string, exported: string, value: string): string {
    return `${exportBinding}(${JSON.stringify(exported)},${value})`
}

/** Emits a complete export notification statement. */
function exportCallWith(exportBinding: string, exported: string, value: string): string {
    return `${exportBinding}(${JSON.stringify(exported)},${value});`
}

/** Creates collision-free identifiers without requiring Babel's scope allocator. */
function createGeneratedNames(identifierNames: ReadonlySet<string>, dependencyCount: number): GeneratedNames {
    // The used-name set is locally mutable because each selected helper reserves its name for the next helper.
    const used = new Set(identifierNames)
    const take = (base: string): string => {
        // The suffix cursor advances only on an actual source collision and never escapes this allocation call.
        let suffix = 0
        let candidate = base
        while (used.has(candidate)) {
            suffix += 1
            candidate = `${base}${suffix}`
        }
        used.add(candidate)
        return candidate
    }

    const takeDependencyPrefix = (base: string): string => {
        // Prefix selection tests every concrete setter argument because the unsuffixed base may itself be collision-free.
        let suffix = 0
        let candidate = base
        while (
            Array.from({ length: dependencyCount }, (_, index) => `${candidate}${index}`).some((name) => used.has(name))
        ) {
            suffix += 1
            candidate = `${base}${suffix}`
        }
        Array.from({ length: dependencyCount }, (_, index) => `${candidate}${index}`).forEach((name) => {
            used.add(name)
        })
        return candidate
    }

    return {
        context: take('__systemContext'),
        exportBinding: take('__systemExport'),
        dependencyPrefix: takeDependencyPrefix('__systemDependency')
    }
}

/** Normalizes identifier and quoted module names to the runtime property string. */
function moduleExportName(name: ModuleExportName): string {
    return name.type === 'Literal' ? String(name.value) : name.name
}

/** Uses dot access only when the imported name is a valid identifier. */
function memberExpression(object: string, property: string): string {
    return /^[$A-Z_a-z][$\w]*$/.test(property) ? `${object}.${property}` : `${object}[${JSON.stringify(property)}]`
}

function bindingNamesFromDeclaration(declaration: VariableDeclaration): string[] {
    return declaration.declarations.flatMap((declarator) => bindingNames(declarator.id))
}

function bindingNames(pattern: BindingPattern): string[] {
    return patternNames(pattern)
}

function assignmentNames(pattern: AssignmentTarget): string[] {
    return patternNames(pattern)
}

/** Extracts identifiers from binding and assignment patterns without treating computed keys as targets. */
function patternNames(pattern: Node): string[] {
    switch (pattern.type) {
        case 'Identifier':
            return [pattern.name]
        case 'AssignmentPattern':
            return patternNames(pattern.left)
        case 'ArrayPattern':
            return pattern.elements.flatMap((element) => (element ? patternNames(element) : []))
        case 'ObjectPattern':
            return pattern.properties.flatMap((property) =>
                property.type === 'Property' ? patternNames(property.value) : patternNames(property.argument)
            )
        case 'RestElement':
            return patternNames(pattern.argument)
        default:
            return []
    }
}

function isFunction(node: Node): node is OxcFunction | Extract<Node, { type: 'ArrowFunctionExpression' }> {
    return (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'TSEmptyBodyFunctionExpression'
    )
}

function isModuleBoundary(node: Node): boolean {
    return isFunction(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression'
}

function isThisBoundary(node: Node): boolean {
    return (
        (isFunction(node) && node.type !== 'ArrowFunctionExpression') ||
        node.type === 'ClassDeclaration' ||
        node.type === 'ClassExpression'
    )
}

/** Babel rejects direct eval for SystemJS because renaming declaration cells cannot update evaluated source. */
function requireNoDirectEval(hasDirectEval: boolean, filename: string): void {
    if (hasDirectEval) throw unsupported(filename, 'direct eval')
}

function requireSupportedVariableKind(declaration: VariableDeclaration, filename: string): void {
    if (declaration.kind === 'using' || declaration.kind === 'await using' || declaration.declare) {
        throw unsupported(filename, 'using or ambient variable declaration')
    }
}

/** Places a closing edit before an optional semicolon owned by the declaration node. */
function statementTerminatorStart(code: string, end: number): number {
    return code[end - 1] === ';' ? end - 1 : end
}

/** Makes a future Rolldown grammar change fail closed with the affected chunk named. */
function unsupported(filename: string, construct: string): Error {
    return new Error(`Unsupported final Rolldown chunk ${filename}: ${construct}`)
}

/** Produces a Vite-compatible raw map that retains the complete pre-transform chunk as source content. */
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
