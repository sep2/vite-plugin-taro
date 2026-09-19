import { mergeReconciler } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-tt/runtime'

type RecursiveComponentConfig = Readonly<{
    properties: Readonly<Record<string, unknown>>
}>

// TT requires declared native properties. Retain the stock lifecycle/events/options and add the independent Page root
// to both comp and CustomWrapper; recursive TTML forwards p without placing Page nodes inside the shared App tree.
mergeReconciler({
    modifyRecursiveComponentConfig(config: RecursiveComponentConfig) {
        return {
            ...config,
            properties: {
                ...config.properties,
                p: { type: Object, value: { cn: [] } }
            }
        }
    }
})
