import type { Node, Program } from '@oxc-project/types'
import { type Identifier, isReferenceIdentifier, ScopeTracker, ScopeTrackerFunctionArguments, walk } from 'oxc-walker'
import type { RolldownMagicString } from 'rolldown'

/**
 * Rewrites static free bindings in lowered JavaScript modules ONLY for targets without native globalThis. Import miniGlobal
 * under the returned alias before other dependencies; null means no edits. Target gating, import insertion and source maps
 * belong to the caller. Apply once to original code: generated native references must stay native. No host-name whitelist;
 * lexical bindings and module interfaces stay unchanged. Dynamic eval/with are outside this contract.
 *
 * Reads, typeof, calls and updates use direct conditional expressions. Assignment targets select their base before the RHS;
 * cached native-only accessors keep that RHS single, including destructuring, await and yield. Selected namespace properties
 * retain ordinary property semantics, even if deleted during the RHS. No shared runtime binding helper or value snapshots.
 * Hoisted module-local initializers allocate native holders once per name/module on first use; reads and updates allocate nothing.
 * Analysis is expected O(N) time/space. Emits O(N) edits; generated text scales with reference/name lengths, never duplicated
 * RHS trees. Assignment caches use O(U) holders for U natively written names; generated reads have one membership check.
 */
export function rewriteGlobal(program: Program, editor: RolldownMagicString): string | null {
    const scopes = new SourceScopes()
    // Reserve all original names, including nested locals, before allocating identifiers that must never be shadowed.
    const names = new Set<string>()
    // A new leading '(' must not join the preceding statement.
    const statementStarts = new Set<number>()
    // Collect statement/field ends, then consume each boundary at most once to keep nested suffixes before one terminator.
    const terminatorEnds = new Set<number>()
    // Only assignment-pattern leaves need native accessor targets; computed keys, defaults and member receivers are reads.
    const writes = new Set<Identifier>()
    walk(program, {
        scopeTracker: scopes,
        enter(node, parent) {
            if (node.type === 'Identifier') {
                names.add(node.name)
            } else if (
                node.type === 'ExpressionStatement' &&
                (parent?.type === 'Program' ||
                    parent?.type === 'BlockStatement' ||
                    parent?.type === 'StaticBlock' ||
                    parent?.type === 'SwitchCase')
            ) {
                statementStarts.add(node.start)
            } else if (
                node.type === 'AssignmentExpression' ||
                node.type === 'ForInStatement' ||
                node.type === 'ForOfStatement'
            ) {
                collectWriteTargets(node.left, writes)
            }
            if (
                node.type === 'ExpressionStatement' ||
                node.type === 'ReturnStatement' ||
                node.type === 'ThrowStatement' ||
                node.type === 'ExportDefaultDeclaration' ||
                node.type === 'PropertyDefinition' ||
                (node.type === 'VariableDeclaration' &&
                    !(parent?.type === 'ForStatement' && parent.init === node) &&
                    !((parent?.type === 'ForInStatement' || parent?.type === 'ForOfStatement') && parent.left === node))
            ) {
                terminatorEnds.add(node.end)
            }
        }
    })
    scopes.freeze()

    // One monotonic allocator bounds all collision checks together by the number of occupied names.
    let nextName = 0
    const takeName = () => {
        // Advance locally until this invocation owns an unused identifier.
        let name: string
        do {
            name = `__miniGlobal${nextName++}`
        } while (names.has(name))
        names.add(name)
        return name
    }
    const global = takeName()
    const value = takeName()
    const select = (name: string, managed: string, native: string) =>
        `(${JSON.stringify(name)} in ${global} ? ${managed} : ${native})`
    const read = (name: string) => select(name, `${global}.${name}`, name)
    // Keep each native assignment adapter private to this module, shared by all assignment sites for that name.
    const targets = new Map<string, { cache: string; expression: string; declaration: string }>()
    const nativeTarget = (name: string) => {
        const existing = targets.get(name)
        if (existing) {
            return existing.expression
        }
        const cache = takeName()
        const initialize = takeName()
        // A free name has no module binding either. Hoisted initializers keep cached accessors outside caller scopes,
        // where even unrelated captured locals could otherwise stay alive for the module's lifetime.
        // Strict modules cannot assign to eval/arguments, so accessor methods cannot shadow the native target name.
        // Prototype accessors give engines a stable holder to optimize; own dynamic accessors were much slower in Node.
        // The __proto__ literal sets the prototype directly, without consulting patchable Object helpers or setters.
        const expression = `(${cache} || ${initialize}())`
        const declaration = `function ${initialize}() { return ${cache} = { __proto__: { get ${name}() { return ${name}; }, set ${name}(${value}) { ${name} = ${value}; } } }; }`
        targets.set(name, { cache, expression, declaration })
        return expression
    }
    // Delay name-inference wrappers until reference overwrites are complete, so nested edits retain their closing suffixes.
    const initializers: { node: Node; name: string }[] = []
    // Transparent parentheses and shorthand defaults need context beyond the immediate parent.
    const contexts = new WeakMap<Node, Node>()
    // Matching a boundary means the edited expression has no original semicolon. Append the terminator so later
    // name-inference suffixes can prepend before it; consuming the boundary avoids a stray second ';' before an else.
    const terminate = (end: number) => {
        if (terminatorEnds.delete(end)) {
            editor.appendRight(end, ';')
        }
    }
    // The caller needs an import only when at least one reference was actually rewritten.
    let changed = false
    const overwrite = (range: Node, replacement: string) => {
        changed = true
        if (statementStarts.has(range.start)) {
            editor.prependLeft(range.start, ';')
        }
        terminate(range.end)
        editor.overwrite(range.start, range.end, replacement)
    }
    walk(program, {
        scopeTracker: scopes,
        enter(node, parent) {
            if (node.type === 'Identifier') {
                if (
                    scopes.hasBinding(node.name) ||
                    parent?.type === 'ExportSpecifier' ||
                    !isReferenceIdentifier(node, parent)
                ) {
                    return
                }
                const context = contexts.get(node) ?? (parent?.type === 'Property' ? parent : null)
                const name = node.name
                const member = `${global}.${name}`
                // Select the syntax operation, not a runtime interpreter: native reads/typeof/updates remain native.
                const range =
                    context?.type === 'UnaryExpression' || context?.type === 'UpdateExpression' ? context : node
                const replacement =
                    context?.type === 'UnaryExpression'
                        ? select(name, `typeof ${member}`, `typeof ${name}`)
                        : context?.type === 'UpdateExpression'
                          ? context.prefix
                              ? select(name, `${context.operator}${member}`, `${context.operator}${name}`)
                              : select(name, `${member}${context.operator}`, `${name}${context.operator}`)
                          : writes.has(node)
                            ? `${select(name, global, nativeTarget(name))}.${name}`
                            : read(name)
                // Computed literal keys keep shorthand data-property semantics, including for __proto__.
                overwrite(
                    range,
                    context?.type === 'Property' && context.shorthand
                        ? `[${JSON.stringify(name)}]: ${replacement}`
                        : replacement
                )
                return
            }
            if (node.type === 'SwitchCase' && parent?.type === 'SwitchStatement' && parent.cases[0] === node) {
                scopes.updateActiveBindings(1)
            }
            if ((node.type === 'UnaryExpression' && node.operator === 'typeof') || node.type === 'UpdateExpression') {
                contexts.set(node.argument, node)
            } else if (node.type === 'ParenthesizedExpression') {
                const context = contexts.get(node)
                if (context) {
                    contexts.set(node.expression, context)
                }
            } else if (node.type === 'Property' && node.shorthand && node.value.type === 'AssignmentPattern') {
                contexts.set(node.value.left, node)
            }
            if (
                (node.type === 'AssignmentPattern' ||
                    (node.type === 'AssignmentExpression' &&
                        (node.operator === '=' ||
                            node.operator === '&&=' ||
                            node.operator === '||=' ||
                            node.operator === '??='))) &&
                node.left.type === 'Identifier' &&
                !scopes.hasBinding(node.left.name)
            ) {
                initializers.push({ node: node.right, name: node.left.name })
            }
        }
    })
    for (const { node, name } of initializers) {
        if (preserveInferredName(node, name, editor)) {
            terminate(node.end)
        }
    }
    if (targets.size > 0) {
        // Both functions and uninitialized vars work during cyclic ESM calls before evaluation; nothing resets an early adapter.
        const declarations = Array.from(targets.values(), (target) => target.declaration).join('\n')
        editor.append(`\n${declarations}\nvar ${Array.from(targets.values(), (target) => target.cache).join(', ')};\n`)
    }
    return changed ? global : null
}

