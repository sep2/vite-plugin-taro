import type { EmittedFile } from 'rolldown'

export const hmrUpdateFileName = 'hmr/update.js'

/** The initial update module must be valid and inert until DevHost publishes the first patch. */
function renderInitialHmrUpdate(): string {
    return 'module.exports = undefined;\n'
}

/** Creates the initial Rollup asset owned by the DevEngine's physical build. */
export function createInitialHmrUpdateAsset(): EmittedFile {
    return {
        type: 'asset',
        fileName: hmrUpdateFileName,
        source: renderInitialHmrUpdate()
    }
}
