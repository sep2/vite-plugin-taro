import { resolvePackageFile } from '../../../utils/packages.ts'

/** Identifies the shared native runtime that initializes SystemJS and serves both shell entry types. */
export const bootstrapPath = resolvePackageFile('dist/runtime/wx/bootstrap.js')

/** Identifies the native transport entry materialized before Rollup finalizes content hashes. */
export const transportPath = resolvePackageFile('dist/runtime/wx/transport.js')

/** Redirects Vite's injected browser preload helper to the bootstrap identity loader. */
export const vitePreloadId = '\0vite/preload-helper.js'

/** Forces the native App shell entry to emit at WeChat's required root path. */
export const appShellFileName = 'app.js'

/** Provides the synchronous native App registration entry. */
export const appShellPath = resolvePackageFile('dist/runtime/wx/app.js')

/** Forces Taro's recursive native component entry to emit at its configured root path. */
export const componentShellFileName = 'comp.js'

/** Provides the synchronous recursive component registration entry. */
export const componentShellPath = resolvePackageFile('dist/runtime/wx/comp.js')

/** Resolves the configured Page component from its route-qualified importing module. */
export const pageComponentId = '\0vpt:page-component'

/** Gives every Page shell one private dynamic-import target that can be resolved using its route. */
export const pageModuleId = '\0vpt:page-module'

/** Provides the real Page module specialized through a stable route query. */
export const pageModulePath = resolvePackageFile('dist/runtime/wx/page-module.js')

/** Provides the reusable synchronous native Page registration entry. */
export const pageShellPath = resolvePackageFile('dist/runtime/wx/page.js')
