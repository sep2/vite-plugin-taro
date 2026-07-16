import type { Plugin } from 'vite'
import type { VitePluginTaroTarget } from '../../options.ts'
import type { BuildContext } from '../build-context.ts'
import { normalizeModuleId } from '../utils/modules.ts'

/**
 * Preserves the current source-level `#ifdef wx` and `#ifdef h5` contract for shared applications.
 * The pre-transform removes inactive lines before target-specific React, CSS, or dependency transforms inspect them.
 */
export function createConditionalDirectivePlugin(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:conditional-directives',
        enforce: 'pre',
        transform(code, id) {
            if (!isConditionalDirectiveSource(id) || !code.includes('#if')) return
            return { code: transformConditionalDirectives(code, context.project.target), map: null }
        }
    }
}

/** Limits directive parsing to user-authored script and style modules so dependency comments remain untouched. */
function isConditionalDirectiveSource(id: string): boolean {
    const normalizedId = normalizeModuleId(id)
    return !normalizedId.includes('/node_modules/') && /\.(?:[cm]?[jt]sx?|css|s[ac]ss|less|styl)$/.test(normalizedId)
}

type Directive = {
    name: 'ifdef' | 'ifndef' | 'else' | 'endif'
    target: string
}

type DirectiveFrame = {
    parentActive: boolean
    matched: boolean
    active: boolean
}

/**
 * Evaluates nested target branches with a stack while preserving the original line count.
 * Inactive content becomes line endings, keeping downstream source locations aligned with the user's file.
 */
function transformConditionalDirectives(code: string, target: VitePluginTaroTarget): string {
    const lines = code.match(/[^\n]*(?:\n|$)/g) ?? []
    const frames: DirectiveFrame[] = []
    let transformed = ''

    for (const line of lines) {
        if (!line) continue
        const directive = parseDirective(line)
        const lineEnding = line.match(/\r?\n$/)?.[0] ?? ''
        if (!directive) {
            transformed += frames.every((frame) => frame.active) ? line : lineEnding
            continue
        }

        if (directive.name === 'ifdef' || directive.name === 'ifndef') {
            const parentActive = frames.every((frame) => frame.active)
            const targetMatched = directive.target.toLowerCase() === target
            const matched = directive.name === 'ifdef' ? targetMatched : !targetMatched
            frames.push({ parentActive, matched, active: parentActive && matched })
        } else if (directive.name === 'else') {
            const frame = frames.at(-1)
            if (frame) frame.active = frame.parentActive && !frame.matched
        } else {
            frames.pop()
        }
        transformed += lineEnding
    }

    return transformed
}

/**
 * Parses only the current simple directive grammar and rejects removed expression forms explicitly.
 * Returning undefined for ordinary lines lets the transformer copy source without a second tokenizer.
 */
function parseDirective(line: string): Directive | undefined {
    const match = line.match(/^\s*(?:(?:\/\/)|(?:\/\*))\s*#(ifdef|ifndef|if|elif|else|endif)\b([^*\r\n]*)/)
    if (!match) return
    const name = match[1]
    if (name === 'if' || name === 'elif') {
        throw new Error(`vite-plugin-taro no longer supports #${name}; use #ifdef, #ifndef, or #else.`)
    }
    if (name !== 'ifdef' && name !== 'ifndef' && name !== 'else' && name !== 'endif') return
    return {
        name,
        target: match[2]?.replace(/\*\/$/, '').trim() ?? ''
    }
}
