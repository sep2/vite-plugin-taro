import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

// Ordinary pages accept Taro's config directly. Alias the native function without shadowing it or adding a forwarding wrapper.
const miniPageConstructor: (config: PageInstance) => void = Page

export default miniPageConstructor
