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

/** Static replacement for the generic Weapp context, keeping VPT policy explicit and framework detection out of the bundle. */
const wxStyleHandlerOptions = {
    appType: 'weapp-vite',
    autoprefixer: false,
    cssCalc: false,
    cssChildCombinatorReplaceValue: ['view', 'text'],
    cssPreflight,
    cssRemoveActivePseudoClass: true,
    cssRemoveFocusPseudoClass: true,
    cssRemoveHoverPseudoClass: true,
    cssRemoveProperty: true,
    cssSelectorReplacement: {
        root: ['page', '.tw-root', 'wx-root-portal-content'],
        universal: ['view', 'text']
    },
    isMainChunk: true,
    majorVersion: 4,
    postcssOptions: {},
    px2rpx: true,
    rem2rpx: true
} satisfies Partial<IStyleHandlerOptions>

type JavaScriptTransformInput = Readonly<{
    classSet: ReadonlySet<string>
    code: string
    filename: string
}>

type WxTransformer = Readonly<{
    transformJavaScript: (input: JavaScriptTransformInput) => string
    transformStylesheet: (css: string) => Promise<string>
}>

/** Creates VPT's fixed Tailwind-v4/WX transformer without loading Weapp's generic framework context. */
export function createWxTransformer(): WxTransformer {
    const styleHandler = createStyleHandler(wxStyleHandlerOptions)
    // This factory-local cache memoizes the deterministic Mini Program spelling of each admitted Tailwind class.
    const escapedClassNames = new Map<string, string>()
    // Each projected class set gets one exact source precheck so class-free vendor and helper chunks avoid an Oxc parse.
    const candidatePatternByClassSet = new WeakMap<ReadonlySet<string>, RegExp | null>()

    const transformJavaScript = ({ classSet, code, filename }: JavaScriptTransformInput): string => {
        const candidatePattern = getCandidatePattern(classSet, escapedClassNames, candidatePatternByClassSet)
        if (!candidatePattern?.test(code)) {
            return code
        }
        return transformJavaScriptSource(code, filename, classSet, escapedClassNames)
    }

    return {
        transformJavaScript,
        async transformStylesheet(css) {
            return (await styleHandler(css)).css
        }
    }
}

function transformJavaScriptSource(
    code: string,
    filename: string,
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>
): string {
    const parsed = parseSync(filename, code)
    if (parsed.errors.length > 0) {
        const diagnostics = parsed.errors.map((error) => error.message).join('; ')
        throw new Error(`Failed to transform Tailwind classes in ${filename}: ${diagnostics}`)
    }

    // This transaction-local editor batches non-overlapping literal replacements without regenerating untouched code.
    const editor = new RolldownMagicString(code, { filename })
    walk(parsed.program, {
        enter: createClassNameVisitor(code, classSet, escapedClassNames, editor)
    })
    return editor.toString()
}

function createClassNameVisitor(
    code: string,
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>,
    editor: RolldownMagicString
): WalkerEnter {
    return (node) => {
        if (isStringLiteral(node)) {
            replaceStringLiteral(code, node, classSet, escapedClassNames, editor)
            return
        }
        if (node.type === 'TemplateElement') {
            replaceTemplateElement(code, node, classSet, escapedClassNames, editor)
        }
    }
}

function replaceStringLiteral(
    code: string,
    node: StringLiteral,
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>,
    editor: RolldownMagicString
): void {
    const transformed = transformLiteralText(node.value, classSet, escapedClassNames)
    if (transformed !== undefined) {
        replaceRange(code, node.start + 1, node.end - 1, jsStringEscape(transformed), editor)
    }
}

function replaceTemplateElement(
    code: string,
    node: TemplateElement,
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>,
    editor: RolldownMagicString
): void {
    const transformed = transformLiteralText(node.value.raw, classSet, escapedClassNames)
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

function transformLiteralText(
    source: string,
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>
): string | undefined {
    const candidates = splitCandidateTokens(source)
    // This local accumulator applies each admitted token once while preserving all non-class source bytes.
    let transformed = source

    candidates.forEach((candidate) => {
        if (candidate === '*' || isPlainSlashPathCandidate(candidate)) {
            return
        }
        const escaped = getEscapedClassName(candidate, escapedClassNames)
        if (!classSet.has(candidate) && !classSet.has(escaped)) {
            return
        }
        transformed = transformed.replace(candidate, escaped)
    })

    return transformed === source ? undefined : transformed
}

/** Builds the exact raw-source alternatives that can produce a Mini Program class-name mutation. */
function getCandidatePattern(
    classSet: ReadonlySet<string>,
    escapedClassNames: Map<string, string>,
    patternByClassSet: WeakMap<ReadonlySet<string>, RegExp | null>
): RegExp | undefined {
    const cached = patternByClassSet.get(classSet)
    if (cached !== undefined) {
        return cached ?? undefined
    }

    // These transaction-local alternatives include decoded and JavaScript-escaped spellings without broad class heuristics.
    const alternatives = new Set<string>()
    classSet.forEach((candidate) => {
        if (getEscapedClassName(candidate, escapedClassNames) === candidate) {
            return
        }
        alternatives.add(RegExp.escape(candidate))
        alternatives.add(RegExp.escape(jsStringEscape(candidate)))
    })

    const pattern = alternatives.size > 0 ? new RegExp([...alternatives].join('|')) : null
    patternByClassSet.set(classSet, pattern)
    return pattern ?? undefined
}

function getEscapedClassName(candidate: string, escapedClassNames: Map<string, string>): string {
    const cached = escapedClassNames.get(candidate)
    if (cached !== undefined) {
        return cached
    }
    const escaped = escapeClassName(candidate, { map: MappingChars2String })
    escapedClassNames.set(candidate, escaped)
    return escaped
}

function isPlainSlashPathCandidate(candidate: string): boolean {
    const slashIndex = candidate.indexOf('/')
    if (slashIndex <= 0) {
        return false
    }
    if (candidate.startsWith('//') || candidate.startsWith('http://') || candidate.startsWith('https://')) {
        return true
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
            case '"':
            case "'":
            case '\\':
                return `\\${character}`
            case '\n':
                return '\\n'
            case '\r':
                return '\\r'
            case '\u2028':
                return '\\u2028'
            case '\u2029':
                return '\\u2029'
            default:
                return character
        }
    })
}
