import type { MiniContract } from '../../mini-contract.ts'
import type { createResolver } from '../../resolve/resolver.ts'
import { createMiniStylePlugin, type MiniStylePlugin } from '../plugins.ts'

/** Supplies test-owned graph entries to the production style adapter at the compiler's renderStart boundary. */
export function createMiniStyleFixturePlugin(
    contract: Pick<MiniContract, 'styles'>,
    entries: Pick<ReturnType<typeof createResolver>, 'appEntry' | 'pageEntries'>
): MiniStylePlugin {
    const styles = createMiniStylePlugin(contract)
    return {
        ...styles,
        renderStart() {
            return styles.bindEntries(this, entries)
        }
    }
}
