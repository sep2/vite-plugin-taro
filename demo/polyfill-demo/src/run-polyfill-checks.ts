import { polyfillCases } from './polyfill-cases.ts'

/** Isolates failures so a missing global never prevents the remaining checks from running. */
export async function runPolyfillChecks() {
    return Promise.all(
        polyfillCases.map(async ({ module, name, check }) => {
            try {
                const passed = await check()
                return { module, name, passed, detail: passed ? 'OK' : 'Unexpected result' }
            } catch (error) {
                return { module, name, passed: false, detail: error instanceof Error ? error.message : String(error) }
            }
        })
    )
}
