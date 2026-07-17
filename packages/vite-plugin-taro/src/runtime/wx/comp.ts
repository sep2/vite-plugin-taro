import { createNativeConfig } from './bootstrap.ts'

const componentMethods = ['eh'] as const
const loadComponentModule = () => import('./comp-module.ts')
const methods = createNativeConfig('Component', loadComponentModule, componentMethods, {})

Component({
    properties: {
        i: Object,
        l: String
    },
    options: {
        virtualHost: true
    },
    methods
})
