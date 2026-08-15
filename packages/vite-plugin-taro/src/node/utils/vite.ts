import type { HookHandler, Plugin } from 'vite'

type TransformHook = HookHandler<NonNullable<Plugin['transform']>>

type AsyncTransformHook = (
    this: ThisParameterType<TransformHook>,
    ...args: Parameters<TransformHook>
) => Promise<Awaited<ReturnType<TransformHook>>>

export type TransformHookWrapper = (transform: AsyncTransformHook) => AsyncTransformHook

/** Mutates one concrete plugin to interpose on its transform while preserving hook metadata and plugin context. */
export function wrapPluginTransform(plugin: Plugin, wrapper: TransformHookWrapper): void {
    const transform = plugin.transform!
    const handler = typeof transform === 'function' ? transform : transform.handler
    const wrapped = wrapper(async function (code, id, options) {
        return handler.call(this, code, id, options)
    })

    // Installation-time mutation keeps Vite's existing plugin identity and resolved hook registration.
    plugin.transform = typeof transform === 'function' ? wrapped : { ...transform, handler: wrapped }
}
