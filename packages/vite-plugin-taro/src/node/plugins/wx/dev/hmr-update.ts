export const hmrUpdateFileName = 'hmr/update.js'

/** The initial update module must be valid and inert until DevHost publishes the first patch. */
export function renderInitialHmrUpdate(): string {
    return 'module.exports = undefined;\n'
}
