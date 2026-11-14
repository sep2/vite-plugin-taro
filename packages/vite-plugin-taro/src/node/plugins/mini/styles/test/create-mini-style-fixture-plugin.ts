import type { MiniContract } from '../../mini-contract.ts'
import type { createResolver } from '../../resolve/resolver.ts'
import { createMiniStylePlugin, type MiniStylePlugin } from '../plugins.ts'

/** Supplies test-owned graph entries to the production style adapter at the compiler's buildStart boundary. */
export function createMiniStyleFixturePlugin(
    contract: Pick<MiniContract, 'styles'>,
    entries: ReturnType<typeof createResolver>['entries']
): MiniStylePlugin {
    const styles = createMiniStylePlugin(contract)
    return {
        ...styles,
        buildStart() {
            return styles.startBuild(this, entries)
        }
    }
}
