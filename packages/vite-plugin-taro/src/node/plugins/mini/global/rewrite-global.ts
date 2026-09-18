import type { Node, Program } from '@oxc-project/types'
import { type Identifier, isReferenceIdentifier, ScopeTracker, ScopeTrackerFunctionArguments, walk } from 'oxc-walker'
import type { RolldownMagicString } from 'rolldown'

/**
 * Rewrites static free bindings in lowered JavaScript modules ONLY for targets without native globalThis. When references
 * change, imports miniGlobal from miniGlobalId under a private alias before other dependencies, preserving the hashbang and
 * directive prologue. Returns whether edits were made. Target gating, excluding the runtime module itself and source maps
 * belong to the caller. Apply once to original code: generated native references must stay native. No host-name whitelist;
 * lexical bindings and module interfaces stay unchanged. Dynamic eval/with are outside this contract.
 *
 * Comment notation (substitutions, NOT emitted runtime helpers):
 * - G is the hygienic miniGlobal import alias; V is a hygienic setter parameter.
 * - R(slot) means ("slot" in G ? G.slot : slot), a live read of the selected binding.
 * - C and init are the module-private cache and initializer for one written name.
 * - T(slot) means ("slot" in G ? G : (C || init())).slot, an assignable property reference.
 * Examples use slot as an arbitrary free identifier; locally declared slot is never rewritten. Snippets show the relevant
 * edit, not complete modules: other free operands undergo the same read rules. ASI/import/footer boilerplate is omitted
 * except where it is the topic; R/T notation expands textually, with a distinct C/init pair for each written name.
 *
 * Performance model shared by the individual transforms below:
 * - N = AST nodes, D = maximum nesting depth, U = distinct free assignment-target names, E = generated text characters.
 *   L in a local analysis is the length of that emitted fragment, including original and generated identifier spellings.
 * - Build time: one AST walk records declarations, scope boundaries and identifier contexts; a linear scan of those
 *   records resolves references without revisiting AST children. Together with bounded pattern/parenthesis scans this
 *   does expected O(N) structural work with O(N) records and O(D) traversal stacks. Map/Set operations are assumed
 *   amortized O(1); hashing, escaping and constructing strings additionally depend on their lengths. There are O(N)
 *   editor operations and O(E) generated text, not duplicated RHS trees. These are algorithmic costs here, not a bound
 *   on Rolldown's internal editing or caller-owned map generation.
 * - Runtime time: O(1) routing below assumes ordinary property/binding lookup and bounded prototype depth. The `in`
 *   operator can traverse a prototype chain; patched prototypes/proxies/getters/setters can add arbitrary work. Original
 *   operand evaluation, function bodies, coercions, BigInt arithmetic and iterator work are not counted as routing overhead.
 * - Runtime space: reads, typeof and updates add no holders or closures. Assignments add O(U) module-lifetime bindings
 *   and initializers; adapter holders are allocated lazily per natively selected name, not per assignment. Inference
 *   wrappers add one transient object per evaluated anonymous RHS. "No allocation" below refers to the routing syntax,
 *   not allocations in application code.
 * - Leak analysis: analysis tables are invocation-local; AST references become collectible when this call ends and other
 *   owners release the AST. The caller's editor intentionally retains source/edits. Generated code registers no callbacks,
 *   listeners or timers. Adapter caches intentionally live with their module, so repeated writes do not grow retained state;
 *   host module caches/HMR policy and values deliberately stored in globals remain outside this function's ownership.
 */
