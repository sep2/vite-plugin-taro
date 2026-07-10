import type { Plugin } from 'vite'
import type { VitePluginTaroBuildContext, VitePluginTaroTarget } from './types.ts'
import { normalizeModuleId } from './utils.ts'

/**
 * Applies Taro-style conditional compilation comments before Vite parses source files.
 *
 * Mirrors Taro's CSS #ifdef/#ifndef handling, generalized before Vite parses code.
 */
export function createVitePluginTaroConditionalDirectivePlugin(context: VitePluginTaroBuildContext): Plugin {
    const target = context.target
    return {
        name: 'vite-plugin-taro-conditional-directives',
        enforce: 'pre',
        transform(code, id) {
            if (!isConditionalDirectiveSource(id) || !code.includes('#if')) return
            return { code: transformTaroConditionalDirectives(code, target), map: null }
        }
    }
}

/**
 * Filters files where Taro's conditional comments are meaningful.
 *
 * Plugin-only: source filter for generalized conditional-directive transform.
 */
function isConditionalDirectiveSource(id: string): boolean {
    const normalizedId = normalizeModuleId(id)
    if (normalizedId.includes('/node_modules/')) return false
    return /\.(?:[cm]?[jt]sx?|css|s[ac]ss|less|styl)(?:\?|$)/.test(normalizedId)
}

type ConditionalDirectiveName = 'ifdef' | 'ifndef' | 'if' | 'elif' | 'else' | 'endif'

type ConditionalDirective = {
    name: ConditionalDirectiveName
    expression: string
}

type ConditionalDirectiveFrame = {
    parentActive: boolean
    active: boolean
    matched: boolean
}

/**
 * Removes inactive blocks guarded by Taro conditional comments.
 *
 * Mirrors Taro's CSS #ifdef/#ifndef handling.
 */
export function transformTaroConditionalDirectives(code: string, target: VitePluginTaroTarget): string {
    const lines = code.match(/[^\n]*(?:\n|$)/g) ?? []
    const frames: ConditionalDirectiveFrame[] = []
    let transformed = ''

    for (const line of lines) {
        if (!line) continue
        const directive = parseConditionalDirective(line)
        const lineEnding = getLineEnding(line)
        if (directive) {
            updateConditionalDirectiveFrames(frames, directive, target)
            transformed += lineEnding
            continue
        }
        transformed += isDirectiveStackActive(frames) ? line : lineEnding
    }

    return transformed
}

/**
 * Parses one Taro conditional compilation directive from a comment-only line.
 *
 * Mirrors Taro's CSS comment-token handling.
 */
function parseConditionalDirective(line: string): ConditionalDirective | undefined {
    const match = line.match(/^\s*(?:(?:\/\/)|(?:\/\*))\s*#(ifdef|ifndef|if|elif|else|endif)\b([^*\r\n]*)/)
    if (!match) return
    const name = toConditionalDirectiveName(match[1])
    if (!name) return
    return {
        name,
        expression: match[2]?.replace(/\*\/$/, '').trim() ?? ''
    }
}

/**
 * Converts a regex capture into a supported directive name.
 *
 * Mirrors Taro's CSS #ifdef/#ifndef/#endif token handling.
 */
function toConditionalDirectiveName(value: string): ConditionalDirectiveName | undefined {
    if (
        value === 'ifdef' ||
        value === 'ifndef' ||
        value === 'if' ||
        value === 'elif' ||
        value === 'else' ||
        value === 'endif'
    ) {
        return value
    }
}

/**
 * Updates the active conditional stack using Taro-style #ifdef/#ifndef/#else/#endif semantics.
 *
 * Plugin-only: stack-based #if/#elif/#else support has no Taro webpack counterpart.
 */
function updateConditionalDirectiveFrames(
    frames: ConditionalDirectiveFrame[],
    directive: ConditionalDirective,
    target: VitePluginTaroTarget
): void {
    if (directive.name === 'ifdef' || directive.name === 'ifndef' || directive.name === 'if') {
        const conditionMatched = evaluateConditionalDirective(directive, target)
        const parentActive = isDirectiveStackActive(frames)
        frames.push({ parentActive, active: parentActive && conditionMatched, matched: conditionMatched })
        return
    }

    const currentFrame = frames.at(-1)
    if (!currentFrame) return

    if (directive.name === 'elif') {
        if (currentFrame.matched) {
            currentFrame.active = false
            return
        }
        const conditionMatched = evaluateConditionalDirective(directive, target)
        currentFrame.active = currentFrame.parentActive && conditionMatched
        currentFrame.matched = conditionMatched
        return
    }

    if (directive.name === 'else') {
        currentFrame.active = currentFrame.parentActive && !currentFrame.matched
        currentFrame.matched = true
        return
    }

    if (directive.name === 'endif') frames.pop()
}

/**
 * Evaluates the small expression subset used by Taro conditional comments.
 *
 * Mirrors Taro's simple CSS platform membership checks.
 */
function evaluateConditionalDirective(directive: ConditionalDirective, target: VitePluginTaroTarget): boolean {
    if (directive.name === 'ifndef') return !matchesDirectiveTarget(directive.expression, target)
    if (directive.name === 'ifdef') return matchesDirectiveTarget(directive.expression, target)
    return evaluateConditionalExpression(directive.expression, target)
}

/**
 * Supports simple #if expressions with !, &&, and || over the configured target token.
 *
 * Plugin-only: #if expressions with && and || have no Taro webpack counterpart.
 */
function evaluateConditionalExpression(expression: string, target: VitePluginTaroTarget): boolean {
    const orTerms = expression.split('||')
    return orTerms.some((term) =>
        term
            .split('&&')
            .map((factor) => factor.trim())
            .filter(Boolean)
            .every((factor) => evaluateConditionalFactor(factor, target))
    )
}

/**
 * Evaluates one target token, optionally negated.
 *
 * Plugin-only: negated #if factors have no Taro webpack counterpart.
 */
function evaluateConditionalFactor(factor: string, target: VitePluginTaroTarget): boolean {
    let token = factor.replace(/[()]/g, '').trim()
    let negated = false
    while (token.startsWith('!')) {
        negated = !negated
        token = token.slice(1).trim()
    }
    const matched = matchesDirectiveTarget(token, target)
    return negated ? !matched : matched
}

/**
 * Checks whether a directive target list includes the current target.
 *
 * Mirrors Taro's simple CSS platform membership checks.
 */
function matchesDirectiveTarget(expression: string, target: VitePluginTaroTarget): boolean {
    const tokens = expression
        .split(/[\s,|&()!]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
    return tokens.includes(target)
}

/**
 * Preserves source line counts when conditional blocks are stripped.
 *
 * Plugin-only: preserves Vite source-map line counts while stripping conditional blocks.
 */
function getLineEnding(line: string): string {
    const match = line.match(/\r?\n$/)
    return match?.[0] ?? ''
}

/**
 * Returns whether all active nested conditional frames include the current line.
 *
 * Plugin-only: stack activity helper for generalized conditional directives.
 */
function isDirectiveStackActive(frames: ConditionalDirectiveFrame[]): boolean {
    return frames.every((frame) => frame.active)
}
