import type { Node, StringLiteral, TemplateElement } from '@oxc-project/types'
import { splitCandidateTokens } from '@tailwindcss-mangle/engine'
import { escape as escapeClassName, MappingChars2String } from '@weapp-core/escape'
import { createStyleHandler, type IStyleHandlerOptions } from '@weapp-tailwindcss/postcss'
import { type WalkerEnter, walk } from 'oxc-walker'
import { RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'

const cssPreflight = {
    border: '0 solid',
    'box-sizing': 'border-box',
    margin: '0',
    padding: '0'
} as const

/** Fixed Mini Program style policy that avoids loading a framework project context into the bundle. */
const miniStyleHandlerOptions = {
    appType: 'weapp-vite',
    /*
     * Tailwind runs before this native-style handler and emits prefixed and standard utility declarations together,
     * such as `-webkit-user-select` and `user-select`. Running the standalone Autoprefixer afterward would
     * retarget completed Tailwind output through a second Browserslist policy and duplicate compatibility ownership.
     *
     * @weapp-tailwindcss/postcss also controls an independent Autoprefixer inside postcss-preset-env. Its default
     * `{ add: false }` pass cannot add compatibility; it can only remove prefixes emitted by Tailwind or supplied
     * by application CSS. Disabling both entry points preserves those declarations and lets the compiler build
     * eliminate Autoprefixer and its browser-data graph.
     */
    autoprefixer: false,
    cssPresetEnv: { autoprefixer: false },
    cssCalc: false,
    cssChildCombinatorReplaceValue: ['view', 'text'],
    cssPreflight,
    cssRemoveActivePseudoClass: true,
    cssRemoveHoverPseudoClass: true,
    majorVersion: 4,
    px2rpx: true,
    rem2rpx: true
} satisfies Partial<IStyleHandlerOptions>

type JavaScriptTransformInput = Readonly<{
    classSet: ReadonlySet<string>
    code: string
    filename: string
}>

type MiniTransformer = Readonly<{
    transformJavaScript: (input: JavaScriptTransformInput) => string
    transformStylesheet: (css: string) => Promise<string>
}>

type CandidateTransform = Readonly<{
    pattern: RegExp
    replacements: ReadonlyMap<string, string>
}>

/** Creates VPT's fixed Tailwind-v4 Mini Program transformer without loading a framework project context. */
export function createMiniTransformer(): MiniTransformer {
    const styleHandler = createStyleHandler(miniStyleHandlerOptions)
    // Weak keys release each transaction's exact precheck and replacement table with its projected class set.
    const candidateTransformByClassSet = new WeakMap<ReadonlySet<string>, CandidateTransform | null>()

    const transformJavaScript = ({ classSet, code, filename }: JavaScriptTransformInput): string => {
        const candidateTransform = getCandidateTransform(classSet, candidateTransformByClassSet)
        if (!candidateTransform?.pattern.test(code)) {
            return code
        }
        return transformJavaScriptSource(code, filename, candidateTransform.replacements)
    }

    return {
        transformJavaScript,
        async transformStylesheet(css) {
            return (await styleHandler(css)).css
        }
    }
}

function transformJavaScriptSource(code: string, filename: string, replacements: ReadonlyMap<string, string>): string {
    const parsed = parseSync(filename, code)
    if (parsed.errors.length > 0) {
        const diagnostics = parsed.errors.map((error) => error.message).join('; ')
        throw new Error(`Failed to transform Tailwind classes in ${filename}: ${diagnostics}`)
    }

    // This transaction-local editor batches non-overlapping literal replacements without regenerating untouched code.
    const editor = new RolldownMagicString(code, { filename })
    walk(parsed.program, {
        enter: createClassNameVisitor(code, replacements, editor)
    })
    return editor.toString()
}

function createClassNameVisitor(
    code: string,
    replacements: ReadonlyMap<string, string>,
    editor: RolldownMagicString
): WalkerEnter {
    return (node) => {
        if (isStringLiteral(node)) {
            replaceStringLiteral(code, node, replacements, editor)
            return
        }
        if (node.type === 'TemplateElement') {
            replaceTemplateElement(code, node, replacements, editor)
        }
    }
}

function replaceStringLiteral(
    code: string,
    node: StringLiteral,
    replacements: ReadonlyMap<string, string>,
    editor: RolldownMagicString
): void {
    const transformed = transformLiteralText(node.value, replacements)
    if (transformed !== undefined) {
        replaceRange(code, node.start + 1, node.end - 1, jsStringEscape(transformed), editor)
    }
}

function replaceTemplateElement(
    code: string,
    node: TemplateElement,
    replacements: ReadonlyMap<string, string>,
    editor: RolldownMagicString
): void {
    const transformed = transformLiteralText(node.value.raw, replacements)
    if (transformed !== undefined) {
        replaceTemplateRange(code, node, transformed, editor)
    }
}

function replaceTemplateRange(
    code: string,
    node: TemplateElement,
    transformed: string,
    editor: RolldownMagicString
): void {
    const first = code[node.start]
    const last = code[node.end - 1]
    const start = node.start + (first === '`' || first === '}' ? 1 : 0)
    const end = node.end - (last === '`' ? 1 : last === '{' ? 2 : 0)
    replaceRange(code, start, end, transformed, editor)
}

function replaceRange(
    code: string,
    start: number,
    end: number,
    transformed: string,
    editor: RolldownMagicString
): void {
    if (start < end && transformed !== code.slice(start, end)) {
        editor.overwrite(start, end, transformed)
    }
}

function transformLiteralText(source: string, replacements: ReadonlyMap<string, string>): string | undefined {
    const candidates = splitCandidateTokens(source)
    // This local accumulator applies each admitted token once while preserving all non-class source bytes.
    let transformed = source

    candidates.forEach((candidate) => {
        const replacement = replacements.get(candidate)
        if (replacement !== undefined) {
            transformed = transformed.replace(candidate, replacement)
        }
    })

    return transformed === source ? undefined : transformed
}

/** Builds the exact source precheck and replacements owned by one projected class set. */
function getCandidateTransform(
    classSet: ReadonlySet<string>,
    transformByClassSet: WeakMap<ReadonlySet<string>, CandidateTransform | null>
): CandidateTransform | undefined {
    const cached = transformByClassSet.get(classSet)
    if (cached !== undefined) {
        return cached ?? undefined
    }

    // These local collections become weakly reachable with the class set and never accumulate across HMR generations.
    const alternatives = new Set<string>()
    const replacements = new Map<string, string>()
    classSet.forEach((candidate) => {
        const replacement = escapeClassName(candidate, { map: MappingChars2String })
        if (replacement === candidate || isPlainSlashPathCandidate(candidate)) {
            return
        }
        replacements.set(candidate, replacement)
        alternatives.add(RegExp.escape(candidate))
        alternatives.add(RegExp.escape(jsStringEscape(candidate)))
    })

    const transform =
        alternatives.size > 0 ? { pattern: new RegExp([...alternatives].join('|')), replacements: replacements } : null
    transformByClassSet.set(classSet, transform)
    return transform ?? undefined
}

function isPlainSlashPathCandidate(candidate: string): boolean {
    if (candidate.startsWith('//') || candidate.startsWith('http://') || candidate.startsWith('https://')) {
        return true
    }
    const slashIndex = candidate.indexOf('/')
    if (slashIndex <= 0) {
        return false
    }
    if (candidate.includes('[') || candidate.includes(']') || candidate.includes(':')) {
        return false
    }
    return !candidate.slice(0, slashIndex).includes('-')
}

function isStringLiteral(node: Node): node is StringLiteral {
    return node.type === 'Literal' && typeof node.value === 'string'
}

function jsStringEscape(value: string): string {
    return value.replaceAll(/[\n\r"'\\\u2028\u2029]/g, (character) => {
        switch (character) {
            case '\n':
                return '\\n'
            case '\r':
                return '\\r'
            case '\u2028':
                return '\\u2028'
            case '\u2029':
                return '\\u2029'
        }
        return `\\${character}`
    })
}
