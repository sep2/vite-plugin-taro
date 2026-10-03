import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

/** WX registers Taro's lifecycle and event methods under Component.methods. */
export default function wxPageConstructor(config: PageInstance): void {
    const { data, options, ...methods } = config
    Component({ data, options, methods })
}