/** Computed keys, defaults and member receivers are reads, not assignment-target identifiers. */
function collectWriteTargets(node: Node, targets: Set<Identifier>): void {
    switch (node.type) {
        case 'Identifier':
            targets.add(node)
            break
        case 'AssignmentPattern':
            collectWriteTargets(node.left, targets)
            break
        case 'RestElement':
            collectWriteTargets(node.argument, targets)
            break
        case 'ArrayPattern':
            for (const element of node.elements) {
                if (element) {
                    collectWriteTargets(element, targets)
                }
            }
            break
        case 'ObjectPattern':
            for (const property of node.properties) {
                collectWriteTargets(property.type === 'Property' ? property.value : property.argument, targets)
            }
            break
    }
}

/** Preserve anonymous name inference without introducing a named-expression self-binding or special __proto__ semantics. */
function preserveInferredName(value: Node, name: string, editor: RolldownMagicString): boolean {
    // Peel only this RHS's transparent wrappers; these scans do not descend into nested RHS expressions.
    let expression = value
    while (expression.type === 'ParenthesizedExpression') {
        expression = expression.expression
    }
    if (
        expression.type === 'ArrowFunctionExpression' ||
        ((expression.type === 'FunctionExpression' || expression.type === 'ClassExpression') && !expression.id)
    ) {
        const key = JSON.stringify(name)
        editor.prependLeft(value.start, `({[${key}]: `)
        editor.prependRight(value.end, `})[${key}]`)
        return true
    }
    return false
}

