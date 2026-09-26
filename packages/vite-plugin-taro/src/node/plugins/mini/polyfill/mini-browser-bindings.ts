import { miniTaroRuntimeId } from '../module/module.ts'

/** Taro's renderer-owned bindings. window stays native; portable APIs use native globals or explicit polyfills. */
export const miniBrowserBindings = {
    document: [miniTaroRuntimeId, 'document'],
    navigator: [miniTaroRuntimeId, 'navigator'],
    requestAnimationFrame: [miniTaroRuntimeId, 'requestAnimationFrame'],
    cancelAnimationFrame: [miniTaroRuntimeId, 'cancelAnimationFrame'],
    Element: [miniTaroRuntimeId, 'TaroElement'],
    SVGElement: [miniTaroRuntimeId, 'SVGElement'],
    MutationObserver: [miniTaroRuntimeId, 'MutationObserver'],
    history: [miniTaroRuntimeId, 'history'],
    location: [miniTaroRuntimeId, 'location']
} satisfies Record<string, [string, string]>
