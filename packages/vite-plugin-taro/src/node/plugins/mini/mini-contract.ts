import type { Rolldown } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../options.ts'

/** Taro compiler bindings selected by one Mini Program target. */
export type TaroContract = {
    env: string
    componentsReactPath: string
    targetRuntimePath: string
}

/** Target-specific development runtimes; shared Mini entry IDs live beside their source modules. */
export type RuntimeContract = {
    devtoolsHmrRuntime: string
    interpreterHmrRuntime: string
}

/** Style output names selected by one Mini Program target. */
export type StyleContract = {
    appFileName: string
    globalFileName: string
}

/** Native component registration discovered from the final Mini Program graph. */
export type MiniNativeComponentRegistration = Readonly<{
    name: string
    componentPath: string
    fields: readonly string[]
}>

/** Graph-retained generated code package awaiting target-specific declaration. */
export type MiniGeneratedSubpackage = Readonly<{
    root: string
}>

/** Complete final-graph input supplied to one target's project-skeleton generator. */
export type MiniProjectSkeletonInput = Readonly<{
    bundle: Rolldown.OutputBundle
    subpackages: readonly MiniGeneratedSubpackage[]
    nativeComponents: readonly MiniNativeComponentRegistration[]
    isProduction: boolean
}>

/** Target-owned native project filenames and project-skeleton generator. */
export type OutputContract = {
    projectConfigFilename: string
    projectPrivateConfigFilename: string
    generateProjectSkeleton(input: MiniProjectSkeletonInput, contract: MiniContract): Rolldown.EmittedAsset[]
}

/** Native project config fields overridden only in physical build-watch output. */
export type WatchContract = {
    override: Readonly<Record<string, VptJsonObject>>
}

/** Complete input consumed by the shared Mini Program pipeline. */
export type MiniContract = {
    options: VptOptions
    taro: TaroContract
    runtime: RuntimeContract
    styles: StyleContract
    output: OutputContract
    watch: WatchContract
}

/** Application JSON represented by the current Mini Program contract. */
export type MiniJsonObject = VptJsonObject

/** One Page represented by the current Mini Program contract. */
export type MiniPage = MiniContract['options']['pages'][number]

/** HMR configuration represented by the current Mini Program contract. */
export type MiniHmrOptions = MiniContract['options']['hmr']
