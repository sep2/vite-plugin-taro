import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { createMiniTargetPlugins } from '../mini/create-mini-target-plugins.ts'

/** Adapts the shared Mini Program pipeline to the WX public target. */
export function createWxTargetPlugins(options: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(options)
}
