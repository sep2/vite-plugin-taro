import type { Plugin } from 'vite'
import type { VitePluginTaroTarget } from '../../../options.ts'
import { normalizeModuleId } from '../../utils/modules.ts'

/** Creates source-level target conditional handling shared by H5 and WX. */
export function createConditionalDirectivePlugin(target: VitePluginTaroTarget): Plugin {
    return {
        name: 'vite-plugin-taro:conditional-directives',
        enforce: 'pre',
        transform(code, id) {
            if (!isConditionalDirectiveSource(id) || !code.includes('#if')) {
                return
            }
            return {
                code: transformConditionalDirectives(code, target),
                map: null
            }
        }
    }
}

/** Tests whether an application source can contain conditional directives. */
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

/** Keeps only the source branches active for one build target. */
function transformConditionalDirectives(code: string, target: VitePluginTaroTarget): string {
    const lines = code.match(/[^\n]*(?:\n|$)/g) ?? []
    const frames: DirectiveFrame[] = []
    let transformed = ''

    for (const line of lines) {
        if (!line) {
            continue
        }
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
            frames.push({
                parentActive,
                matched,
                active: parentActive && matched
            })
        } else if (directive.name === 'else') {
            const frame = frames.at(-1)
            if (frame) {
                frame.active = frame.parentActive && !frame.matched
            }
        } else {
            frames.pop()
        }
        transformed += lineEnding
    }

    return transformed
}

/** Parses one supported Taro conditional directive. */
function parseDirective(line: string): Directive | undefined {
    const match = line.match(/^\s*(?:(?:\/\/)|(?:\/\*))\s*#(ifdef|ifndef|if|elif|else|endif)\b([^*\r\n]*)/)
    if (!match) {
        return
    }
    const name = match[1]
    if (name === 'if' || name === 'elif') {
        throw new Error(`vite-plugin-taro no longer supports #${name}; use #ifdef, #ifndef, or #else`)
    }
    if (name !== 'ifdef' && name !== 'ifndef' && name !== 'else' && name !== 'endif') {
        return
    }
    return {
        name,
        target: match[2]?.replace(/\*\/$/, '').trim() ?? ''
    }
}
