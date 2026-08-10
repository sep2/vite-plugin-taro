import type { HookHandler, Plugin, PluginOption } from 'vite'

type TransformHook = HookHandler<NonNullable<Plugin['transform']>>
export type TransformHookResult = Awaited<ReturnType<TransformHook>>
export type AsyncTransformHook = (
    this: ThisParameterType<TransformHook>,
    ...args: Parameters<TransformHook>
) => Promise<TransformHookResult>
export type TransformHookWrapper = (transform: AsyncTransformHook) => AsyncTransformHook

export type PluginMapper = (plugin: Plugin) => Plugin

/** Transforms every concrete plugin while preserving nested arrays, falsy options, and promised options. */
export function transformVitePlugin(pluginOptions: PluginOption[], mapPlugin: PluginMapper): PluginOption[] {
    return pluginOptions.map((option) => transformPluginOption(option, mapPlugin))
}

function transformPluginOption(option: PluginOption, mapPlugin: PluginMapper): PluginOption {
    if (option instanceof Promise) {
        return option.then((resolvedOption) => transformPluginOption(resolvedOption, mapPlugin))
    }

    if (Array.isArray(option)) {
        return transformVitePlugin(option, mapPlugin)
    }

    return isPlugin(option) ? mapPlugin(option) : option
}

function isPlugin(option: PluginOption): option is Plugin {
    return (
        option !== null &&
        option !== false &&
        option !== undefined &&
        typeof option === 'object' &&
        !Array.isArray(option) &&
        'name' in option
    )
}

/**
 * Clones a Vite transform hook with middleware that controls execution of the original handler.
 *
 * Function and object hook forms retain their original plugin context. Object metadata such as `order` and `filter` is copied
 * unchanged, and the input descriptor is never mutated. The wrapper receives the normalized asynchronous transform with its
 * complete plugin context, code, ID, and metadata signature, and returns the handler that continues Vite's plugin pipeline.
 */
export function wrapPluginTransform(plugin: Plugin, wrapper: TransformHookWrapper): Plugin {
    const { transform } = plugin

    if (!transform) {
        throw new Error(`${plugin.name} must expose a transform hook`)
    }

    const isTransformFunction = typeof transform === 'function'

    const handler = isTransformFunction ? transform : transform.handler

    const wrappedHandler = wrapper(async function (code, id, meta) {
        return handler.call(this, code, id, meta)
    })

    return {
        ...plugin,
        transform: isTransformFunction ? wrappedHandler : { ...transform, handler: wrappedHandler }
    }
}
