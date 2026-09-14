import { miniRuntimeId } from '../module/module.ts'

/** Taro's renderer-owned browser bindings; portable APIs use native globals or explicit polyfills. */
export const miniBrowserBindings = {
    window: [miniRuntimeId, 'window'],
    document: [miniRuntimeId, 'document'],
    navigator: [miniRuntimeId, 'navigator'],
    requestAnimationFrame: [miniRuntimeId, 'requestAnimationFrame'],
    cancelAnimationFrame: [miniRuntimeId, 'cancelAnimationFrame'],
    Element: [miniRuntimeId, 'TaroElement'],
    SVGElement: [miniRuntimeId, 'SVGElement'],
    MutationObserver: [miniRuntimeId, 'MutationObserver'],
    history: [miniRuntimeId, 'history'],
    location: [miniRuntimeId, 'location']
} satisfies Record<string, [string, string]>
