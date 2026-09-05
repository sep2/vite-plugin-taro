import path from 'node:path'
import type { Rolldown } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { createAppConfig, getPageConfig } from '../../../utils/project-config.ts'
import type { MiniJsonObject, MiniNativeComponentRegistration, MiniPage } from '../mini-contract.ts'
import { isGeneratedSubpackageFile } from '../placer/placement.ts'

/*
 * Shared native-template model
 * ============================
 *
 * Every native Page owns two independent compact-data roots:
 *
 *     app  -> the singleton App projection broadcast to mounted Pages
 *     page -> the React Page root mounted for one native Page instance
 *
 * `comp` is the generic recursive rendering boundary. Its `i` property always contains one compact node: `nn` selects a native
 * template, `cn` contains compact children, and real host records carry stable `sid` values for keys and event lookup. The target
 * skeleton supplies a transparent `vpt_fragment` when the App has multiple roots, then supplies `vpt_page_outlet` at the exact
 * App `{children}` position. The outlet inserts Page-owned rendering without copying Page nodes into `app`.
 *
 * `comp.json` and `custom-wrapper.json` must register every native component that their imported base templates can instantiate.
 * Each Page must register the same native components plus the generated `comp` and CustomWrapper boundaries. Caller registrations
 * are preserved, but compiler-owned names override collisions so generated template references cannot point somewhere else.
 * Cross-package native components also receive a `view` placeholder while their generated package loads; main-package components
 * do not need one. These invariants are identical across native template dialects, so the pure functions below construct only
 * their shared metadata and leave syntax, file layout, and template scope to each target skeleton.
 */

const customWrapperName = 'custom-wrapper'

/** Component-selection input accepted by each pinned native template implementation. */
export type SkeletonTemplateComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

/** Native registrations shared by Page, recursive-component, and CustomWrapper configuration. */
export type SkeletonNativeComponentConfig = {
    usingComponents: Record<string, string>
    componentPlaceholder: Record<string, string>
}

/** Creates application configuration with generated package declarations appended by the target skeleton. */
export function createSkeletonAppJson(options: VptOptions, subpackages: readonly MiniJsonObject[]): MiniJsonObject {
    return {
        ...createAppConfig(options),
        ...(subpackages.length > 0 ? { subPackages: subpackages } : {})
    }
}

/** Creates a Page config while preserving caller fields and registering every generated rendering boundary. */
export function createSkeletonPageJson(
    page: MiniPage,
    nativeComponents: SkeletonNativeComponentConfig
): MiniJsonObject {
    const config = getPageConfig(page)
    const usingComponents = isJsonObject(config.usingComponents) ? config.usingComponents : {}
    const componentPlaceholder = isJsonObject(config.componentPlaceholder) ? config.componentPlaceholder : {}
    const hasNativeComponentPlaceholder = Object.keys(nativeComponents.componentPlaceholder).length > 0

    return {
        ...config,
        usingComponents: {
            ...usingComponents,
            ...nativeComponents.usingComponents,
            comp: toRootRelativePath(page.path, 'comp'),
            [customWrapperName]: toRootRelativePath(page.path, customWrapperName)
        },
        ...(hasNativeComponentPlaceholder
            ? {
                  componentPlaceholder: {
                      ...componentPlaceholder,
                      ...nativeComponents.componentPlaceholder
                  }
              }
            : {})
    }
}

/** Creates the recursive component config shared by comp and CustomWrapper. */
export function createRecursiveComponentJson(nativeComponents: SkeletonNativeComponentConfig): MiniJsonObject {
    const hasNativeComponentPlaceholder = Object.keys(nativeComponents.componentPlaceholder).length > 0

    return {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            ...nativeComponents.usingComponents,
            comp: './comp',
            [customWrapperName]: `./${customWrapperName}`
        },
        ...(hasNativeComponentPlaceholder ? { componentPlaceholder: nativeComponents.componentPlaceholder } : {})
    }
}

/** Creates native registrations and asynchronous-package placeholders from discovered component interfaces. */
export function createNativeComponentConfig(
    nativeComponents: readonly MiniNativeComponentRegistration[]
): SkeletonNativeComponentConfig {
    // Component paths are root-absolute, so remove the leading slash before checking the output-relative package prefix.
    return {
        usingComponents: Object.fromEntries(nativeComponents.map(({ name, componentPath }) => [name, componentPath])),
        componentPlaceholder: Object.fromEntries(
            nativeComponents.flatMap(({ name, componentPath }) =>
                isGeneratedSubpackageFile(componentPath.slice(1)) ? ([[name, 'view']] as const) : []
            )
        )
    }
}

/** Collects reachable host exports and native JSX fields for one native template implementation. */
export function collectTemplateComponentConfig(
    bundle: Rolldown.OutputBundle,
    componentsModulePath: string,
    nativeComponents: readonly MiniNativeComponentRegistration[]
): SkeletonTemplateComponentConfig {
    const components = findBundleModule(bundle, componentsModulePath)
    const renderedComponentNames = (components?.renderedExports ?? []).map(toDashed)

    return {
        includes: new Set([
            'view',
            'catch-view',
            'static-view',
            'pure-view',
            'click-view',
            'scroll-view',
            'image',
            'static-image',
            'text',
            'static-text',
            ...renderedComponentNames.filter((name) => name !== customWrapperName)
        ]),
        exclude: new Set(),
        thirdPartyComponents: new Map<string, Set<string>>([
            [customWrapperName, new Set<string>()],
            ...nativeComponents.map((component) => [component.name, new Set(component.fields)] as const)
        ]),
        includeAll: false
    }
}

/** Creates compact production JSON and readable development JSON. */
export function createJsonAsset(fileName: string, value: MiniJsonObject, isProduction: boolean): Rolldown.EmittedAsset {
    return createTextAsset(fileName, isProduction ? JSON.stringify(value) : `${JSON.stringify(value, null, 4)}\n`)
}

/** Creates one emitted text asset. */
export function createTextAsset(fileName: string, source: string): Rolldown.EmittedAsset {
    return { type: 'asset', fileName: fileName, source: source }
}

/** Replaces one pinned upstream fragment and rejects absent or duplicated source contracts. */
export function replaceExactlyOnce(source: string, current: string, replacement: string, description: string): string {
    const firstIndex = source.indexOf(current)
    const duplicateIndex = firstIndex === -1 ? -1 : source.indexOf(current, firstIndex + current.length)
    if (firstIndex === -1 || duplicateIndex !== -1) {
        throw new Error(`Expected one ${description}, found ${firstIndex === -1 ? 0 : 'multiple'}`)
    }
    return `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + current.length)}`
}

/** Creates a Page-relative path to a file emitted at the Mini Program output root. */
export function toRootRelativePath(pagePath: string, rootFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(pagePath), rootFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

/** Finds one physical module in final chunk metadata. */
function findBundleModule(bundle: Rolldown.OutputBundle, resolvedId: string): Rolldown.RenderedModule | undefined {
    const normalizedResolvedId = normalizeModuleId(resolvedId)
    for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
            continue
        }
        const found = Object.entries(output.modules).find(([id]) => normalizeModuleId(id) === normalizedResolvedId)
        if (found) {
            return found[1]
        }
    }
}

/** Converts a component export name to its native dashed host name. */
function toDashed(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Tests whether a configured JSON value can be merged as an object. */
function isJsonObject(value: unknown): value is MiniJsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
