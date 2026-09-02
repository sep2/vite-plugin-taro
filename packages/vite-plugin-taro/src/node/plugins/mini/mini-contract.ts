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

/** Runtime conventions selected by one Mini Program target. */
export type RuntimeContract = {
    globalObject: string
    modules: RuntimeModulesContract
}

/** Style output names selected by one Mini Program target. */
export type StyleContract = {
    appFileName: string
    globalFileName: string
}

/** Output planning constraints selected by one Mini Program target. */
export type OutputContract = {
    subpackagePlanningBudget: number
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
