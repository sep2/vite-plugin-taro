import { randomUUID } from 'node:crypto'

export const hmrInfoFileName = 'hmr/info.js'

/** Metadata shared by DevHost and the DevRuntime through synchronous CommonJS hmr/info.js. */
export type LegacyHmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** Creates one unique HMR metadata record for a DevHost lifetime. */
export function createHmrInfo(endpoint: string): LegacyHmrInfo {
    return {
        buildId: randomUUID(),
        endpoint
    }
}

/** Renders the App-loaded HMR metadata module. It must remain CommonJS because native app.js loads it synchronously. */
export function renderHmrInfo(info: LegacyHmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});
`
}
