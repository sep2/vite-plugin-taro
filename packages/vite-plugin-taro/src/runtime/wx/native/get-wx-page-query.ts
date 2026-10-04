/// <reference types="vite/client" />

type BeforePageLoadListener = (event: { query: Record<string, unknown> }) => void

declare const wx: {
    onBeforePageLoad(listener: BeforePageLoadListener): void
    offBeforePageLoad(listener: BeforePageLoadListener): void
}

// WX Page shells share one listener and the latest query supplied by native routing.
let pageQuery: Record<string, unknown>

if ('onBeforePageLoad' in wx) {
    const capturePageQuery: BeforePageLoadListener = ({ query }) => {
        pageQuery = query
    }

    wx.onBeforePageLoad(capturePageQuery)

    if (import.meta.hot) {
        import.meta.hot.dispose(() => wx.offBeforePageLoad(capturePageQuery))
    }
}

/** Reads the complete native query for the Page instance currently being created. */
export function getWxPageQuery(): Record<string, unknown> {
    return pageQuery
}
