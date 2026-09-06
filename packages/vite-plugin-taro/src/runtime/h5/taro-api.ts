/**
 * The default export is an ESM namespace, not an assembled API object. Rolldown resolves static member reads directly to
 * exports, so Taro.showToast(), Taro['showToast'](), and named imports all tree-shake without an application transform.
 * The namespace is read-only; shared mutable runtime state remains inside exported objects such as options and eventCenter.
 */
export * from './taro-api-exports.ts'
export * as default from './taro-api-exports.ts'
