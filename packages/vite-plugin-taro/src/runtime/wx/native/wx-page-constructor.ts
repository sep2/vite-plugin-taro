import type { createPageConfig } from '../../mini/capsule/create-page-config.ts'
import { prerenderToData } from './prerender-to-data.ts'

declare function Component(): {
    options(options: object): ReturnType<typeof Component>
    data(factory: () => Record<string, unknown>): ReturnType<typeof Component>
    methods(methods: object): ReturnType<typeof Component>
    register(): void
}

/** Adapts the ordinary Taro config to WX's per-instance native data factory. */
export default function wxPageConstructor(config: ReturnType<typeof createPageConfig>): void {
    // Non-enumerable __vpt_meta stays on config, outside the native lifecycle and event methods.
    const { data: _data, options, ...methods } = config

    Component()
        .options(options ?? {})
        .data(() => (config.__vpt_meta.skipPrerender ? config.data : prerenderToData(config)))
        .methods(methods)
        .register()
}
