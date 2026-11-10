import { mergeReconciler } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-xhs/runtime'
import { withPageRootProperty } from '../mini/template/with-page-root-property.ts'

// XHS validates native property types; both recursive boundaries declare the independent Page root.
mergeReconciler({ modifyRecursiveComponentConfig: withPageRootProperty })
