import fs from 'node:fs'
import { resolvePackageFile } from '../../../../utils/packages.ts'
import { rolldownRuntimeId } from '../../module.ts'

const devRuntimePath = resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js')
const devRuntimeSource = fs.readFileSync(devRuntimePath, 'utf8')

// Rolldown's generated development modules reference this lexical binding. Native and SystemJS-rendered chunks cannot
// import a browser HMR client, so every physical development chunk binds it to the one runtime installed on `global`.
export const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

/** Appends the compiled wx host after Rolldown's pre-ordered HMR transform defines the lexical DevRuntime base class. */
export function injectDevRuntime(code: string, id: string): string | undefined {
    if (id === rolldownRuntimeId) {
        return `${code}\n${devRuntimeSource}`
    }
}
