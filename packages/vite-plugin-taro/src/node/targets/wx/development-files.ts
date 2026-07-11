/** Plugin-owned files added only to a WX development output. */
export const wxDevelopmentDirectory = 'vpt-hmr'

/** App-only metadata containing the local transport URL, token, and build ID. */
export const wxUpdateControlFile = `${wxDevelopmentDirectory}/control.js`

/** Stable page-component initialization required before replaying retained updates. */
export const wxPagePreloadFile = `${wxDevelopmentDirectory}/preload.js`

/** The one mutable, literal JavaScript update dependency required by every page. */
export const wxUpdateFile = `${wxDevelopmentDirectory}/update.js`
