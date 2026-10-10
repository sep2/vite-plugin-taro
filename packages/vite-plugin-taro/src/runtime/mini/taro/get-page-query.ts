/// <reference types="vite/client" />

type BeforePageLoadListener = (event: { query: Record<string, unknown> }) => void

declare const wx: {
    onBeforePageLoad(listener: BeforePageLoadListener): void
    offBeforePageLoad(listener: BeforePageLoadListener): void
}

// Taro prerendering shares one WX listener and the latest query supplied by native routing.
let pageQuery: Record<string, unknown>

if (typeof wx !== 'undefined' && typeof wx.onBeforePageLoad === 'function') {
    const capturePageQuery: BeforePageLoadListener = ({ query }) => {
        pageQuery = query
    }

    wx.onBeforePageLoad(capturePageQuery)

    if (import.meta.hot) {
        import.meta.hot.dispose(() => wx.offBeforePageLoad(capturePageQuery))
    }
}

/** Reads the complete native query for the Page instance currently being created. */
export function getPageQuery(): Record<string, unknown> {
    return pageQuery
}
