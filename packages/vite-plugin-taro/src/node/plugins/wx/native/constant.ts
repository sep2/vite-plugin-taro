import { resolvePackageFile } from '../../../utils/packages.ts'

/** Maps the App module's private import to the configured application component. */
export const appComponentId = '\0vpt:app'

/** Lets generated Page modules depend on App-module initialization through the normal module graph. */
export const appModulePath = resolvePackageFile('dist/runtime/wx/app-module.js')

/** Forces the native App shell entry to emit at WeChat's required root path. */
export const appShellFileName = 'app.js'

/** Provides the synchronous native App registration entry. */
export const appShellPath = resolvePackageFile('dist/runtime/wx/app.js')

/** Identifies the shared native runtime that initializes SystemJS and serves both shell entry types. */
export const bootstrapPath = resolvePackageFile('dist/runtime/wx/bootstrap.js')

/** Gives every Page shell one private dynamic-import target that can be resolved using its route. */
export const pageModuleId = '\0vpt:page-module'

/** Gives each generated Page module a distinct and stable route-qualified module ID. */
export const pageModuleIdPrefix = `${pageModuleId}/`

/** Provides the reusable synchronous native Page registration entry. */
export const pageShellPath = resolvePackageFile('dist/runtime/wx/page.js')

/** Redirects Vite's injected browser preload helper to the bootstrap identity loader. */
export const vitePreloadId = '\0vite/preload-helper.js'
