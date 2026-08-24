// Keep generated recursive component activation behind the same App initialization barrier as Page activation.
import './app.ts'

import { createRecursiveComponentConfig } from './taro-runtime.ts'

export const componentConfig = createRecursiveComponentConfig('comp')
export const customWrapperConfig = createRecursiveComponentConfig('custom-wrapper')
