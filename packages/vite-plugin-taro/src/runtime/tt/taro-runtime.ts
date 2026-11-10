import { mergeReconciler } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-tt/runtime'
import { withPageRootProperty } from '../mini/template/with-page-root-property.ts'

// Recursive TTML carries the independent Page root through both comp and CustomWrapper.
mergeReconciler({ modifyRecursiveComponentConfig: withPageRootProperty })