/** Reuses Oxc's declaration rules, not its hierarchical scope keys or ancestor-search queries. */
class SourceScopes extends ScopeTracker {
    // Replay flat IDs in the same order after freeze; key length no longer grows with nesting depth.
    private nextScope = 0
    // Cache the nearest var environment, including distinct function bodies and static blocks.
    private readonly varScopes: string[] = []
    // Counts restore shadowed names on exit and make reference lookup independent of scope depth.
    private readonly activeBindings = new Map<string, number>()

    override freeze(): void {
        super.freeze()
        this.nextScope = 0
    }

    protected override pushScope(owner: Node): void {
        const parent = this.scopeOwnerStack[this.scopeOwnerStack.length - 1]
        const outerVarScope = this.varScopes[this.varScopes.length - 1]
        this.scopeKeyStack.push(this.scopeIndexKey)
        this.scopeOwnerStack.push(owner)
        this.scopeIndexKey = String(this.nextScope++)
        const ownsVars =
            owner.type === 'Program' ||
            owner.type === 'StaticBlock' ||
            (owner.type === 'BlockStatement' &&
                (parent?.type === 'FunctionDeclaration' ||
                    parent?.type === 'FunctionExpression' ||
                    parent?.type === 'ArrowFunctionExpression') &&
                parent.body === owner)
        this.varScopes.push(ownsVars ? this.scopeIndexKey : outerVarScope)
        if (!this.isFrozen) {
            // Implicit arguments is a language binding in ordinary functions, not a predefined host global.
            if (owner.type === 'FunctionDeclaration' || owner.type === 'FunctionExpression') {
                this.declareIdentifier('arguments', new ScopeTrackerFunctionArguments(owner, this.scopeIndexKey))
            }
        } else if (owner.type !== 'SwitchStatement') {
            this.updateActiveBindings(1)
        }
    }

    protected override popScope(): void {
        if (this.isFrozen) {
            // Empty switches never activate, but have no case bindings to remove either.
            this.updateActiveBindings(-1)
        }
        this.varScopes.pop()
        this.scopeOwnerStack.pop()
        this.scopeIndexKey = this.scopeKeyStack[this.scopeKeyStack.length - 1]
        this.scopeKeyStack.pop()
    }

    protected override getVarScopeKey(): string {
        return this.varScopes[this.varScopes.length - 1]
    }

    updateActiveBindings(change: 1 | -1): void {
        for (const name of this.scopes.get(this.scopeIndexKey)?.keys() ?? []) {
            const count = (this.activeBindings.get(name) ?? 0) + change
            if (count === 0) {
                this.activeBindings.delete(name)
            } else {
                this.activeBindings.set(name, count)
            }
        }
    }

    hasBinding(name: string): boolean {
        return this.activeBindings.has(name)
    }
}
