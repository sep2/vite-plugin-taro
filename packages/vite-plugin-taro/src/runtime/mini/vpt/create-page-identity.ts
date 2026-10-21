import { getPath, incrementId } from 'vite-plugin-taro-runtime/runtime/mini'

// The instance counter distinguishes concurrent Pages of the same route.
const pageId = incrementId()

/** Creates a unique Page key and its router parameters. */
export function createPageIdentity(route: string, query: Record<string, unknown> | undefined) {
    const params = { ...query, $taroTimestamp: Date.now() }
    const path = getPath(route, { $vptPage: pageId() })

    return { path, params }
}
