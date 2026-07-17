import { resolvePackageFile } from '../../utils/packages.ts'

/** Physical H5 App specialized for the configured application. */
export const h5AppPath = resolvePackageFile('dist/runtime/h5/app.js')
