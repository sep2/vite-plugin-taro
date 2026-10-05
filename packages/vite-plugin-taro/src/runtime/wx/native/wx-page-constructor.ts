import type { createPageConfig } from '../../mini/capsule/create-page-config.ts'
import miniPageConstructor from '../../mini/native/mini-page-constructor.ts'
import { prerenderToData } from './prerender-to-data.ts'

/** Adapts the ordinary Taro config to WX's per-instance native data factory. */
export default function wxPageConstructor(config: ReturnType<typeof createPageConfig>): void {
    if (!config.__vpt_meta.prerender) {
        miniPageConstructor(config)
        return
    }

    // Keep the capsule's data object and private metadata intact; only native registration receives the factory.
    Page({
        ...config,
        data: () => (config.__vpt_meta.skipPrerender ? config.data : prerenderToData(config))
    })
}
