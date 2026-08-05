// Keep recursive Component activation behind the same App initialization barrier as Page activation.
import './app.ts'

import { createRecursiveComponentConfig } from './taro-runtime.ts'

export default createRecursiveComponentConfig('comp')
