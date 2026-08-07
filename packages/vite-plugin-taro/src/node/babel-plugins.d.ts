declare module '@babel/plugin-transform-dynamic-import' {
    import type { PluginTarget } from '@babel/core'

    const transformDynamicImport: PluginTarget
    export default transformDynamicImport
}

declare module '@babel/plugin-transform-modules-commonjs' {
    import type { PluginTarget } from '@babel/core'

    const transformModulesCommonjs: PluginTarget
    export default transformModulesCommonjs
}

declare module '@babel/plugin-transform-modules-systemjs' {
    import type { PluginTarget } from '@babel/core'

    const transformModulesSystemjs: PluginTarget
    export default transformModulesSystemjs
}
