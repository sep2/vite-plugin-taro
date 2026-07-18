// Keep recursive Component activation behind the same App initialization barrier as Page activation.
import './app-module.ts'

import { createRecursiveComponentConfig } from './taro-runtime.ts'

const componentConfig = createRecursiveComponentConfig('comp') as {
    methods?: Record<string, unknown>
}

if (!componentConfig.methods) {
    throw new Error('Expected methods from the Taro recursive component configuration')
}

export default componentConfig.methods
