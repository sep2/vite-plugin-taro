import { blockElements, inlineElements } from 'vite-plugin-taro-runtime/plugin-html/html-elements'

/** Maps Taro's HTML aliases to native presentation while preserving logical tag names. */
export function getNativeHtmlTag(name: string): 'view' | 'text' | undefined {
    // Mini view keeps its native class contract instead of acquiring an HTML semantic class.
    if (name !== 'view' && blockElements.has(name)) {
        return 'view'
    }

    if (inlineElements.has(name)) {
        return 'text'
    }

    return undefined
}
