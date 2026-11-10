import { hooks, mergeReconciler } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-xhs/runtime'
import { withPageRootProperty } from '../mini/template/with-page-root-property.ts'

// XHS validates native property types; both recursive boundaries declare the independent Page root.
mergeReconciler({ modifyRecursiveComponentConfig: withPageRootProperty })

// Sharing callbacks affect XHS's native menu and must follow Taro's explicit Page/component opt-in policy.
hooks.tap('getMiniLifecycle', (config) => {
    const [onLoad, onUnload, onReady, onShow, onHide, lifecycles, sideEffects] = config.page
    return {
        ...config,
        page: [onLoad, onUnload, onReady, onShow, onHide, [...lifecycles, 'onCopyUrl'], [...sideEffects, 'onShareChat']]
    }
})
