import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

/** WX/TT register Taro's lifecycle and event methods under Component.methods. */
export default function miniPageComponentConstructor(config: PageInstance): void {
    const { data, options, ...methods } = config
    Component({ data, options, methods })
}
