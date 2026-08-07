import type { InputOptions } from 'rolldown'

type DevMode = NonNullable<NonNullable<InputOptions['experimental']>['devMode']>
type DevModeOptions = Exclude<DevMode, boolean>

/** Installs the custom WX runtime while restoring Rolldown's common runtime base. */
export function createWxDevMode(devMode: DevMode | undefined, implement: string): DevModeOptions {
    return {
        ...(typeof devMode === 'object' ? devMode : {}),
        implement,
        lazy: false,
        skipCommonRuntimeInjection: false
    }
}
