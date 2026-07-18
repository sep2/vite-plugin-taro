import crypto from 'node:crypto'

// Keep both identities stable: native App/Page banners contain literal require() paths and WeChat DevTools observes
// update.js as the executable hot-update boundary.
export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/**
 * Creates the two development assets emitted by the normal initial generateBundle lifecycle.
 *
 * control.js is synchronous CommonJS because app.js requires it before any capsule executes. The endpoint and token are
 * placeholders for the metadata protocol. update.js is valid but inert until the future publisher atomically replaces
 * it with one native executable patch.
 */
export function createWxDevelopmentFiles(): Array<{
    type: 'asset'
    fileName: string
    source: string
}> {
    return [
        {
            type: 'asset',
            fileName: controlFileName,
            // A cold materialization receives a fresh identity; a runtime must never accept an update for another heap.
            source: `module.exports = Object.freeze(${JSON.stringify({
                buildId: crypto.randomUUID(),
                endpoint: '',
                token: ''
            })});\n`
        },
        {
            type: 'asset',
            fileName: updateFileName,
            source: 'module.exports = undefined;\n'
        }
    ]
}
