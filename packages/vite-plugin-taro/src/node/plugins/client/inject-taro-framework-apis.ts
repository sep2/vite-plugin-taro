import { packageRequire } from '../../utils/packages.ts'

const apiLoader: (source: string) => string = packageRequire('@tarojs/plugin-framework-react/dist/api-loader')

/**
 * Applies Taro React's standard source-to-source API loader. It imports the framework lifecycle hooks, assigns them to
 * the facade's `taro` object, and emits matching named exports; keeping the hook inventory owned by Taro avoids drift.
 */
export function injectTaroFrameworkApis(source: string): string {
    return apiLoader(source)
}
