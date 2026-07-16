import { toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'

export const appComponentId = '\0vpt:app'
export const appShellFileName = 'app.js'

export const appShellPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/app.js'))
