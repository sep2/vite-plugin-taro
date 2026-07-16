import { toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'

export const appShellFileName = 'app.js'

export const appShellImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/app.js'))
