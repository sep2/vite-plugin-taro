import type { VptOptions } from '../../../options.ts'

/**
 * Complete input consumed by the shared Mini Program pipeline.
 *
 * The initial boundary deliberately preserves VPT options unchanged. Platform adapters will move their WX and Alipay
 * differences into this contract as the shared pipeline becomes platform-neutral.
 */
export type MiniContract = VptOptions

/** Application JSON represented by the current Mini Program contract. */
export type MiniJsonObject = MiniContract['appJson']

/** One Page represented by the current Mini Program contract. */
export type MiniPage = MiniContract['pages'][number]

/** HMR configuration represented by the current Mini Program contract. */
export type MiniHmrOptions = MiniContract['hmr']
