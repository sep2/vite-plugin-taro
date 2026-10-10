import type { Plugin } from 'vite'
import { isMiniClientEnvironment } from '../dev/plugins.ts'
import type { MiniContract, MiniJsonObject } from '../mini-contract.ts'
import { recursiveMerge } from '../skeleton/recursive-merge.ts'
import { createJsonAsset } from '../skeleton/skeleton-utils.ts'

/** Applies target-selected JSON overrides after the Mini Program skeleton has been emitted. */
export function createMiniOverridePlugin(contract: Pick<MiniContract, 'override'>): Plugin {
    return {
        name: 'vpt:mini-override',
        enforce: 'post',
        applyToEnvironment: isMiniClientEnvironment,
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                for (const { name, content, apply } of contract.override) {
                    if (!apply(this.environment.config)) {
                        continue
                    }

                    const asset = bundle[name]
                    if (asset?.type !== 'asset') {
                        continue
                    }

                    const source =
                        typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)

                    const config: MiniJsonObject = JSON.parse(source)

                    // Mutate only this generation's asset; merging into a fresh record preserves contract content.
                    Object.assign(
                        asset,
                        createJsonAsset(name, recursiveMerge({}, config, content), this.environment.config.isProduction)
                    )
                }
            }
        }
    }
}
