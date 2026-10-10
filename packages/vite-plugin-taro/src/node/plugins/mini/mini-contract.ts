import type { ResolvedConfig, Rolldown } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../options.ts'

/** Taro compiler bindings selected by one Mini Program target. */
export type TaroContract = {
    /** Renderer host selected by the target and presentation option. */
    hostPath: string
    env: string
    componentsReactPath: string
    targetRuntimePath: string
}

/** Development runtimes selected once by the target. */
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

/** Conditional JSON fields merged into one emitted asset. */
export type OverrideContract = Readonly<{
    apply: (config: ResolvedConfig) => boolean
    /** Output-relative asset filename. */
    name: string
    content: VptJsonObject
}>

/** Complete input consumed by the shared Mini Program pipeline. */
export type MiniContract = {
    options: VptOptions
    /** Build-time expressions supplied by the target, overriding shared defaults. */
    define: Record<string, string>
    taro: TaroContract
    runtime: RuntimeContract
    styles: StyleContract
    output: OutputContract
    /** Applied in declaration order after project-skeleton emission. */
    override: readonly OverrideContract[]
}

/** Application JSON represented by the current Mini Program contract. */
export type MiniJsonObject = VptJsonObject

/** One Page represented by the current Mini Program contract. */
export type MiniPage = MiniContract['options']['pages'][number]

/** HMR configuration represented by the current Mini Program contract. */
export type MiniHmrOptions = MiniContract['options']['hmr']
