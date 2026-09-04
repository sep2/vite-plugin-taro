import type { Rolldown } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../options.ts'

/** Taro compiler bindings selected by one Mini Program target. */
export type TaroContract = {
    env: string
    componentsReactPath: string
    platformRuntimePath: string
}

/** Physical runtime modules selected by one Mini Program target. */
export type RuntimeModulesContract = {
    bootstrap: string
    transport: string
    appShell: string
    appCapsule: string
    componentShell: string
    componentCapsule: string
    customWrapperShell: string
    pageShell: string
    pageCapsule: string
    devtoolsHmrRuntime: string
    interpreterHmrRuntime: string
}

/** Physical runtime selection for one Mini Program target. */
export type RuntimeContract = {
    modules: RuntimeModulesContract
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

/** One target-owned native project-skeleton generator. */
export type OutputContract = {
    generateProjectSkeleton(input: MiniProjectSkeletonInput): Rolldown.EmittedAsset[]
}

/** Complete input consumed by the shared Mini Program pipeline. */
export type MiniContract = {
    options: VptOptions
    taro: TaroContract
    runtime: RuntimeContract
    styles: StyleContract
    output: OutputContract
}

/** Application JSON represented by the current Mini Program contract. */
export type MiniJsonObject = VptJsonObject

/** One Page represented by the current Mini Program contract. */
export type MiniPage = MiniContract['options']['pages'][number]

/** HMR configuration represented by the current Mini Program contract. */
export type MiniHmrOptions = MiniContract['options']['hmr']
