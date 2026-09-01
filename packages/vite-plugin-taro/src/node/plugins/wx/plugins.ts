import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import type { MiniContract } from '../mini/mini-contract.d.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'

/** Adapts the shared Mini Program pipeline to the WX public target. */
export function createWxMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createMiniContract(vptOptions))
}

/** Creates the shared Mini Program contract for a WX target invocation. */
export function createMiniContract(vptOptions: VptOptions): MiniContract {
    return vptOptions
}