export function rewriteGlobal(program: Program, editor: RolldownMagicString, miniGlobalId: string): boolean {
    const scopes = new SourceScopes()
    // Advance only over top-level directives during the existing walk; do not traverse the program body a second time.
    let importOffset = program.hashbang?.end ?? 0
    // One AST traversal collects declarations and reference contexts before resolving any use, preserving hoisting and
    // TDZ. Resolution scans only recorded scope boundaries and identifiers, not the AST's children or other expressions.
    // Time/space: O(N) structural work and invocation-local records; nothing is global.
    // Reserve all original names, including nested locals, before allocating identifiers that must never be shadowed.
    const names = new Set<string>()
    // A new leading '(' must not join the preceding statement.
    const statementStarts = new Set<number>()
    // Collect statement/field ends, then consume each boundary at most once to keep nested suffixes before one terminator.
    const terminatorEnds = new Set<number>()
    // Only assignment-pattern leaves need native accessor targets; computed keys, defaults and member receivers are reads.
    const writes = new Set<Identifier>()
    // Carry transparent-parenthesis/shorthand ownership to identifiers during the single AST traversal.
    const contexts = new WeakMap<Node, Node>()
    walk(program, {
        scopeTracker: scopes,
        enter(node, parent) {
            if (node.type === 'Identifier') {
                names.add(node.name)
                scopes.recordIdentifier(
                    node,
                    parent,
                    contexts.get(node) ?? (parent?.type === 'Property' ? parent : null)
                )
                return
            }
            if (
                node.type === 'ExpressionStatement' &&
                (parent?.type === 'Program' ||
                    parent?.type === 'BlockStatement' ||
                    parent?.type === 'StaticBlock' ||
                    parent?.type === 'SwitchCase')
            ) {
                statementStarts.add(node.start)
                if (parent?.type === 'Program' && typeof node.directive === 'string') {
                    importOffset = node.end
                }
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
            /*
             * Switch-scope boundary (classification, not an extra runtime wrapper):
             *   Before: switch (slot) { case slot: let slot; }
             *   After:  switch (R(slot)) { case slot: let slot; }
             * Record activation after the discriminant, at the first case. Nested scopes within the discriminant finish
             * before this event, so the completed case bindings cannot capture discriminant references during resolution.
             * Time: O(1) recording, O(B) resolution per boundary for B bindings. Space: O(1) record, no runtime storage.
             */
            if (node.type === 'SwitchCase' && parent?.type === 'SwitchStatement' && parent.cases[0] === node) {
                scopes.enterCases()
            }
            /*
             * Transparent-parenthesis/context propagation:
             *   Before: typeof ((slot)) / ((slot))++ / ({ slot = fallback } = source)
             *   After:  ("slot" in G ? typeof G.slot : typeof slot) / ("slot" in G ? G.slot++ : slot++)
             *           / ({ ["slot"]: T(slot) = R(fallback) } = R(source))
             * Carry the owning typeof/update through parentheses to replace the WHOLE operation. Carry shorthand
             * ownership through AssignmentPattern to expand its key, not just its identifier. For an ordinary read,
             * ((slot)) instead becomes ((R(slot))); parentheses need no independent edit or runtime helper.
             * Time: expected O(1) WeakMap work per visited wrapper/owner, O(P) for a chain of P parentheses.
             * Space: O(N) maximum context entries for this call, zero runtime objects beyond the selected transform.
             * Leak: weak keys do not establish AST roots; this entire analysis map is discarded on return.
             */
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
        }
    })

    /*
     * Hygienic generated identifiers (original identifiers are not renamed):
     *   Before: function run(__miniGlobal0) { return slot }
     *   After:  function run(__miniGlobal0) { return ("slot" in __miniGlobal1 ? __miniGlobal1.slot : slot) }
     * Reserving identifiers in ALL scopes prevents an import, cache, initializer or setter parameter from being captured
     * by an inner local. The example's __miniGlobal1 is G; its import is emitted below only if an edit was made.
     * Time: one monotonic counter skips each occupied candidate at most once, so total candidate checks are O(N + U),
     * not a restart-and-rescan for each generated name. Formatting/hashing each candidate also costs its string length.
     * Space: O(N + U) reserved names, plus their characters, for this call only. Runtime adds O(U) helper bindings.
     * Leak: the allocator and Set never escape; generated identifiers do not themselves retain application objects.
     */
    // Mutable only within this invocation; a shared counter makes collision checks amortized across every allocation.
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
    /*
     * Live free reads:
     *   Before: slot
     *   After:  ("slot" in G ? G.slot : slot)
     * Membership, not truthiness, selects the namespace: 0/false/''/null/undefined are valid managed values. `in` also
     * intentionally observes inherited properties. Only the selected branch executes, so managed bindings need not
     * exist natively. The bare fallback still resolves host lexical bindings, throws for missing reads/TDZ and invokes
     * native getters; no snapshot or eager probe hides later host/namespace changes. JSON.stringify quotes the decoded
     * identifier as a string key, while dot access uses its identifier spelling, including Unicode identifiers.
     * Time: O(L) emitted text; runtime adds one membership test and one selected read, O(1) under the model above.
     * Space: O(L) editor text, O(1) runtime temporaries; no runtime wrapper objects/functions.
     * Leak: the selected value is passed to the original consumer, never saved in a new cache by this transform.
     *
     * Bare calls, optional calls and tagged templates use the SAME read expression:
     *   Before: slot(args)       / slot?.(args)       / slot`text`
     *   After:  R(slot)(args)    / R(slot)?.(args)    / R(slot)`text`
     * A conditional produces a value, not a property Reference, so G does not accidentally become the call's `this`.
     * Strict callees still see undefined; sloppy callees retain their own ordinary `this` conversion. Optional calls
     * skip arguments only for null/undefined; a missing native identifier still throws before optional-call handling.
     * Tags retain template identity and expression order. Direct eval semantics are outside the documented contract.
     * Time: O(L) text and O(1) routing per call/tag; argument evaluation and the invocation are unchanged.
     * Space: O(L) text and O(1) routing temporaries; no extra call wrapper/argument array/template cache is introduced.
     * Leak: no generated closure captures arguments or results, and no per-call state survives this expression.
     *
     * Constructors also reuse the read without wrapping the constructor function:
     *   Before: new slot(args)   / new (slot)(...args)
     *   After:  new R(slot)(args) / new (R(slot))(...args)
     * The selected function is constructed directly, preserving prototype and new.target identity; spread stays native.
     * Time: O(L) text, O(1) selection overhead plus original construction/spread work.
     * Space: O(L) text, O(1) routing space; only the original constructor allocates the instance.
     * Leak: no constructor/instance cache or forwarding closure is added.
     *
     * Member receivers, computed keys and other unary operators rewrite only their free operand reads:
     *   Before: slot.method() / slot[key] / ++slot.value / delete slot.value / typeof slot.value / !slot
     *   After:  R(slot).method() / R(slot)[R(key)] / ++R(slot).value / delete R(slot).value
     *           / typeof R(slot).value / !R(slot)
     * Member calls retain the selected object's receiver. Member updates/deletes keep normal property behavior. Unary
     * +, -, !, ~ and void are not special-cased. In typeof slot.value, reading a missing slot must still throw; only
     * typeof of a bare identifier gets the special non-throwing fallback documented at its branch below.
     * Time: O(L) text and O(1) routing per rewritten operand, in the original evaluation order.
     * Space: O(L) text and O(1) extra runtime space per operand; existing property operations are not replaced by helpers.
     * Leak: no receiver/key/value is retained beyond the original expression's lifetime.
     */
    const select = (name: string, managed: string, native: string) =>
        `(${JSON.stringify(name)} in ${global} ? ${managed} : ${native})`
    const read = (name: string) => select(name, `${global}.${name}`, name)
    /*
     * Native assignment adapter, shared by the assignment forms documented below:
     *   Before: a native assignment Reference to slot
     *   After:  (C || init()).slot, with this module-level declaration:
     *     function init() {
     *         return C = { __proto__: {
     *             get slot() { return slot; },
     *             set slot(V) { slot = V; }
     *         } };
     *     }
     *     var C;
     * A conditional read is not a legal assignment target. Instead select an object base, then form a property Reference.
     * On the managed path that base is G; on the native path the adapter translates property get/set back into bare
     * native binding operations. A plain write calls only the setter, so it never prematurely invokes a native getter.
     * Compound/logical writes call the getter and, if needed, the setter without rechecking namespace membership.
     * Missing names, host lexical const/TDZ errors and host accessors are handled by those native operations, not by
     * reflection or a host-name whitelist. eval/arguments cannot be strict-module assignment identifiers here.
     * The literal __proto__ sets the holder prototype without calling patchable Object/Reflect helpers or the legacy
     * __proto__ setter. Accessor declarations named __proto__ or constructor remain ordinary accessor definitions.
     * Time: first build encounter uses expected O(1) map bookkeeping, name allocation under the total bound above and
     * O(L) declaration text; subsequent sites reuse that text. First native selection allocates a constant-size adapter;
     * later selections cost one truthy cache check. Each forwarded get/set adds one accessor call to the original operation.
     * Space: O(U) build records plus declaration text; runtime lazily adds a holder, its prototype and two accessor
     * functions per natively selected name. The hoisted initializer/cache binding exists even if that path is unused.
     * Leak: C stores the holder, NOT the latest assigned value; the setter forwards V without saving it. Initializers
     * live at module scope so accessors cannot capture an assignment caller's unrelated locals/closures. Repeated writes
     * reuse a bounded cache; module-level state remains reachable with the module, not with the number of writes.
     */
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
    /*
     * Trailing ASI repair (the \n below denotes an original line break):
     *   Before: slot++\n[1].forEach(visit)
     *   After:  ;("slot" in G ? G.slot++ : slot++);\n[1].forEach(R(visit))
     * Without the inserted ';', the newly trailing ')' would allow [1] to attach to the preceding expression. The same
     * repair protects inferred-name wrappers before arrays, calls and templates, plus rewritten expression endings in
     * return, throw, export default, variable initializers and class fields before computed members.
     * Only recorded statement/field boundaries qualify; loop-header declarations must not gain extra separators.
     * A matching expression end means there was no explicit semicolon after that expression in its owning boundary.
     * Time: expected O(1) boundary deletion and one editor insertion; each boundary is consumed at most once.
     * Space: one output character per repaired boundary and O(N) temporary boundary entries; zero runtime storage.
     * Leak: punctuation creates no retained state. Consuming the boundary also avoids a second ';' before `else`.
     */
    // Append the terminator so later inference suffixes can prepend before it, even for nested RHSs sharing one end.
    const terminate = (end: number) => {
        if (terminatorEnds.delete(end)) {
            editor.appendRight(end, ';')
        }
    }
    // Mutable per invocation: inject an import and report a change only when a reference was actually rewritten.
    let changed = false
    /*
     * Leading ASI repair:
     *   Before: visit()\nslot()
     *   After:  ;R(visit)()\n;R(slot)()
     * A leading '(' can otherwise continue the preceding call, declaration initializer or other expression. Prefix ';'
     * only at expression statements in statement lists (program/block/static block/switch case). Never insert an empty
     * statement as an unbraced if/loop/label body: it would detach the original body or make an `else` invalid.
     * Time: expected O(1) start/end lookups plus the editor operations and replacement text cost.
     * Space: at most one leading and one trailing semicolon per overwrite, no runtime objects.
     * Leak: edits stay with the caller-owned editor; this function does not retain it after returning.
     */
    const overwrite = (range: Node, replacement: string) => {
        changed = true
        terminate(range.end)
        editor.overwrite(range.start, range.end, statementStarts.has(range.start) ? `;${replacement}` : replacement)
    }
    scopes.visitFreeReferences(({ node, parent, context }) => {
        const name = node.name
        const member = `${global}.${name}`
        /*
         * Bare typeof (including parenthesized operands):
         *   Before: typeof slot / typeof ((slot))
         *   After:  ("slot" in G ? typeof G.slot : typeof slot)
         * Replacing only slot would evaluate an ordinary read before typeof, incorrectly throwing for an
         * unresolved native name. Replace the whole operation instead: typeof missing remains 'undefined',
         * while native lexical TDZ/getter failures still throw and managed present-undefined stays managed.
         * Time: O(L) generated text and O(1) membership/typeof routing; only one branch executes.
         * Space: O(L) text and O(1) runtime temporaries, with no adapter or closure.
         * Leak: neither the operand nor typeof result is stored by generated code.
         *
         * Prefix increment/decrement:
         *   Before: ++slot / --slot
         *   After:  ("slot" in G ? ++G.slot : ++slot) / ("slot" in G ? --G.slot : --slot)
         * Postfix increment/decrement:
         *   Before: slot++ / slot--
         *   After:  ("slot" in G ? G.slot++ : slot++) / ("slot" in G ? G.slot-- : slot--)
         * In both cases replacing the complete operation leaves ToNumeric, BigInt behavior, get/coerce/set
         * order and strict native write failures to JavaScript. Prefix returns the new value; postfix returns
         * the old numeric value, not an uncoerced read. A read conditional alone cannot be incremented.
         * Time (each form): O(L) text; one membership check plus the original update, O(1) routing overhead.
         * Space (each form): O(L) text and O(1) routing space; no cached holder/accessor is needed.
         * Leak (each form): no value cache/captured scope; original binding retention is unchanged.
         */
        // Select the syntax operation, not a runtime interpreter: native reads/typeof/updates remain native.
        const range = context?.type === 'UnaryExpression' || context?.type === 'UpdateExpression' ? context : node
        /*
         * Simple assignment:
         *   Before: slot = rhs
         *   After:  ("slot" in G ? G : (C || init())).slot = rhs
         * Select the base before evaluating rhs, then keep that Reference through the write. If rhs adds an
         * override, a native-selected write still goes native; if rhs deletes a managed property, writing to
         * the already selected G property recreates it (ordinary property semantics, not global-environment
         * binding semantics). Readonly/accessor descriptor changes during rhs remain observable at the set.
         * Time: O(L) target text and O(1) selection/set overhead, plus the original rhs once.
         * Space: O(L) text, O(1) live Reference, and the shared O(1)-per-name adapter on first native use.
         * Leak: rhs is not cached/captured; only the chosen destination intentionally retains its assigned value.
         *
         * Arithmetic/bitwise compound assignments:
         *   Before: slot op= rhs
         *   After:  T(slot) op= rhs
         * op= covers +=, -=, *=, /=, %=, **=, <<=, >>=, >>>=, &=, |= and ^=.
         * The engine reads once, evaluates rhs once, applies the original operator/coercion, then writes once
         * to the same Reference. Even a native getter that installs a namespace override cannot reroute the set.
         * Time: O(L) target text; O(1) selection and forwarding overhead, excluding original arithmetic/rhs.
         * Space: O(L) text; O(1) live target/old-value slots plus the shared adapter, not an rhs-sized copy.
         * Leak: no old/new value history is kept; completion releases temporaries under normal engine lifetime.
         *
         * Logical assignments:
         *   Before: slot &&= rhs / slot ||= rhs / slot ??= rhs
         *   After:  T(slot) &&= rhs / T(slot) ||= rhs / T(slot) ??= rhs
         * Keeping the operator preserves its truthy/falsy/nullish test and expression result. The selected
         * target is read once, but rhs and the setter execute only if needed; there is no eager value argument.
         * Time: O(L) text and O(1) routing, including a possible adapter initialization even on a skipped write.
         * Space: O(L) text, O(1) runtime temporaries/shared per-name adapter; skipped rhs allocates nothing extra.
         * Leak: skipped/evaluated rhs values are never retained by routing code; the adapter stores no values.
         *
         * Await/yield and nested assignments use the same target replacement, not an IIFE/callback:
         *   Before: slot += await rhs / slot = yield value / slot += (other += rhs)
         *   After:  T(slot) += await rhs / T(slot) = yield value / T(slot) += (T(other) += rhs)
         * The engine keeps each selected target (and compound old value) across suspension. Concurrent writes
         * share a stateless native adapter, not pending values. this/super/arguments and control flow remain in
         * the original async/generator scope. Conditionalizing the WHOLE assignment would duplicate rhs text;
         * recursively doing so can grow output exponentially, whereas each target here is emitted only once.
         * Time: O(L) per target; nested output grows with targets/name lengths, not copies of rhs subtrees.
         * Runtime adds O(1) routing per reached target; suspension/resumption timing is the application's.
         * Space: O(1) extra live target per in-flight operation plus shared adapters; no new Promise/generator.
         * Leak: suspended frames can retain selected targets until completed/released, as normal References do;
         * the transform introduces no pending-operation registry or callback holding those frames alive.
         * Destructuring and loop target forms use this same branch; their cases are detailed below.
         */
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
        /*
         * Shorthand object reads and assignment-pattern leaves/defaults:
         *   Before: ({ slot }) / ({ slot } = source) / ({ slot = fallback } = source)
         *   After:  ({ ["slot"]: R(slot) }) / ({ ["slot"]: T(slot) } = R(source))
         *           / ({ ["slot"]: T(slot) = R(fallback) } = R(source))
         * Expanding shorthand keeps the ORIGINAL property key while the value/target becomes an expression.
         * A computed string key is essential for __proto__: { __proto__: value } can set the object prototype,
         * but { ["__proto__"]: value } defines an ordinary own data property, just like shorthand. Repeated
         * __proto__ shorthand keys also remain legal. Pattern defaults keep their normal conditional evaluation.
         * Time: O(L) quoted-key/replacement text; O(1) runtime literal-key evaluation plus read/write routing.
         * Space: O(L) text, O(1) key evaluation; the object is the original object literal, not an added wrapper.
         * Assignment patterns only incur the existing per-name adapter when the native branch is selected.
         * Leak: no new object beyond the original literal and no property-value cache; patterns create no wrapper.
         */
        overwrite(
            range,
            context?.type === 'Property' && context.shorthand
                ? `[${JSON.stringify(name)}]: ${replacement}`
                : replacement
        )
        if (
            (parent?.type === 'AssignmentPattern' ||
                (parent?.type === 'AssignmentExpression' &&
                    (parent.operator === '=' ||
                        parent.operator === '&&=' ||
                        parent.operator === '||=' ||
                        parent.operator === '??='))) &&
            parent.left === node
        ) {
            initializers.push({ node: parent.right, name })
        }
    })
    for (const { node, name } of initializers) {
        if (preserveInferredName(node, name, editor)) {
            terminate(node.end)
        }
    }
    if (!changed) {
        return false
    }
    // Insert before leading body comments so annotations stay with the original statement, not the new import. A newline
    // ends a hashbang or an unterminated directive; the trailing newline also isolates the untouched body. No extra AST pass
    // or runtime lookup is needed. The caller supplies the canonical module ID so all rewritten modules share one namespace.
    editor.prependLeft(
        importOffset,
        `${importOffset === 0 ? '' : '\n'}import { miniGlobal as ${global} } from ${JSON.stringify(miniGlobalId)};\n`
    )
    if (targets.size > 0) {
        /*
         * Module footer emission:
         *   Before: export function write() { slot = 1 }
         *   After:  export function write() { T(slot) = 1 }
         *           function init() { return C = { __proto__: { get slot() { return slot; },
         *                                                       set slot(V) { slot = V; } } }; }
         *           var C;
         * Emit one initializer/cache pair per distinct written name, regardless of the number of assignment sites.
         * Function declarations and uninitialized var bindings are usable by cyclic ESM calls before module evaluation.
         * A let/const cache would be in TDZ; `var C = undefined` would overwrite an adapter created by an early call.
         * Appending avoids disturbing directives/hashbangs and the import inserted above; source maps stay with the caller.
         * Time: O(U) records plus O(F) footer characters to assemble; O(1) lazy runtime initialization per used name.
         * Space: O(U + F) temporary arrays/joined text, O(U) module bindings/initializer functions, lazy adapter objects.
         * Leak: module-lifetime caches are intentional and bounded by source names. No cache is allocated per write,
         * and no caller frame is captured. Collectability of the module itself depends on its loader's module cache.
         */
        // Both functions and uninitialized vars work during cyclic ESM calls before evaluation; nothing resets an early adapter.
        const declarations = Array.from(targets.values(), (target) => target.declaration).join('\n')
        editor.append(`\n${declarations}\nvar ${Array.from(targets.values(), (target) => target.cache).join(', ')};\n`)
    }
    return true
}

/**
 * Classify assignment-pattern LEAVES, not every identifier under an assignment's left side.
 *
 * Array destructuring, elisions, nested targets and rest:
 *   Before: [slot, , ...rest] = source / [{ value: slot }] = source
 *   After:  [T(slot), , ...T(rest)] = R(source) / [{ value: T(slot) }] = R(source)
 * Only target leaves change; the engine still drives the original iterator, skips holes, collects rest once and closes
 * the iterator on abrupt completion. Each base is selected at that target's own evaluation point, not once for the pattern.
 * Time: O(K) build visits for K pattern nodes, plus each emitted target; O(1) extra routing per reached target at runtime.
 * Space: O(K) recorded leaves, O(H) recursion stack for pattern depth H; runtime O(1) routing per target/shared adapters.
 * Original iterator/rest-result allocations are unchanged. Leak: no iterator/result registry or added enclosing closure;
 * adapters do not retain yielded values, and native iterator cleanup is not bypassed.
 *
 * Object destructuring, computed keys, defaults and object rest:
 *   Before: ({ [key]: slot = fallback, ...rest } = source)
 *   After:  ({ [R(key)]: T(slot) = R(fallback), ...T(rest) } = R(source))
 * Key/default/source identifiers are reads; only slot/rest are writes. The original syntax determines the order of key
 * evaluation, target selection, property access and default evaluation. For example, an object source getter that adds
 * G.slot AFTER T(slot) was selected cannot redirect that write. Defaults still run only for undefined and stay in their
 * original scope, even for await/yield/super/arguments. Shorthand expansion is documented at the overwrite above.
 * Time: O(K) structural classification, with keys/default expressions visited separately by the main walk, not recursively
 * rescanned here; O(1) runtime routing per reached free reference in addition to original property/rest-copy work.
 * Space: O(K) build leaves and O(H) recursion, O(1) routing temporaries per reached target and the shared adapters.
 * Leak: no source/default object is cached; rest retains exactly the copied properties required by the original program.
 *
 * Member assignment targets (including targets inside patterns) rewrite their receiver/key as READS:
 *   Before: slot.value = rhs / ({ value: slot[key] = fallback } = source)
 *   After:  R(slot).value = R(rhs) / ({ value: R(slot)[R(key)] = R(fallback) } = R(source))
 * Assigning a property does not assign its receiver binding. Stop at MemberExpression here; the main walk rewrites its
 * free receiver/computed-key reads. This avoids constructing a native binding adapter for a plain property write.
 * Time: O(1) classification at that member node, then O(L) text/O(1) runtime routing per free receiver/key read.
 * Space: no added write-leaf/cache entry for the receiver, O(1) routing temporaries and the emitted read text.
 * Leak: no additional receiver retention beyond the normal property Reference, including through a suspended RHS.
 *
 * For-in, for-of and for-await-of assignment heads:
 *   Before: for (slot in source) body / for (slot of source) body / for await (slot of source) body
 *   After:  for (T(slot) in R(source)) body / for (T(slot) of R(source)) body
 *           / for await (T(slot) of R(source)) body
 * Patterns in a loop head receive the same leaf transformations above. Re-evaluate target selection on each iteration;
 * do not hoist it out of the loop. Enumeration, async awaiting, break/throw and iterator closing remain native. A declared
 * loop variable, as in for (let slot of source), stays a local binding and is not collected as an assignment leaf.
 * Time: O(K) head classification; O(I * W) extra routing for I iterations reaching W free target leaves each.
 * Space: O(K) build leaves, O(H) recursion; runtime adapters are O(U) for distinct names, NOT O(I) per iteration.
 * Leak: iterations reuse adapters and add no iterator history or pending async-operation list.
 */
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

/**
 * Restore anonymous function/class name inference lost when a bare identifier target becomes a property target:
 *   Before: slot = () => body / slot = function() {} / slot = class {}
 *   After:  T(slot) = ({ ["slot"]: () => body })["slot"]
 *           / T(slot) = ({ ["slot"]: function() {} })["slot"]
 *           / T(slot) = ({ ["slot"]: class {} })["slot"]
 * The same wrapper applies to async arrows, async functions, generators and async generators. It also applies for &&=,
 * ||= and ??=, and for direct-identifier destructuring defaults: [slot = () => body] becomes
 * [T(slot) = ({ ["slot"]: () => body })["slot"]]. Logical/default short-circuiting still decides whether it is evaluated.
 * Arithmetic compound operators never had this inference and are not queued. Existing named functions/classes remain
 * unchanged, as do non-anonymous RHSs; a parenthesized LEFT target is not queued by the caller's direct-Identifier test.
 *
 * Reasoning: a computed data property's anonymous initializer receives its key as .name. Extracting that value preserves
 * identity without adding `function slot`/`class slot`, which would introduce a self-binding and change references inside
 * the body. Class static initialization sees the inferred name during construction; patching .name afterwards is too late.
 * A computed "__proto__" key creates a data property instead of changing the wrapper prototype. This is not a method or a
 * new closure around the RHS, so lexical this/super/arguments and references to a later-reassigned outer slot stay intact.
 *
 * Parenthesized/nested RHSs:
 *   Before: slot = (function() {}) / slot = () => other = () => 1
 *   After:  T(slot) = ({ ["slot"]: (function() {}) })["slot"]
 *           / T(slot) = ({ ["slot"]: () => T(other) = ({ ["other"]: () => 1 })["other"] })["slot"]
 * Peel wrappers only to classify the RHS, then wrap its ORIGINAL range. Delaying these inserts until overwrites finish
 * prevents an inner rewrite from erasing an outer suffix. prependRight orders inner endings before outer endings and the
 * terminator, including when several arrow RHSs share one end offset; no entire nested RHS is copied into a new string.
 *
 * Time: O(P) to inspect P transparent parentheses for this RHS, plus O(L) quoted-key wrapper text. These scans do not walk
 * nested RHS bodies, so total structural work remains O(N). Runtime adds O(1) one-property creation and extraction whenever
 * the RHS actually runs; original function/class creation and static-initializer work are unchanged.
 * Space: O(L) emitted text and O(1) scan state, with O(N) queued RHS references in the caller. Runtime adds one short-lived
 * object per evaluated wrapper, not another function/class; A evaluations can create O(A) garbage even though the wrapper
 * is not retained. Engines may optimize that allocation away, but the complexity does not assume such an optimization.
 * Leak: the data property points TO the original function/class, not back from it to the wrapper. No method [[HomeObject]]
 * pointing at this wrapper or helper closure is introduced, so extraction leaves it collectible. The returned function's
 * original captured variables and the assigned binding's intended retention still have their normal lifetimes.
 */
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

type ReferenceCandidate = { node: Identifier; parent: Node | null; context: Node | null }
type ScopeBoundary = { scope: string; change: 1 | -1 }

/**
 * Scope classification supporting every transform; this class emits no runtime code.
 *   Before -> after: slot; let slot; / function run(value = slot) { var slot; }
 *                   unchanged     / function run(value = R(slot)) { var slot; }
 * One AST walk records scope boundaries and identifiers, retaining the declarations populated by Oxc. Only after all
 * declarations are known does a linear record scan activate/deactivate completed binding sets and resolve references.
 * Function parameter/default and body var scopes remain distinct; static-block vars stay inside their block; implicit
 * arguments belongs to ordinary functions, not arrows; named function/class expression names remain local.
 *
 * Time: O(N) expected structural collection/resolution work. Flat IDs avoid depth-length keys, cached var scopes avoid
 * O(D) searches per var declaration, and active counts avoid O(D) searches per reference. Each binding is activated and
 * deactivated once; each identifier is classified once. Bound names are skipped before syntax classification, avoiding
 * O(P²) parameter-pattern searches in Oxc's isReferenceIdentifier for functions with P parameters. Decimal ID formatting
 * and hashing still depend on ID length (O(log N) characters). No worst-case constant hash-table time is promised.
 * Space: O(N) records/declarations/counts and O(D) collection stacks, plus identifier/ID text; no generated runtime storage.
 * Leak: records and declarations retain AST nodes only within rewriteGlobal. All records/counts die with this invocation.
 */
class SourceScopes extends ScopeTracker {
    // Allocate stable flat IDs once; resolution uses recorded boundaries rather than traversing the AST again.
    private nextScope = 0
    // Cache the nearest var environment, including distinct function bodies and static blocks.
    private readonly varScopes: string[] = []
    // Append in traversal order so completed bindings can later be activated at exactly their original boundaries.
    private readonly records: (ReferenceCandidate | ScopeBoundary)[] = []

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
        // Implicit arguments is a language binding in ordinary functions, not a predefined host global.
        if (owner.type === 'FunctionDeclaration' || owner.type === 'FunctionExpression') {
            this.declareIdentifier('arguments', new ScopeTrackerFunctionArguments(owner, this.scopeIndexKey))
        }
        if (owner.type !== 'SwitchStatement') {
            this.records.push({ scope: this.scopeIndexKey, change: 1 })
        }
    }

    protected override popScope(): void {
        const owner = this.scopeOwnerStack[this.scopeOwnerStack.length - 1]
        if (owner.type !== 'SwitchStatement' || owner.cases.length > 0) {
            this.records.push({ scope: this.scopeIndexKey, change: -1 })
        }
        this.varScopes.pop()
        this.scopeOwnerStack.pop()
        this.scopeIndexKey = this.scopeKeyStack[this.scopeKeyStack.length - 1]
        this.scopeKeyStack.pop()
    }

    protected override getVarScopeKey(): string {
        return this.varScopes[this.varScopes.length - 1]
    }

    enterCases(): void {
        this.records.push({ scope: this.scopeIndexKey, change: 1 })
    }

    recordIdentifier(node: Identifier, parent: Node | null, context: Node | null): void {
        this.records.push({ node, parent, context })
    }

    visitFreeReferences(visit: (reference: ReferenceCandidate) => void): void {
        // Counts restore shadowed names on exit. Retain zero counts until resolution ends to avoid delete/reinsert
        // rehashing when many sibling functions share local names alongside a large module's live bindings.
        const activeBindings = new Map<string, number>()
        for (const record of this.records) {
            if ('change' in record) {
                for (const name of this.scopes.get(record.scope)?.keys() ?? []) {
                    activeBindings.set(name, (activeBindings.get(name) ?? 0) + record.change)
                }
                continue
            }
            const { node, parent } = record
            // Imports/exports, keys, labels and declared identifiers are syntax/interfaces, not free reads. Resolve
            // against completed bindings before inspecting syntax, preserving later declarations, hoisting and TDZ.
            if (
                (activeBindings.get(node.name) ?? 0) > 0 ||
                parent?.type === 'ExportSpecifier' ||
                !isReferenceIdentifier(node, parent)
            ) {
                continue
            }
            visit(record)
        }
    }
}
