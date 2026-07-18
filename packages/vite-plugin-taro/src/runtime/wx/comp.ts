import { createNativeShell } from './bootstrap.ts'

const methods = createNativeShell({
    moduleName: 'Component',
    loadModule: () => import('./comp-module.ts'),
    methods: ['eh'] as const,
    properties: {}
})

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
