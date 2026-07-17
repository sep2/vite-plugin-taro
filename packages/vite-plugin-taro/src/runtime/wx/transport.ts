type ModuleLoader = () => System.Registration

/** Replaced with the finalized table of literal capsule loaders. */
declare const __VITE_PLUGIN_TARO_MODULES__: Record<string, ModuleLoader>

export const modules = __VITE_PLUGIN_TARO_MODULES__
