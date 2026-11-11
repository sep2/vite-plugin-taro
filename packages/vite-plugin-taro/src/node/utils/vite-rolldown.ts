import { createRequire } from 'node:module'

// Vite's native plugins and MagicString use constructor identity; every compiler boundary shares its physical instance.
const viteRequire = createRequire(import.meta.resolve('vite'))

const rolldown: typeof import('rolldown') = viteRequire('rolldown')
export const { build, RUNTIME_MODULE_ID } = rolldown
export const RolldownMagicString: typeof import('rolldown').RolldownMagicString = rolldown.RolldownMagicString
export type RolldownMagicString = import('rolldown').RolldownMagicString

export const { dev, viteReporterPlugin, viteTransformPlugin }: typeof import('rolldown/experimental') =
    viteRequire('rolldown/experimental')

// The emitted HMR runtime must implement the protocol of the engine producing its module factories.
export const rolldownRuntimePath = viteRequire.resolve('rolldown/experimental/runtime')
